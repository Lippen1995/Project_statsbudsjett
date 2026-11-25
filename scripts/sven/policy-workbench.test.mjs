import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { policyScenario } from '../../server/sven/policy-workbench.mjs'
import { buildPolicyEvidence, finishPolicy } from '../../server/sven/policy-insights.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { researchWithSven } from '../../server/sven/research.mjs'

const initial = {summary:'Gjennomgangen',findings:[],uncertainties:[],recommendation:null}
const pack = data=>({content:[{type:'text',text:JSON.stringify(data)}]})
const directory = fileURLToPath(new URL('../../web/public/data/',import.meta.url))
const read = async file=>JSON.parse(await readFile(directory+file,'utf8'))
const forecast = {title:'Lavere SFO-pris',assumptions:[
  {key:'children',label:'Antall barn',unit:'barn',value:2000},
  {key:'discount',label:'Prisendring per barn og måned',unit:'kr',value:500},
  {key:'first',label:'Betalingsmåneder første år',unit:'måneder',value:4},
  {key:'annual',label:'Betalingsmåneder helår',unit:'måneder',value:11},
],lines:[{label:'Redusert inntekt',direction:'cost',factors:['children','discount'],firstYearMonths:'first',annualMonths:'annual'}]}

test('reconciliation computes verified adjustments and retains an unexplained balance', () => {
  const sources = [
    {id:'accounts-a',url:'https://www.ssb.no/statbank',title:'Regnskap A',text:'Regnskap A for 2025 viser 100 000 kroner.'},
    {id:'accounts-b',url:'https://statsregnskapet.dfo.no/',title:'Regnskap B',text:'Regnskap B for 2025 viser 135 tusen kroner.'},
    {id:'adjustment',url:'https://www.regjeringen.no/',title:'Avstemming',text:'En særskilt overføring i 2025 var 0,03 mill. kroner.'},
  ]
  const spec = (at,value,unit,label)=>({sourceId:sources[at].id,quote:sources[at].text,value,unit,label,year:2025})
  const adjustment = {...spec(2,0.03,'mill. kroner','Overføring'),direction:'add'}
  const proposed = {title:'Regnskap A og B',basis:'same-period',left:spec(0,100000,'kroner','Regnskap A'),right:spec(1,135,'tusen kroner','Regnskap B'),
    adjustments:[adjustment,adjustment,{...adjustment,quote:'Oppdiktet beløp på 0,03 mill. kroner i 2025.'}]}
  const run = value=>finishPolicy(initial,{reconciliation:value},buildPolicyEvidence(sources,'reconcile',''),sources,'').policy
  const {reconciliation,observations} = run(proposed)
  assert.equal(reconciliation.difference,35000)
  assert.equal(reconciliation.explained,30000)
  assert.equal(reconciliation.residual,5000)
  assert.equal(reconciliation.unavailable,2)
  assert.equal(observations.length,3)
  assert.equal(run({...proposed,basis:'difference-only'}).reconciliation.residual,undefined)
  assert.equal(run({...proposed,right:{...proposed.right,year:2024}}).reconciliation.difference,undefined)
})

test('reconciliation fetches both stated budget lines', async () => {
  const result = await resolveSvenSources('Avstem kapittel 1760 post 45 og kapittel 1720 post 01 for 2025',directory,{read,insights:true,lens:'reconcile'})
  assert(result.find(source=>source.id==='dfo-u-17-1760-45'))
  assert(result.find(source=>source.id==='dfo-u-17-1720-01'))
})

test('a delivery chain does not turn documentation of intent into sourced execution', () => {
  const sources = [{id:'report',title:'Offentlig rapport',url:'https://www.regjeringen.no/',text:'Planen fra 2023 var å ferdigstille arbeidet i 2025. Arbeidet startet 2024-10-03.'}]
  const {policy} = finishPolicy(initial,{delivery:{title:'Tiltaket',stages:[
    {stage:'promise',detail:'Plan om ferdigstillelse.',sourceId:'report',quote:'Planen fra 2023 var å ferdigstille arbeidet i 2025.',date:'2027'},
    {stage:'implementation',detail:'Arbeidet startet.',sourceId:'report',quote:'Arbeidet startet 2024-10-03.',date:'2024-10-03'},
    {stage:'result',detail:'Arbeidet ble fullført.',sourceId:'report',quote:'Arbeidet ble fullført i 2025.'},
  ]}},buildPolicyEvidence(sources,'delivery',''),sources,'')
  assert.equal(policy.delivery.stages.length,5)
  assert.equal(policy.delivery.stages[0].date,undefined)
  assert.equal(policy.delivery.stages[3].date,'2024-10-03')
  assert.equal(policy.delivery.stages[4].detail,undefined)
  assert.deepEqual(policy.sourceIds,['report'])
})

test('scenario is returned directly for explicit inputs, with separate periods and support for zero and one-off values', async () => {
  assert.equal(policyScenario({...forecast,lines:[{...forecast.lines[0],firstYearMonths:'annual',annualMonths:'first'}]}),null)
  assert.equal(policyScenario({...forecast,lines:[{...forecast.lines[0],oneOff:true}]}),null)
  const withSetup = {...forecast,assumptions:forecast.assumptions.concat({key:'setup',label:'Oppstart',unit:'kr',value:0}),
    lines:forecast.lines.concat({oneOff:true,label:'Oppstart',direction:'cost',factors:['setup']})}
  assert.equal(policyScenario(withSetup).lines[1].annualMonths,undefined)
  const question='Reduser SFO-prisen med 500 kr per barn i måneden. 2000 barn, fire måneder første år og elleve i helåret.'
  const result=await researchWithSven({question,conversational:true,insights:true,request:async({phase})=>{
    assert.equal(phase,'interpret')
    return pack({intent:{request:question,purpose:'Se budsjettvirkningen',meaning:question},action:'reply',reply:'Her er scenarioet.',policy:{scenario:withSetup}})
  }})
  assert.equal(result.status,'conversation')
  assert.equal(result.policy.scenario.assumptions.length,5)
  assert.equal(result.policy.scenario.assumptions.find(input=>input.key==='setup').value,0)
})

test('peer selection uses locked years, size, centrality and the correct group, includes direct sources and ignores missing values', async () => {
  const loadValues=async(definition,regions,year)=>{
    assert.equal(year,2025)
    return {url:`https://www.ssb.no/statbank/table/${definition.table}/`,values:Object.fromEntries(regions.map((id,index)=>[id,
      id==='3205'?null:definition.table==='11971'?15000+100*index:(index+1)*250000]))}
  }
  const loadCentrality=async()=>({url:'https://www.ssb.no/klass/klassifikasjoner/128',values:{1103:2,4601:2,1108:2,3201:1,3203:1,5001:2}})
  const sources=await resolveSvenSources('Stavanger netto driftsutgifter grunnskole 2025',directory,{read,insights:true,lens:'peers',loadValues,loadCentrality})
  const {policy}=finishPolicy(initial,null,buildPolicyEvidence(sources,'peers',''),sources,'')
  const result = policy.peerBenchmark
  assert.equal(result.group,12)
  assert.equal(result.unit,'kr per elev')
  assert(result.sets[0].codes.includes('4601'))
  assert(!result.sets[0].codes.includes('3201'))
  assert(!result.sets[1].codes.includes('3205'))
  assert.equal(result.rows.find(row=>row.code==='3205').cost,null)
  const exact=policy.observations.find(row=>row.id==='ssb-peers-expenses-1103/2025/1103')
  assert(new URL(exact.snapshotUrl).searchParams.get('valueCodes[KOKart0000]')==='AGD2')
  const fallback=await resolveSvenSources('Oslo netto driftsutgifter grunnskole 2025',directory,{read,insights:true,lens:'peers',loadValues,
    loadCentrality:async()=>({url:'https://www.ssb.no/klass/klassifikasjoner/128',values:{'0301':1,'3201':1,'3205':1}})})
  assert.match(fallback[0].peerBenchmark.sets[1].label,/lik sentralitet/)
  assert.equal(fallback[0].peerBenchmark.target.code,'0301')
})

test('re-running an analysis revalidates a fresh snapshot and honors an unchanged ETag', async () => {
  const {snapshotLoader}=await import('../../server/sven/snapshot-cache.mjs')
  const entries=new Map()
  let revision=1, calls=0
  const load=snapshotLoader({cache:{get:key=>entries.get(key),set:(key,value)=>entries.set(key,value)},fetchImpl:async(_url,{headers})=>{
    calls++
    const etag=String(revision)
    return headers?.['If-None-Match']===etag?new Response(null,{status:304}):Response.json({revision},{headers:{etag}})
  }})
  const first=await load('meta.json')
  revision=2
  assert.equal(await load('meta.json'),first)
  const updated=await load('meta.json',undefined,{refresh:true})
  assert.equal(JSON.parse(updated).revision,2)
  assert.equal(await load('meta.json',undefined,{refresh:true}),updated)
  assert.equal(calls,3)
})
