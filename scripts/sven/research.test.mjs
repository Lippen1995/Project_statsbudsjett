import test from 'node:test'
import assert from 'node:assert/strict'
import { researchWithSven, extractEvidence, validateAudit } from '../../server/sven/research.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { openWorkspace, usageSummary } from '../../server/sven/workspace.mjs'
import { prepareBenchmark, blindBenchmark, scoreBenchmark, digest, dimensions } from '../../server/sven/benchmark.mjs'

const json=value=>({content:[{type:'text',text:JSON.stringify(value)}]})
const plan={scope:'Kommunens regnskap i 2025',questions:['Hva viser regnskapet?'],searches:['SSB kommune regnskap 2025'],counterSearch:'alternative forklaringer administrasjonsutgifter',missing:[]}
const source={id:'ssb',title:'Regnskap',text:'Utgiftene var 100 kroner i 2025.'}
const answer={summary:'Regnskapet viser utgifter.',findings:[{text:'Utgiftene var 100 kroner i 2025.',sourceIds:['ssb']}],uncertainties:[],recommendation:null}
const good={passed:true,issues:[]}
const bad={passed:false,issues:[{severity:'major',field:'summary',reason:'En anbefaling er plassert i sammendraget uten bestilling.'}]}

test('research searches for counterevidence, audits prose and repairs once',async()=>{
  const phases=[]
  const result=await researchWithSven({question:'Analyser regnskapet',surface:'editorial',sources:[source],request:async input=>{
    phases.push(input.phase)
    if(input.phase==='plan') return json(plan)
    if(input.phase==='research') { assert.match(input.input,/alternative forklaringer/);assert.equal(input.tools[0].max_uses,6);return {content:[]} }
    if(input.phase==='review-0') {assert.match(input.instructions,/ALLE tekstfelt/);return json(bad)}
    if(input.phase==='review-1') return json(good)
    if(input.phase==='answer-1') assert.match(input.input,/anbefaling er plassert/)
    return json(answer)
  }})
  assert.deepEqual(phases,['plan','research','answer-0','review-0','answer-1','review-1'])
  assert.equal(result.status,'reviewed');assert.equal(result.publicationAuthorized,false)
})

test('unresolved quality issues cannot be reported as ready',async()=>{
  const result=await researchWithSven({question:'Test',sources:[source],plan,request:async input=>input.phase==='research'?{content:[]}:json(input.phase.startsWith('review')?bad:answer)})
  assert.equal(result.status,'needs-review')
  assert.throws(()=>validateAudit({...bad,passed:true}),/Motstridende/)
})

test('search hits and generated prose are not promoted to primary evidence',()=>{
  const evidence=extractEvidence({content:[{type:'text',text:'Made-up claim',citations:[{type:'web_search_result_location',url:'https://ssb.no/example',title:'SSB',cited_text:'Actual excerpt'}]},
    {type:'web_search_tool_result',content:[{url:'https://example.org',title:'Unopened hit',encrypted_content:'opaque'}]},
    {type:'web_fetch_tool_result',content:{type:'web_fetch_result',url:'https://stortinget.no/example',content:{title:'Vedtak',source:{type:'text',data:'Original document'}}}}]})
  assert.equal(evidence.length,2);assert.equal(evidence[0].text,'Actual excerpt');assert.equal(evidence[1].text,'Original document')
  assert.ok(evidence.every(s=>s.primaryCandidate&&s.hash))
})

test('no evidence and cancelled runs make no answer call',async()=>{
  const calls=[]
  await assert.rejects(researchWithSven({question:'Test',plan,request:async i=>{calls.push(i.phase);return {content:[]}}}),/Ingen analyse/)
  assert.deepEqual(calls,['research'])
  await assert.rejects(researchWithSven({question:'Test',plan,signal:AbortSignal.abort(),request:async()=>assert.fail()}))
})

test('provider records real usage before rejecting truncated output, including cache and search',async()=>{
  const recorded=[]
  const request=claudeTransport({apiKey:'test',model:'model',onUsage:async u=>recorded.push(u),fetchImpl:async()=>Response.json({id:'req-1',model:'actual-model',usage:{input_tokens:10,output_tokens:20,cache_read_input_tokens:30,cache_creation_input_tokens:40,server_tool_use:{web_search_requests:2}},stop_reason:'max_tokens',content:[]})})
  await assert.rejects(request({instructions:'x',input:'x'}),/fullførte ikke/)
  assert.equal(recorded[0].model,'actual-model');assert.equal(usageSummary(recorded,200).remainingPercent,50)
  assert.equal(usageSummary([{...recorded[0],input:null}],200).remainingPercent,null)
})

test('private jobs enforce owner, deduplicate successful calls and stop later steps',async()=>{
  const db=openWorkspace(':memory:')
  try {
    const id=db.create('alice',{question:'test'})
    assert.throws(()=>db.get('bob',id),/finnes ikke/)
    let calls=0
    const request=async(input,onUsage)=>{calls++;await onUsage({requestId:'r1',input:1,output:2});return json(answer)}
    const run=async({request})=>{await request({phase:'one',input:'same'});throw Error('local failure')}
    await assert.rejects(db.execute('alice',id,request,run),/local failure/)
    const result=await db.execute('alice',id,request,async({request})=>{await request({phase:'one',input:'same'});return {status:'reviewed'}})
    assert.equal(result.status,'reviewed');assert.equal(calls,1);assert.equal(db.usage('alice',id).length,1)
    const next=db.create('alice',{question:'stop'})
    await assert.rejects(db.execute('alice',next,async()=>{db.cancel('alice',next);return json(answer)},async({request})=>{await request({phase:'one'});assert.fail()}),/stoppet/)
    assert.equal(db.get('alice',next).status,'cancelled')
  }finally{db.close()}
})

test('uncertain provider failures require explicit recovery and changed input cannot reuse cache',async()=>{
  const db=openWorkspace(':memory:')
  try {
    const id=db.create('alice',{question:'test'})
    const run=async({request})=>{await request({phase:'one',input:'a'});return {status:'reviewed'}}
    await assert.rejects(db.execute('alice',id,async()=>{throw Error('network failure')},run),/network/)
    await assert.rejects(db.execute('alice',id,async()=>assert.fail(),run),/uavklart/)
    db.recover('alice',id)
    await db.execute('alice',id,async()=>json(answer),run)
    assert.equal(db.get('alice',id).status,'completed')
  }finally{db.close()}
})

test('blind product comparison requires all runs and complete scoring; failed runs score zero',()=>{
  const manifest=prepareBenchmark([{id:'a',domain:'economy',question:'Test'}],{asOf:'2026-11-17'})
  const submissions=manifest.products.map(product=>({product,caseId:'a',answer:'Result',model:'actual',productVersion:'test',runAt:'2026-11-17T10:00:00Z',tools:['web search'],elapsedSeconds:100,status:product==='Claude'?'failed':'completed',manifestHash:digest(manifest)}))
  assert.throws(()=>blindBenchmark(manifest,submissions.slice(1)),/Alle produkter/)
  const {review,key}=blindBenchmark(manifest,submissions,()=>0)
  assert.ok(review.cases[0].answers.every(a=>!('product' in a)&&!('model' in a)))
  assert.throws(()=>scoreBenchmark(review,key,[]),/Vurder alle/)
  const ratings=key.map(k=>({reviewHash:digest(review),caseId:k.caseId,label:k.label,criticalError:false,reason:'Checked against primary source',scores:Object.fromEntries(dimensions.map(d=>[d,3]))}))
  assert.throws(()=>scoreBenchmark(review,key,ratings.map(r=>({...r,reviewHash:'wrong-package'}))),/annen blindpakke/)
  const result=scoreBenchmark(review,key,ratings)
  assert.equal(result.summaries.find(r=>r.domain==='alle'&&r.product==='Claude').mean,0)
  assert.equal(result.paired.find(p=>p.against==='Claude').wins,1)
})
