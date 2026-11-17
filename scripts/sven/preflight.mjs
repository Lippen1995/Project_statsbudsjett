import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { claudeTransport } from '../../server/sven/provider.mjs'
const checks=[]
checks.push({check:'Node 24+',passed:Number(process.versions.node.split('.')[0])>=24})
checks.push({check:'ANTHROPIC_API_KEY',passed:!!process.env.ANTHROPIC_API_KEY})
checks.push({check:'SVEN_MODEL',passed:!!process.env.SVEN_MODEL})
for(const path of ['../../web/public/data/kostra/index.json','../../evaluation/sven/cases.json']) {
  try {await access(fileURLToPath(new URL(path,import.meta.url)));checks.push({check:path,passed:true})}
  catch {checks.push({check:path,passed:false})}
}
if(process.argv.includes('--live') && checks.every(c=>c.passed)) {
  try {
    const request=claudeTransport({onUsage:async usage=>checks.push({check:'Leverandørens forbruksmåling',passed:Number.isInteger(usage.input)&&Number.isInteger(usage.output)})})
    const response=await request({phase:'preflight',instructions:'Returner et kort faktasvar med kilde. Bruk nettsøk og hent den offisielle siden.',
      input:'Finn SSBs offisielle forklaring av KOSTRA. Hva står forkortelsen for?',maxTokens:1000,
      tools:[{type:'web_search_20250305',name:'web_search',max_uses:1},{type:'web_fetch_20250910',name:'web_fetch',max_uses:1,citations:{enabled:true}}]})
    const {extractEvidence,toolErrors}=await import('../../server/sven/research.mjs')
    checks.push({check:'Levende modell, søk og kildeutdrag',passed:extractEvidence(response).length>0 && !toolErrors(response).length})
  } catch(error) {checks.push({check:'Levende modell og verktøy',passed:false,reason:error.message})}
} else checks.push({check:'Levende modell og verktøy',passed:false,reason:'Ikke kjørt. Krever konfigurert nøkkel/modell og --live.'})
console.log(JSON.stringify({ready:checks.every(c=>c.passed),checks},null,2))
if(checks.some(c=>!c.passed))process.exitCode=1
