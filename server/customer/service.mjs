import { createCustomerAuth } from './auth.mjs'
import { customerResources, customerError } from './resources.mjs'
import { customerStorage } from './storage.mjs'
import { verifyPassword } from 'better-auth/crypto'
import { customerQuota } from './quota.mjs'

const responseHeaders = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer' }
const json = (value,status=200) => Response.json(value,{status,headers:responseHeaders})
const authGet = /^\/(?:get-session|ok|verify-email|reset-password\/[^/]+)$/
const authPost = new Set(['/sign-up/email','/sign-in/email','/sign-out','/request-password-reset','/reset-password','/send-verification-email'])

export function createCustomerService({ pool, secret, origin, mail, quotaConfig }) {
  const sql = { query:async(text,values)=>(await pool.query(text,values)).rows }
  const auth = createCustomerAuth(pool,{secret,origin,mail})
  const resources = customerResources(sql)
  const storage = customerStorage({pool,secret})
  const quota = customerQuota({pool,secret,...(quotaConfig?{config:quotaConfig}:{})})
  async function session(headers) {
    const state = await auth.api.getSession({headers:new Headers(headers)})
    if (!state?.user?.emailVerified) throw customerError('Du må logge inn.',401)
    return {...state.user,origin}
  }
  async function authorize(req) {
    if (!['GET','HEAD'].includes(req.method) && new Headers(req.headers).get('origin') !== origin) throw customerError('Ugyldig opprinnelse.',403)
    return session(req.headers)
  }
  const access = {
    authorize,
    owned:resources.owned,
    claimJob:storage.claimJob,
    jobCache:storage.jobCache,
    saveFile:storage.saveFile,
    quota,
    createFile:(user,title)=>resources.create(user,'files',{title}),
  }
  async function handle(request) {
    try {
      const url = new URL(request.url)
      if (url.origin !== origin) return json({error:'Ugyldig opprinnelse.'},403)
      if (!['GET','POST','PUT','DELETE'].includes(request.method)) return json({error:'Metoden støttes ikke.'},405)
      if (request.method !== 'GET' && request.headers.get('origin') !== origin) return json({error:'Ugyldig opprinnelse.'},403)
      if (url.pathname === '/api/customer/config' && request.method === 'GET') return json({enabled:true,registrationReady:mail.ready,recoveryEmailReady:mail.ready})
      if (url.pathname.startsWith('/api/customer/auth/')) {
        const path = url.pathname.slice('/api/customer/auth'.length)
        if (!(request.method==='GET'?authGet.test(path):request.method==='POST'&&authPost.has(path))) return json({error:'Metoden støttes ikke.'},404)
        if (['/sign-up/email','/request-password-reset','/send-verification-email'].includes(path) && !mail.ready) {
          return json({error:'E-posttjenesten er ikke klar. Prøv igjen senere.'},503)
        }
        const response = await auth.handler(request)
        for (const [key,value] of Object.entries(responseHeaders)) response.headers.set(key,value)
        return response
      }
      const user = await session(request.headers)
      if(url.pathname==='/api/customer/content') {
        if(request.method==='GET') return json(await storage.page(user,url.searchParams.get('cursor')||''))
        if(request.method==='PUT') return json(await storage.write(user,(await readJSON(request,3_000_000)).changes))
        return json({error:'Metoden støttes ikke.'},405)
      }
      const fileMatch=url.pathname.match(/^\/api\/customer\/files\/([^/]+)$/)
      if(fileMatch&&request.method==='GET') return json(await storage.file(user,fileMatch[1]))
      if(url.pathname==='/api/customer/account'&&request.method==='DELETE') {
        const body=await readJSON(request,1000)
        const [credential]=await sql.query('SELECT password FROM ft_customer_account WHERE "userId"=$1 AND "providerId"=\'credential\'',[user.id])
        if(typeof body.password!=='string'||body.password.length>128||!credential?.password||!await verifyPassword({password:body.password,hash:credential.password})) return json({error:'Passordet er feil.'},400)
        const response=await auth.handler(new Request(origin+'/api/customer/auth/sign-out',{method:'POST',headers:request.headers,body:'{}'}))
        await storage.deleteAccount(user)
        const result=json({deleted:true})
        for(const cookie of response.headers.getSetCookie()) result.headers.append('Set-Cookie',cookie)
        return result
      }
      if (url.pathname === '/api/customer/session' && request.method === 'GET') {
        const usage=await quota.summary(user)
        return json({user:{id:user.id,name:user.name,email:user.email,emailVerified:user.emailVerified},account:{plan:usage.plan},usage,recoveryEmailReady:mail.ready})
      }
      if(url.pathname==='/api/customer/usage'&&request.method==='GET')return json(await quota.summary(user))
      const match = url.pathname.match(/^\/api\/customer\/resources\/(projects|conversations|files|jobs)(?:\/([^/]+))?$/)
      if (!match) return json({error:'Innholdet finnes ikke.'},404)
      const [,kind,id] = match
      if (request.method==='GET') return json(id ? await resources.owned(user,kind,id) : {items:await resources.list(user,kind)})
      if(request.method==='DELETE'&&id) return json(await storage.remove(user,kind,id))
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Forventet JSON.'},415)
      const text = await request.text()
      if (Buffer.byteLength(text)>16000) return json({error:'Innholdet er for stort.'},413)
      let body
      try {body=JSON.parse(text)} catch {return json({error:'Ugyldig JSON.'},400)}
      if (!body || Array.isArray(body) || Object.keys(body).some(key=>!['id','title','projectId','conversationId'].includes(key))) return json({error:'Ugyldige felt.'},400)
      if (request.method==='POST'&&!id&&kind!=='jobs') return json(await storage.transaction(user,(_db,resources)=>resources.create(user,kind,body)),201)
      if (request.method==='PUT'&&id&&Object.keys(body).every(key=>key==='title')) return json(await resources.rename(user,kind,id,body.title))
      return json({error:'Metoden støttes ikke.'},405)
    } catch (error) {
      return json({error:error.status?error.message:'Kundetjenesten kunne ikke fullføre forespørselen.'},error.status??503)
    }
  }
  return {auth,resources,storage,quota,access,handle,session,origin}
}

async function readJSON(request,limit) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw customerError('Forventet JSON.',415)
  const text=await request.text()
  if(Buffer.byteLength(text)>limit) throw customerError('Innholdet er for stort.',413)
  try {const value=JSON.parse(text);if(!value||Array.isArray(value))throw Error();return value}
  catch {throw customerError('Ugyldig JSON.')}
}
