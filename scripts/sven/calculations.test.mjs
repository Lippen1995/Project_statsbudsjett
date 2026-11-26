import test from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {difference,comparePeerGroup,deriveMunicipalEvidence} from '../../server/sven/calculations.mjs'
import {resolveSvenSources} from '../../server/sven/sources.mjs'

test('null is missing, zero is observed, negative denominators do not create misleading percent',()=>{
  assert.equal(difference(null,10).difference,null)
  assert.equal(difference(0,10).percent,-100)
  assert.equal(difference(10,0).percent,null)
  assert.equal(difference(-5,-10).difference,5)
  assert.equal(difference(-5,-10).percent,null)
})

test('peer median excludes selected municipality and weights need actual population',()=>{
  const rows=[['selected',100,5],['a',10,100],['b',20,300],['c',null,100]].map(([id,value,population])=>({id,value,population,year:2025,metric:'net_expenses',scope:'konsern',unit:'NOK/innbygger'}))
  assert.equal(comparePeerGroup(rows,'selected').reference,15)
  assert.equal(comparePeerGroup(rows,'selected','weighted').reference,17.5)
  assert.deepEqual(comparePeerGroup(rows,'selected').excludedIds,['c'])
  assert.throws(()=>comparePeerGroup(rows.map(row=>({...row,population:undefined})),'selected','weighted'),/folketall/)
  assert.throws(()=>comparePeerGroup(rows.map((row,i)=>({...row,year:i===1?2024:2025})),'selected'),/ulik periode/)
})

test('real municipality comparisons retain source IDs, units, years and multi-year distinction',async()=>{
  const sources=await resolveSvenSources('Netto driftsutgifter i Stavanger og Sandnes i 2023 og 2025',fileURLToPath(new URL('../../web/public/data/',import.meta.url)))
  const [derived]=deriveMunicipalEvidence(sources)
  assert.ok(derived.derivedFrom.includes('kostra-net-expenses-1103'))
  const data=JSON.parse(derived.text)
  assert.ok(data.comparisons.some(row=>row.unit==='NOK/innbygger'&&row.year===2025))
  assert.ok(data.growth.every(row=>row.intervalYears===2))
  const row=data.comparisons.find(row=>row.unit==='NOK/innbygger'&&row.year===2025)
  assert.equal(row.difference,row.leftValue-row.rightValue)
  assert.match(data.method,/ikke et dokumentert sparepotensial/)
})
