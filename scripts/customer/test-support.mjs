import { migrateCustomers } from '../../server/customer/migrations.mjs'
import { createCustomerService } from '../../server/customer/service.mjs'
import { testDatabase } from '../admin/test-support.mjs'

export const origin='http://localhost:5173'
export const cookieOf=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
export const request=(path,body,cookie,method=body?'POST':'GET',site=origin)=>new Request(site+path,{
  method,headers:{origin:site,'content-type':'application/json',...(cookie?{cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
})

export async function customerDatabase({site=origin}={}) {
  const db=await testDatabase()
  await migrateCustomers(db.pool)
  const messages=[]
  const mail={ready:true,verify:async value=>messages.push({...value,purpose:'verify'}),reset:async value=>messages.push({...value,purpose:'reset'})}
  const service=createCustomerService({pool:db.pool,origin:site,secret:db.secret,mail})
  const call=(path,body,cookie,method)=>service.handle(request(path,body,cookie,method,site))
  async function register(email,name='Testkunde') {
    const password='Et langt testpassord 123!'
    const signup=await call('/api/customer/auth/sign-up/email',{email,name,password,plan:'paid',role:'admin'})
    if(signup.status!==200)throw Error('Registrering feilet: '+signup.status+' '+await signup.text())
    const verify=messages.findLast(value=>value.user.email===email&&value.purpose==='verify')
    const verified=await service.handle(new Request(verify.url))
    if(![200,302].includes(verified.status))throw Error('Bekreftelse feilet: '+verified.status+' '+await verified.text())
    const login=await call('/api/customer/auth/sign-in/email',{email,password})
    if(login.status!==200)throw Error('Innlogging feilet: '+login.status+' '+await login.text())
    return {cookie:cookieOf(login),password,user:(await login.json()).user}
  }
  return {...db,service,call,register,messages,mail}
}
