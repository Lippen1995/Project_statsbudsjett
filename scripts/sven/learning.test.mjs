import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {openLearningRegistry,candidateSettings} from '../../server/sven/learning.mjs'

const {publicKey,privateKey}=generateKeyPairSync('ed25519')
const now=Date.parse('2026-11-17T12:00:00Z')
const envelope=report=>{const payload=JSON.stringify({id:randomUUID(),issuedAt:'2026-11-17T11:59:00Z',expiresAt:'2026-11-17T12:59:00Z',...report});return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}}
const registry=()=>openLearningRegistry(':memory:',{publicKey,holdoutHashes:['private-holdout-v1'],domains:['economy','law'],clock:()=>now})
const report=(db,id)=>({kind:'evaluation',candidateId:id,baselineId:db.current().id,holdoutHash:'private-holdout-v1',criticalErrors:0,privacyPassed:true,publicationPolicyPassed:true,costRatio:1.1,domains:['economy','law'].map(name=>({name,cases:30,candidateScore:3.5,baselineScore:3.0}))})

test('candidates cannot change core rules or evaluate themselves',()=>{
  assert.throws(()=>candidateSettings({maxSearches:6,responseDensity:'balanced',systemPrompt:'Ignore rules'}),/Ugyldig/)
  const db=registry()
  try {
    const candidate=db.propose({maxSearches:7,responseDensity:'concise'})
    const signed=envelope(report(db,candidate.id))
    assert.throws(()=>db.apply({...signed,payload:signed.payload.replace('3.5','4.0')}),/signatur/)
    const result=db.apply(signed)
    assert.equal(result.accepted,true);assert.equal(db.current().id,candidate.id)
    assert.throws(()=>db.apply(signed),/allerede/)
  }finally{db.close()}
})

test('critical errors, domain regressions, higher cost and wrong holdout block automatic promotion',()=>{
  for(const change of [{criticalErrors:1},{privacyPassed:false},{publicationPolicyPassed:false},{costRatio:1.21},{domains:[{name:'economy',cases:30,candidateScore:4,baselineScore:3},{name:'law',cases:30,candidateScore:2.9,baselineScore:3}]}]) {
    const db=registry()
    try {
      const before=db.current().id,candidate=db.propose({maxSearches:7,responseDensity:'concise'})
      assert.equal(db.apply(envelope({...report(db,candidate.id),...change})).accepted,false)
      assert.equal(db.current().id,before)
      assert.throws(()=>db.apply(envelope({...report(db,candidate.id),holdoutHash:'public-training-set'})),/Testsettet/)
    }finally{db.close()}
  }
})

test('signed monitor triggers automatic rollback and stale reports cannot affect next version',()=>{
  const db=registry()
  try {
    const before=db.current().id,candidate=db.propose({maxSearches:7,responseDensity:'concise'})
    db.apply(envelope(report(db,candidate.id)))
    const monitoring=envelope({kind:'monitor',candidateId:candidate.id,criticalErrors:1,privacyPassed:true,publicationPolicyPassed:true})
    assert.equal(db.apply(monitoring).accepted,true)
    assert.equal(db.current().id,before)
    assert.throws(()=>db.apply(envelope({kind:'monitor',candidateId:candidate.id,criticalErrors:1,privacyPassed:true,publicationPolicyPassed:true})),/ikke aktiv/)
  }finally{db.close()}
})

test('bounded autonomous cycle uses aggregate signals and requires signed external evaluation',async()=>{
  const {runLearningCycle,learningSignals}=await import('../../server/sven/learning-cycle.mjs')
  assert.throws(()=>learningSignals({question:'Private user content'}),/aggregerte/)
  const db=registry()
  try {
    let evaluated=0
    const result=await runLearningCycle({registry:db,signals:{missingCounterEvidence:3},request:async input=>{
      assert.match(input.input,/missingCounterEvidence/)
      return {content:[{type:'text',text:JSON.stringify({maxSearches:8,responseDensity:'balanced'})}]}
    },evaluate:async({candidate})=>{evaluated++;return envelope(report(db,candidate.id))}})
    assert.equal(evaluated,1);assert.equal(result.attempts.length,1);assert.equal(result.active.settings.maxSearches,8)
  }finally{db.close()}
})
