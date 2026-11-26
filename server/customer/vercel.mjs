import { customerRuntime } from './runtime.mjs'
import { customerOrigin } from './auth.mjs'

export function customerNodeHandler(handle,{origin=customerOrigin(),maxBytes=3_000_000}={}) {
  return async(req,res)=>{
    try {
      let size=0
      const chunks=[]
      for await(const chunk of req) {
        size+=chunk.length
        if(size>maxBytes){res.writeHead(413,{'Cache-Control':'no-store'});res.end();return}
        chunks.push(chunk)
      }
      const result=await handle(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}))
      res.statusCode=result.status
      for(const [key,value] of result.headers) if(key!=='set-cookie')res.setHeader(key,value)
      const cookies=result.headers.getSetCookie()
      if(cookies.length)res.setHeader('set-cookie',cookies)
      res.end(Buffer.from(await result.arrayBuffer()))
    } catch {
      res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'})
      res.end(JSON.stringify({error:'Kundetjenesten mangler serveroppsett eller er utilgjengelig.'}))
    }
  }
}

export default async function customer(req,res) {
  try { return await customerNodeHandler((await customerRuntime()).handle)(req,res) }
  catch {res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Kundetjenesten er utilgjengelig.'}))}
}
