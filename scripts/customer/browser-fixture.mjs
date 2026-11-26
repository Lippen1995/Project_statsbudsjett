// Local-only fixture: isolated PostgreSQL and an in-memory mail sink. It never
// connects to production or sends email. This file is not a deployed entry point.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { customerDatabase } from './test-support.mjs'
import { customerNodeHandler } from '../../server/customer/vercel.mjs'
import { hostedPreview } from '../sven/hosted-preview.mjs'
import { previewFiles } from '../sven/preview-files.mjs'
import { previewWatch } from '../sven/preview-watch.mjs'

const directory=resolve(process.argv[2]||'/tmp/sven-customer-mobile')
const port=Number(process.argv[3]||4181)
const origin='http://127.0.0.1:'+port
const db=await customerDatabase({site:origin})
const storage=new Map(),cache={get:async key=>storage.get(key),set:async(key,value)=>storage.set(key,value)}
const jobs=new Map();let modelCalls=0
const options={environment:'preview',apiKey:'test-only',access:db.service.access,cache,
  publishJob:async(id,state)=>{jobs.set(id,{id,state:structuredClone(state)});if(state.brief.question!=='Lang undersøkelse')queueMicrotask(()=>drain(false))},
  createRequest:()=>async()=>{modelCalls++;return {content:[{type:'text',text:JSON.stringify({intent:{meaning:'Forklar kommunetallene',purpose:'Forstå offentlig økonomi',request:'Kontrollert nettlesertest'},action:'reply',reply:'Dette er et kontrollert testsvar til den innloggede kunden.'})}],usage:{input_tokens:10,output_tokens:10}}}}
async function drain(includeHeld) {
  for(const [id,job] of jobs) {
    if(!includeHeld&&job.state.brief.question==='Lang undersøkelse')continue
    jobs.delete(id);const result=await hostedPreview(options).work(id,job.state)
    if(result.status===202&&!result.body.background){jobs.set(id,job);setTimeout(()=>drain(includeHeld),20)}
  }
}
const sven=hostedPreview(options)
const files=previewFiles({environment:'preview',access:db.service.access,readVisual:()=>{throw Error('Visuell modell brukes ikke i denne testen')}})
const watch=previewWatch({environment:'preview',access:db.service.access})
const account=customerNodeHandler(db.service.handle,{origin})
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,origin)
    req.headers['x-vercel-forwarded-for']='127.0.0.1'
    if(url.pathname==='/__test/mail') {
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(db.messages.filter(message=>message.user.email===url.searchParams.get('email')).map(({url,purpose})=>({url,purpose}))));return
    }
    if(url.pathname==='/__test/release-jobs') {
      storage.clear();await drain(true);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({modelCalls,pending:jobs.size,publicCacheEntries:storage.size}));return
    }
    if(url.pathname.startsWith('/api/customer/'))return account(req,res)
    if(url.pathname.startsWith('/api/sven/')) {
      const chunks=[];for await(const chunk of req)chunks.push(chunk)
      req.body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined
      res.status=code=>{res.statusCode=code;return res};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
      const handler={'/api/sven/chat':sven,'/api/sven/file':files,'/api/sven/watch':watch}[url.pathname]
      if(handler)return await handler(req,res)
    }
    const file=resolve(directory,'.'+(url.pathname==='/'?'/index.html':url.pathname))
    if(!file.startsWith(directory+sep))throw Error('Ugyldig sti')
    if(!(await stat(file)).isFile())throw Error('Ikke en fil')
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))
  } catch {if(!res.headersSent)res.writeHead(404);res.end()}
})
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,origin})))
async function close(){server.close();await db.engine.close();process.exit(0)}
process.on('SIGTERM',close);process.on('SIGINT',close)
