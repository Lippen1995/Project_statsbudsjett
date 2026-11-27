import { readFileSync } from 'node:fs'
import { proposeSkill, editorialBenchmark, activateSkill, monitorSkill } from './editorial-evolution.mjs'
import { configuredRegistry } from '../../server/sven/learning-config.mjs'
import { saveRun } from './editorial.mjs'
const [command,statePath,inputPath]=process.argv.slice(2)
const read=path=>JSON.parse(readFileSync(path,'utf8'))
const input=inputPath?read(inputPath):{}
if(command==='benchmark') {
  saveRun(statePath,editorialBenchmark(input));process.exit(0)
}
const registry=await configuredRegistry()
try {
  const previous=command==='propose'?null:read(statePath)
  let next
  if(command==='propose')next=proposeSkill({...input,registry})
  else if(command==='activate')next=activateSkill(previous,{registry,attestation:input})
  else if(command==='monitor')next=monitorSkill(previous,{registry,attestation:input})
  else throw Error('Bruk propose, benchmark, activate eller monitor; eksisterende benchmark-CLI håndterer blinding og vurdering')
  next.revision=(previous?.revision??-1)+1
  saveRun(statePath,next,previous?.revision??null)
  console.log(JSON.stringify({status:next.status,skill:next.skill,revision:next.revision}))
}finally{registry.close()}
