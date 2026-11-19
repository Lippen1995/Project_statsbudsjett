import test from 'node:test'
import assert from 'node:assert/strict'
import { loadHealthReform, healthReformFacts, validNouVerification, validateHealthReform } from './health-reform.mjs'
import { healthScenario } from '../../web/src/analyser/health-scenario.js'
test('verified excerpts cannot masquerade as a PDF binary hash', () => {
 const p=loadHealthReform().policy
 assert.equal(validNouVerification(p.nou),true)
 assert.equal(p.nou.pdfSha256,undefined)
 for(const patch of [{url:'https://example.org/fake.pdf'}, {excerpt:''}, {checkedAt:'invalid'}, {printedPage:0}])
   assert.equal(validNouVerification({...p.nou,textVerification:{...p.nou.textVerification,...patch}}),false)
})
test('legacy facts remain compatible and new facts derive from explicit scenarios',()=>{
 const {policy:p,facts:f}=loadHealthReform()
 const old=structuredClone(p);delete old.factsVersion
 old.series=old.series.filter(x=>x.id!=='careNurseFte')
 const legacy=healthReformFacts(old)
 assert.equal(Object.keys(legacy).length,7)
 for(const [k,v] of Object.entries(legacy)) assert.deepEqual(v,f[k])
 assert.equal(f.healthScenarioReleased.value,24.75)
 assert.equal(f.healthScenarioCashGross.value,29700000)
 assert.equal(f.healthScenarioCashNet.value,-20300000)
 assert.equal(f.healthCareNurseCapacity.value,277.86)
 assert.equal(healthScenario(p.scenario).rows.at(-1).cashFte,0)
 assert.equal(healthScenario({...p.scenario,cashShare:1}).rows.at(-1).capacityFte,0)
 const broken=structuredClone(p);broken.series=old.series
 assert.throws(()=>validateHealthReform(broken))
})
