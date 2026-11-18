import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { researchWithSven, researchVersion } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { digest } from '../../server/sven/benchmark.mjs'
import { activeLearningProfile } from '../../server/sven/learning-config.mjs'
import { usageSummary } from '../../server/sven/workspace.mjs'
const dataDir=fileURLToPath(new URL('../../web/public/data/',import.meta.url))
try {
  const [manifestPath,outputPath]=process.argv.slice(2)
  if (!manifestPath || !outputPath) throw new Error('Bruk: benchmark-run.mjs <manifest.json> <privat-svarfil.json>')
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  const manifestHash=digest(manifest)
  const profile=await activeLearningProfile()
  const output=resolve(outputPath)
  const lock=output+'.lock'
  claudeTransport()
  await writeFile(lock,String(process.pid),{flag:'wx',mode:0o600})
  const {unlink}=await import('node:fs/promises')
  try {
    let results=[]
    try {results=JSON.parse(await readFile(output,'utf8'))} catch(error) {if(error.code!=='ENOENT')throw error}
    if(!Array.isArray(results)||results.some(r=>r.manifestHash!==manifestHash||r.product!=='Sven'||r.model!==process.env.SVEN_MODEL||r.candidateId!==profile.id||r.productVersion!==researchVersion)||new Set(results.map(r=>r.caseId)).size!==results.length)throw new Error('Svarfilen tilhører en annen kjøring eller har duplikater')
    for(const task of manifest.cases) {
      if(results.some(r=>r.caseId===task.id))continue
      const rows=[],started=Date.now(),runAt=new Date().toISOString()
      const base={manifestHash,caseId:task.id,product:'Sven',candidateId:profile.id,model:process.env.SVEN_MODEL,productVersion:researchVersion,runAt,tools:['Fellestall snapshots','web search','web fetch','automated review']}
      // A durable in-flight marker prevents silently repeating a possibly billed
      // run after a hard process interruption. Resolve manually before resuming.
      const marker=output+'.in-flight'
      await writeFile(marker,JSON.stringify({...base,warning:'Kontroller avbrutt kjøring før filen fjernes og kjøringen gjenopptas.'}),{flag:'wx',mode:0o600})
      let submission
      try {
        const result=await researchWithSven({...task,tuning:profile.settings,asOf:manifest.asOf,signal:AbortSignal.timeout(manifest.timeLimitMinutes*60_000),
          request:claudeTransport({onUsage:async u=>rows.push(u)}),localSources:question=>resolveSvenSources(question,dataDir)})
        const answer=[result.answer.summary,...result.answer.findings.map(f=>f.text+' ['+f.sourceIds.join(', ')+']'),...result.answer.uncertainties,
          ...(result.answer.recommendation?[result.answer.recommendation.text+' ['+result.answer.recommendation.sourceIds.join(', ')+']']:[]),
          'Kilder:',...result.sources.map(s=>`${s.id}: ${s.title} ${s.url||s.snapshotURL||''}`)].join('\n\n')
        submission={...base,status:result.status==='reviewed'?'completed':'failed',answer,result}
      } catch(error) {submission={...base,status:error.name==='TimeoutError'?'timeout':'failed',answer:'Kjøringen leverte ikke et godkjent svar: '+error.message}}
      submission.elapsedSeconds=(Date.now()-started)/1000
      if(submission.elapsedSeconds>manifest.timeLimitMinutes*60)submission.status='timeout'
      submission.usage=usageSummary(rows)
      results.push(submission)
      await writeFile(output+'.tmp',JSON.stringify(results,null,2)+'\n',{mode:0o600})
      await rename(output+'.tmp',output)
      await unlink(marker)
      console.error(`${task.id}: ${submission.status}`)
    }
    console.error(`${results.length} Sven-kjøringer registrert. ChatGPT- og Claude-produktsvar må importeres separat.`)
  }finally{await unlink(lock)}
} catch(error) {console.error(error.message);process.exitCode=1}
