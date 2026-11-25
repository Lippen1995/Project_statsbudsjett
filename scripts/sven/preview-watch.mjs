import { getCache } from '@vercel/functions'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'
import { normalizeWatchTarget, readWatchTarget } from '../../server/sven/public-watch.mjs'

export function previewWatch({ environment = process.env.VERCEL_ENV,
  cache = getCache({ namespace:'fellestall-sven-preview-v1' }),
  read = async file=>JSON.parse(await snapshotLoaderForPreview(cache)(file)), fetchCase,
} = {}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store')
    const send=(status,body)=>res.status(status).json(body)
    if(environment!=='preview') return send(404,{error:'Sven preview er utilgjengelig.'})
    if(req.method!=='POST') return send(405,{error:'Metoden støttes ikke.'})
    if(req.headers.origin!==`https://${req.headers.host}` ||
        req.headers['content-type']?.split(';',1)[0]!=='application/json') return send(403,{error:'Bruk oppfølgingen i Sven-previewen.'})
    const targets=req.body?.targets
    if(!Array.isArray(targets)||!targets.length||targets.length>16||targets.some(target=>!normalizeWatchTarget(target))) {
      return send(400,{error:'Velg en kommune, en budsjettpost eller en stortingssak.'})
    }
    const sourceReads=new Map()
    const readOnce=file=>{
      if(!sourceReads.has(file)) sourceReads.set(file,read(file))
      return sourceReads.get(file)
    }
    const checked=await Promise.allSettled(targets.map(target=>readWatchTarget(target,{read:readOnce,fetchCase})))
    return send(200,{items:checked.map(item=>item.status==='fulfilled'?item.value:{error:item.reason?.message||'Kunne ikke sjekke oppfølgingen.'})})
  }
}
const loaders=new WeakMap()
function snapshotLoaderForPreview(cache) {
  if(!loaders.has(cache)) loaders.set(cache,snapshotLoader({cache}))
  return loaders.get(cache)
}
export default previewWatch()
