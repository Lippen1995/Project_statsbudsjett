import {readFile} from 'node:fs/promises'
import {configuredRegistry} from '../../server/sven/learning-config.mjs'
import {runLearningCycle} from '../../server/sven/learning-cycle.mjs'
import {claudeTransport} from '../../server/sven/provider.mjs'
try {
  const path=process.argv[2]
  if(!path)throw new Error('Bruk: learn.mjs <aggregerte-feil.json>')
  const endpoint=new URL(process.env.SVEN_EVALUATOR_URL || '')
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||!process.env.SVEN_EVALUATOR_TOKEN)throw new Error('Konfigurer den uavhengige HTTPS-evaluatoren og tilgangstoken')
  const request=claudeTransport({onUsage:async usage=>console.error(JSON.stringify({phase:usage.phase,input:usage.input,output:usage.output,model:usage.model}))})
  const registry=await configuredRegistry()
  try {
    const result=await runLearningCycle({registry,request,signals:JSON.parse(await readFile(path,'utf8')),
      evaluate:async candidate=>{
        const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.SVEN_EVALUATOR_TOKEN},body:JSON.stringify(candidate),signal:AbortSignal.timeout(15*60_000)})
        if(!response.ok)throw new Error(`Evaluator svarte HTTP ${response.status}`)
        const body=await response.text()
        if(body.length>100000)throw new Error('Evalueringssvaret er for stort')
        return JSON.parse(body)
      },checkpoint:async event=>console.error(JSON.stringify(event))})
    console.log(JSON.stringify(result,null,2))
  }finally{registry.close()}
}catch(error){console.error(error.message);process.exitCode=1}
