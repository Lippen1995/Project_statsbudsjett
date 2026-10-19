import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {calculateResearch} from '../src/analyser/research-calculations.js'
import {seriesGraph} from '../src/analyser/chart-plan.js'
import {buildReport} from '../../scripts/analyser/report.mjs'
import {deliverScheduled} from '../../scripts/analyser/handoff.mjs'
const root=new URL('../../',import.meta.url).pathname
const fixture=()=>({kind:'real-expenditure-per-capita',rows:[{year:2020,expenditure:100,cpi:100,population:100},{year:2021,expenditure:120,cpi:110,population:105}],eventEvidence:{items:[{id:'transfer',nodeIds:['u-02-0291'],rows:[{year:2020,expenditure:20,reported:true},{year:2021,expenditure:0,reported:false}]},{id:'uni',nodeIds:['u-02-0260-50'],rows:[{year:2020,expenditure:50,reported:true},{year:2021,expenditure:60,reported:true}]}]},ssbEvidence:[{id:'Students',unit:'personer',rows:[{year:2020,value:10},{year:2021,value:12}]}],researchPlan:[{id:'Adjusted',kind:'exclude-chapters',evidenceIds:['transfer']},{id:'PerStudent',kind:'per-observation',numerator:'uni',denominator:'Students'}]})
test('scope correction and per-student funding reproduce from frozen sources and graph values',()=>{
 const r=fixture(),d=calculateResearch(r)
 assert.equal(d.facts.calcAdjustedNominalGrowth.value,50)
 assert.ok(Math.abs(d.facts.calcAdjustedRealGrowth.value-36.36363636363635)<1e-9)
 assert.equal(d.facts.calcPerStudentStart.value,5000000)
 assert.equal(d.facts.calcPerStudentEnd.value,5000000)
 assert.ok(d.facts.calcPerStudentRealGrowth.value<0)
 assert.equal(seriesGraph({mode:'values',series:[{source:'calculation',id:'PerStudent'}]},r).series[0].values[1],5000000)
})
test('no missing/zero denominator, overlapping subtraction, unknown references or arbitrary values',()=>{
 for(const alter of [r=>r.ssbEvidence[0].rows.pop(),r=>r.ssbEvidence[0].rows[1].value=0,r=>r.researchPlan[0].evidenceIds.push('transfer'),r=>r.researchPlan[1].denominator='Unknown',r=>r.researchPlan[0].amount=42]){
 const r=fixture();alter(r);assert.throws(()=>calculateResearch(r))
 }
})
function revisionFixture(){
 const article=JSON.parse(readFileSync(root+'editorial/drafts/pilot.json'))
 article.report=buildReport(root+'web/public/data');article.status='draft';delete article.approval;delete article.publishedAt
 const next=structuredClone(article);next.report=buildReport(root+'web/public/data',{researchPlan:[{id:'Adjusted',kind:'exclude-chapters',evidenceIds:['alderspensjon']}]})
 const pr={number:65,state:'open',user:{type:'Bot'},head:{sha:'c'.repeat(40),ref:'analysis/weekly-research',repo:{full_name:'owner/repo'}},base:{ref:'main'}}
 const path='editorial/drafts/'+article.slug+'.json',calls=[],writes=[]
 const packet={mode:'research-revision',reason:'Explicit user asks for further calculations in chat',base:{number:65,head:pr.head.sha,feedback:''},article:next}
 const g={repository:'owner/repo',root:'/repos/owner/repo',permission:async()=>true,content:async(p,ref)=>({value:p==='editorial/handoff/ukens-analyse.json'?packet:article}),pages:async p=>p.endsWith('/files')?[{filename:path,status:'added'}]:[],api:async(p,o={})=>{calls.push({p,...o});return structuredClone(pr)},commit:async(...args)=>{writes.push(args);return 'd'.repeat(40)}}
 return {packet,pr,g,calls,writes}
}
test('research revision uses bot, rebuilds trusted report, retains primary series and requires fresh approval',async()=>{
 const f=revisionFixture();await deliverScheduled({g:f.g,reviewer:'reviewer',actor:'actor',input:{mode:'weekly',sourceCommit:'a'.repeat(40),sourcePath:'editorial/handoff/ukens-analyse.json'},dataDir:root+'web/public/data'})
 assert.equal(f.writes.length,1);const a=Object.values(f.writes[0][2])[0];assert.equal(a.status,'draft');assert.equal(a.approval,undefined);assert.equal(a.publishedAt,undefined);assert.ok(f.calls.some(c=>c.p.endsWith('/requested_reviewers')));assert.ok(!f.calls.some(c=>c.p.endsWith('/merge')))
})
test('research revision rejects changed head and rehashed made-up report',async()=>{
 for(const mutate of [f=>f.packet.base.head='b'.repeat(40),f=>f.packet.article.report.rows[0].expenditure+=1]){
 const f=revisionFixture();mutate(f);await assert.rejects(deliverScheduled({g:f.g,reviewer:'reviewer',actor:'actor',input:{mode:'weekly',sourceCommit:'a'.repeat(40),sourcePath:'editorial/handoff/ukens-analyse.json'},dataDir:root+'web/public/data'}));assert.equal(f.writes.length,0)
 }
})
