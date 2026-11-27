import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto'
import { openLearningRegistry } from '../../server/sven/learning.mjs'
import { readFileSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentHash, validateArticle } from '../../scripts/analyser/schema.mjs'
import { graphPlan, seriesGraph } from '../src/analyser/chart-plan.js'
import { newEditorialRun, checkpoint, reviseRun, finishEditorial, saveRun, assertEditorialApproval } from '../../scripts/analyser/editorial.mjs'
import { digest, dimensions, policy, policyHash, editorialInputHash, copyBlocks, validateAssessment } from '../../scripts/analyser/editorial-policy.mjs'
import { diagnoseArticle } from '../../scripts/analyser/editorial-quality.mjs'
import { loadSkills, skillRoot } from '../../scripts/analyser/editorial-skills.mjs'
import { proposeSkill, editorialBenchmark, blindBenchmark, scoreBenchmark, activateSkill, monitorSkill, runEditorialLearning } from '../../scripts/analyser/editorial-evolution.mjs'
import { captureEditorial } from '../../scripts/analyser/editorial-capture.mjs'
import { runEditorial } from '../../scripts/analyser/editorial-runner.mjs'
import { verifyEditorialReview } from '../../scripts/analyser/editorial-review.mjs'
const all = JSON.parse(readFileSync(new URL('../src/analyser/publications.json',import.meta.url),'utf8'))
const article = () => {
  const a = structuredClone(all.find(a=>a.slug.includes('u-08-2020-2025'))); a.status='draft'; delete a.approval; delete a.publishedAt
  a.copy.format='feature'; a.copy.graphs=[]
  return a
}
const at='2026-11-26T20:00:00Z', model='native evaluator test fixture'
const reviewKeys=generateKeyPairSync('ed25519')
const reviewVerification={publicKey:reviewKeys.publicKey,now:Date.parse(at)}
const signReview=(a,assessment)=>{
  const payload=JSON.stringify({kind:'editorial-review',independent:true,reviewer:'independent test evaluator',inputHash:editorialInputHash(a),policyHash,assessmentHash:digest(assessment),issuedAt:at,expiresAt:'2026-11-26T21:00:00Z'})
  return {payload,signature:sign(null,Buffer.from(payload),reviewKeys.privateKey).toString('base64')}
}
const assessment = a => ({ policyHash, inputHash:editorialInputHash(a), at, evaluator:model,
  dimensions:Object.fromEntries(Object.keys(dimensions).map(k=>[k,k==='visual'?{notApplicable:true,observation:'Ingen graf tilfører nødvendig informasjon i denne testartikkelen.'}:{score:92,observation:'Testfixture for dokumentert observasjon av denne dimensjonen.',action:'Behold dokumentasjonen og kontroller funnet i en ny oppgave.'}])),
  findings:[], claimChecks:copyBlocks(a.copy).map(b=>({block:b.id,status:'verified',sources:[a.report.sources[0].url],note:'Testfixture med eksplisitt spor til en frosset kilde.'})) })
const payloads = (a, signed=false) => ({
  research:{summary:'Kontrollert regnskap og NAVs beskrivelse av ordningene.',questions:[{question:'Hva forklarer veksten i den valgte ytelsen?',answer:'Den frosne rapporten og NAV beskriver høyere satser.',sources:[a.report.sources[0].url]}],materialGaps:[]},
  angle:{summary:'Velger konsekvens for familiene fremfor departementstotalen.',alternatives:['Konsekvenser for familiene','Historisk utvikling i regnskapet','Sammenligning av to ytelser'].map(approach=>({approach,finding:'Barnetrygden vokste mens kontantstøtten falt.',relevance:'Familiene får ulike støtteforløp gjennom småbarnstiden.',sources:[a.report.sources[0].url]})),selected:0,reason:'Kontrasten forklarer en dokumentert endring for leserne.',structure:'Hovedfunn, mekanisme, motsetning og nettoeffekt.'},
  draft:{summary:'Skrevet på grunnlag av den kontrollerte rapporten.'},
  visual:{summary:'Ingen ekstra graf er nødvendig i den korte forklaringen.',purpose:'Forklare dokumenterte regelendringer for mottakerne.',choice:'Teksten forklarer dette uten enda en totalsumgraf.'},
  language:{inputHash:editorialInputHash(a),opening:'Åpningen setter kontrasten mellom mottakertall og utbetaling først.',ending:'Avslutningen knytter nettoeffekt til de ulike reglene for ordningene.',sections:a.copy.sections.map((s,index)=>({index,evidence:s.paragraphs[0],function:'Seksjonen forklarer den konkrete mekanismen bak utbetalingene.',transition:'Overgangen fører fra utbetalt beløp til hva regelendringen betyr.',repetition:'Avsnittene tilfører ny dokumentasjon fremfor å gjenta ingressen.'})),warningDecisions:diagnoseArticle(a).warnings.map(w=>({warningHash:digest(w),decision:'keep',reason:'Testfixture for dokumentert vurdering av et språklig faresignal.'})),summary:'Presisjon integrert i aktive verb og naturlige overganger.',changes:[{before:'Det er viktig å presisere at utviklingen var ulik.',after:'Ordningene utviklet seg ulikt gjennom perioden.',reason:'Fjerner metatekst og beholder den faktiske presiseringen.'}]},
  factcheck:{summary:'Kontrollert alle tekstblokker mot det frosne kildegrunnlaget.',assessment:assessment(a)},
  editor:{summary:'Kontrollert hele fortellingen, målestokken og den endelige teksten.',assessment:assessment(a),...(signed?{attestation:signReview(a,assessment(a))}:{})},
})
function complete(a, signed=true) {
  let run=newEditorialRun(a,{at})
  for(const [stage,value] of Object.entries(payloads(a,signed)))run=checkpoint(run,a,stage,value,{at,model,key:`unique checkpoint ${stage}`})
  return run
}
test('historiske publiseringshashes og alle tidligere artikler er bevart',()=>{
  for(const a of all){validateArticle(a,{published:true});assert.equal(contentHash(a),a.approval.contentHash)}
})
test('nytt format kan velge bort grafer uten at gamle artiklers regler endres',()=>{
  const a=article();validateArticle(a);assert.deepEqual(graphPlan(a.copy,a.report),[])
  delete a.copy.format;assert.throws(()=>validateArticle(a),/én til syv/)
})
test('intern godkjenning bindes til innhold, kildegrunnlag og gjeldende policy',()=>{
  const a=article(), result=finishEditorial(complete(a),a,{reviewVerification})
  assert.equal(result.run.status,'approved');a.editorial=result.editorial
  assertEditorialApproval(a,reviewVerification);validateArticle(a,{reviewVerification})
  a.copy.lead+=' En ny vesentlig påstand.'
  assert.throws(()=>assertEditorialApproval(a),/gjeldende versjon/)
  assert.throws(()=>validateArticle(a),/utdatert/)
})
test('høy totalscore overstyrer aldri faktastopp eller manglende kildespor',()=>{
  const a=article(), e=assessment(a)
  e.findings=[{severity:'blocker',observation:'En materiell årsakspåstand mangler dokumentasjon.',action:'Hent primærkilden eller fjern den udokumenterte årsaken.'}]
  assert.equal(validateAssessment(a,e).meetsRubric,false)
  e.claimChecks.pop();assert.throws(()=>validateAssessment(a,e),/Alle tekstblokker/)
  const f=assessment(a);f.claimChecks[0].sources=['https://invented.invalid/']
  assert.throws(()=>validateAssessment(a,f),/kildespor/)
})
test('nye tall må ha både kontrollerte fakta og seksjonsspor',()=>{
  const a=article();a.copy.sections[0].factIds=[]
  assert.ok(diagnoseArticle(a).blockers.some(b=>b.kind==='citation'))
  a.copy.sections[0].paragraphs[0]+=' Utbetalingen var 100 kroner.'
  assert.ok(diagnoseArticle(a).blockers.some(b=>b.kind==='schema'))
})
test('checkpoint er idempotent, avviser ombruk av nøkkel og hindrer hopp i løypen',()=>{
  const a=article(),r=newEditorialRun(a,{at}),p=payloads(a)
  assert.throws(()=>checkpoint(r,a,'editor',p.editor,{at,model,key:'unique checkpoint editor'}),/tidligere/)
  const opts={at,model,key:'unique checkpoint research'}
  const next=checkpoint(r,a,'research',p.research,opts)
  assert.strictEqual(checkpoint(next,a,'research',p.research,opts),next)
  assert.throws(()=>checkpoint(next,a,'research',{...p.research,summary:'Et annet innhold i samme arbeidssteg.'},opts),/Idempotensnøkkelen/)
  const other=structuredClone(a);other.report.sources[0].name+=' endret'
  assert.throws(()=>checkpoint(next,other,'angle',p.angle,{at,model,key:'unique checkpoint angle'}),/Rapport/)
})
test('arbeidsgrense og revisjonsgrense blokkerer fremfor å godkjenne',()=>{
  const a=article(), r=newEditorialRun(a,{at});r.usage=[{workUnits:policy.maxWorkUnits}]
  const blocked=checkpoint(r,a,'research',payloads(a).research,{at,model,key:'unique checkpoint research'})
  assert.equal(blocked.status,'blocked');assert.throws(()=>finishEditorial(blocked,a),/blokkert/)
  let revision=newEditorialRun(a,{at})
  for(let i=0;i<4;i++)revision=reviseRun(revision,'draft','Teksten trenger en ny og mer konkret hovedfortelling.',{at})
  assert.equal(revision.status,'blocked')
})
test('revisjon invaliderer senere kontroller; samtalemodus starter ingen redaksjon',()=>{
  const a=article(),run=complete(a), revised=reviseRun(run,'visual','Grafene må flyttes og vurderes på nytt i artikkelen.',{at})
  assert.ok(revised.completed.draft);assert.equal(revised.completed.editor,undefined)
  assert.throws(()=>newEditorialRun(a,{mode:'conversational'}),/Vanlig chat/)
})
test('lokale checkpoints har atomisk lagring, konfliktvern og gjenopptakelse',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sven-'))
  try{
    const path=join(dir,'run.json'),run=newEditorialRun(article(),{at});saveRun(path,run)
    assert.throws(()=>saveRun(path,run),/finnes allerede/)
    saveRun(path,{...run,revision:1},0)
    assert.throws(()=>saveRun(path,{...run,revision:2},0),/annen prosess/)
    assert.equal(JSON.parse(readFileSync(path)).revision,1)
  }finally{rmSync(dir,{recursive:true})}
})
test('skills lastes selektivt og med hashkontroll',()=>{
  assert.deepEqual(loadSkills('draft').skills.map(s=>s.id),['storytelling','language'])
  assert.equal(loadSkills('conversational').skills.length,0)
})
test('grafer godtar kontrollerte serievarianter og sperrer egne data',()=>{
  const a=article(),g={kind:'series',afterSection:0,mode:'values',chartType:'small-multiples',focus:0,series:[{source:'post',id:'barnetrygd'}]}
  assert.equal(seriesGraph(g,a.report).series.length,1)
  a.copy.graphs=[g];validateArticle(a)
  g.focus=2;assert.throws(()=>graphPlan(a.copy,a.report),/Fremhevingen/)
  g.focus=0;g.values=[1,2];assert.throws(()=>graphPlan(a.copy,a.report),/egne verdier/)
})
test('visuell evaluering krever ekte, versjonsbundne bilder og begge skjermstørrelser',()=>{
  const a=article();a.copy.graphs=[{kind:'series',afterSection:0,mode:'values',series:[{source:'post',id:'barnetrygd'}]}]
  let run=newEditorialRun(a,{at}),p=payloads(a)
  for(const s of ['research','angle','draft'])run=checkpoint(run,a,s,p[s],{at,model,key:`unique checkpoint ${s}`})
  assert.throws(()=>checkpoint(run,a,'visual',p.visual,{at,model,key:'unique checkpoint visual'}),/mobil og desktop/)
})
test('capture aksepterer ikke eksterne adresser eller uautoriserte protokoller',async()=>{
  await assert.rejects(captureEditorial({url:'https://fellestall.no/',article:article(),output:'/tmp/no-capture'}),/lokal/)
  await assert.rejects(captureEditorial({url:'file://localhost/etc/passwd',article:article(),output:'/tmp/no-capture'}),/lokal/)
})
test('redaksjonelle skills gjenbruker signert læringsregister, holdoutvern og automatisk rollback',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sven-skills-')),root=dir+'/'
  const {publicKey,privateKey}=generateKeyPairSync('ed25519')
  const now=Date.parse(at),registry=openLearningRegistry(':memory:',{publicKey,holdoutHashes:['private-test-holdout'],domains:['language','economy'],clock:()=>now})
  const envelope=report=>{const payload=JSON.stringify({id:randomUUID(),issuedAt:at,expiresAt:'2026-11-26T21:00:00Z',...report});return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}}
  try{
    cpSync(skillRoot,root,{recursive:true})
    const content=readFileSync(root+JSON.parse(readFileSync(root+'registry.json')).skills.language.file,'utf8')+'\nTillegg: La årsakskjeden styre naturlige overganger mellom avsnittene.\n'
    const experiment=proposeSkill({registry,root,skill:'language',content,hypothesis:'Tydeligere årsakskjede gir bedre flyt og mindre gjentakelse.',evidence:[{source:'fixture',articleHash:'a'.repeat(64),observation:'Testfixture viser gjentatt forklaring i flere ulike avsnitt.'}]})
    assert.throws(()=>activateSkill(experiment,{registry,root}),/feil kandidat/)
    assert.throws(()=>proposeSkill({registry,skill:'review',content}),/avgrenset/)
    const report={kind:'evaluation',candidateId:experiment.candidate.id,baselineId:experiment.baseline.id,holdoutHash:'private-test-holdout',criticalErrors:0,privacyPassed:true,publicationPolicyPassed:true,costRatio:1,domains:['language','economy'].map(name=>({name,cases:30,candidateScore:3.8,baselineScore:3.5}))}
    const invalid=envelope(report);invalid.signature='invalid'
    assert.throws(()=>activateSkill(experiment,{registry,root,attestation:invalid}),/signatur/)
    assert.throws(()=>activateSkill(experiment,{registry,root,attestation:envelope({...report,holdoutHash:'public-training-set'})}),/Testsettet/)
    const tampered=structuredClone(experiment);tampered.asset.hash='a'.repeat(64)
    assert.throws(()=>activateSkill(tampered,{registry,root,attestation:envelope(report)}),/signert profil/)
    const active=activateSkill(experiment,{registry,root,attestation:envelope(report),at})
    assert.equal(active.status,'active');assert.equal(loadSkills('language',{root}).skills[0].version,3)
    const replay=activateSkill(experiment,{registry,root})
    assert.equal(replay.status,'active')
    const monitor=envelope({kind:'monitor',candidateId:experiment.candidate.id,criticalErrors:1,privacyPassed:true,publicationPolicyPassed:true})
    const rolled=monitorSkill(active,{registry,root,attestation:monitor,at})
    assert.equal(rolled.status,'rolled-back');assert.equal(loadSkills('language',{root}).skills[0].version,2)
    assert.equal(registry.current().id,experiment.baseline.id)
  }finally{registry.close();rmSync(dir,{recursive:true})}
})
test('redaksjonelt benchmark utvider eksisterende blinding til to kandidater og ni dimensjoner',()=>{
  const manifest=editorialBenchmark({asOf:'2026-11-26'})
  assert.equal(manifest.cases.length,10)
  const submissions=manifest.cases.flatMap(c=>manifest.products.map(product=>({product,caseId:c.id,answer:'Testfixture for samme oppgave og kildegrunnlag.',model:'fixture',productVersion:'1',runAt:at,tools:[],elapsedSeconds:1,status:'completed',manifestHash:digest(manifest)})))
  const {review,key}=blindBenchmark(manifest,submissions)
  assert.equal(review.dimensions.length,9)
  const ratings=review.cases.flatMap(c=>c.answers.map(a=>({caseId:c.id,label:a.label,reviewHash:digest(review),criticalError:false,reason:'Testfixture for den blinde kvalitetsvurderingen.',scores:Object.fromEntries(review.dimensions.map(d=>[d,3]))})))
  const result=scoreBenchmark(review,key,ratings)
  assert.equal(result.paired.length,1);assert.equal(result.rows.length,20)
})
test('orkestrering gjenopptar kontrollerte steg og stopper ved uavklart modellresultat',async()=>{
  const a=article(),p=payloads(a,true),writes=[],calls=[]
  const first=await runEditorial({article:a,run:newEditorialRun(a,{at}),model,now:()=>at,reviewVerification,
    executeStage:async({stage})=>{calls.push(stage);return {value:p[stage]}},persist:async r=>writes.push(structuredClone(r))})
  assert.equal(first.run.status,'approved');assert.equal(calls.length,7)
  assertEditorialApproval(first.article,reviewVerification)
  const resumed=await runEditorial({article:a,run:first.run,model,reviewVerification,executeStage:async()=>{throw Error('Må ikke kalles på nytt')}})
  assert.equal(resumed.run.status,'approved');assert.equal(writes.length,15)
  const pending={...newEditorialRun(a,{at}),pending:{stage:'research'}}
  await assert.rejects(runEditorial({article:a,run:pending,model}),/uavklart resultat/)
})
test('arbeidssteg kan ikke godkjennes med manipulert eller ufullstendig sluttvurdering',()=>{
  const a=article(),result=finishEditorial(complete(a),a,{reviewVerification})
  a.editorial=result.editorial
  a.editorial.assessment.findings=[{severity:'blocker',observation:'En materiell feil ble oppdaget etter første vurdering.',action:'Revider hovedpåstanden og kontroller kilden på nytt.'}]
  assert.throws(()=>validateArticle(a),/samsvarer ikke/)
})
test('autonom skill-utvikling bruker eksisterende læringssyklus og signert uavhengig evaluering',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sven-cycle-')),root=dir+'/'
  const {publicKey,privateKey}=generateKeyPairSync('ed25519')
  const registry=openLearningRegistry(':memory:',{publicKey,holdoutHashes:['private-cycle'],domains:['language'],clock:()=>Date.parse(at)})
  const events=[]
  try{
    cpSync(skillRoot,root,{recursive:true})
    const result=await runEditorialLearning({registry,root,skill:'language',signals:{tooVerbose:4},
      evidence:[{source:'test-only-feedback',articleHash:'b'.repeat(64),observation:'Testfixture viser gjentatte generelle overganger i teksten.'}],
      request:async input=>{
        assert.match(input.phase,/editorial-learning/);assert.doesNotMatch(input.input,/private-cycle/)
        return {content:[{type:'text',text:JSON.stringify({hypothesis:'Konkrete overganger vil gi bedre flyt uten å fjerne presisjon.',content:readFileSync(root+JSON.parse(readFileSync(root+'registry.json')).skills.language.file,'utf8')+'\nTestkandidat med tydeligere overgang mellom målestokkene.\n'})}]}
      },evaluate:async({candidate,baseline})=>{
        const payload=JSON.stringify({id:randomUUID(),issuedAt:at,expiresAt:'2026-11-26T21:00:00Z',kind:'evaluation',candidateId:candidate.id,baselineId:baseline.id,holdoutHash:'private-cycle',criticalErrors:0,privacyPassed:true,publicationPolicyPassed:true,costRatio:1,domains:[{name:'language',cases:30,candidateScore:3.8,baselineScore:3.5}]})
        return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}
      },checkpoint:async event=>events.push(event)})
    assert.equal(result.attempts[0].accepted,true)
    assert.equal(loadSkills('language',{root}).skills[0].version,3)
    assert.ok(events.some(e=>e.phase==='editorial-activation'))
  }finally{registry.close();rmSync(dir,{recursive:true})}
})
test('forhåndsutfylte egenpoeng kan aldri gi intern godkjenning',()=>{
  const a=article(),run=complete(a,false)
  const result=finishEditorial(run,a,{reviewVerification})
  assert.equal(result.run.status,'needs-review')
  assert.equal(result.editorial.review.verified,false)
  assert.equal(result.editorial.score,92)
  a.editorial={...result.editorial,status:'approved'}
  assert.throws(()=>assertEditorialApproval(a,reviewVerification),/Uavhengig redaksjonell kontroll mangler/)
  assert.throws(()=>validateArticle(a),/Uavhengig redaksjonell kontroll mangler/)
})
test('runner stanser ved manglende uavhengig vurdering uten å omskrive eller gi seg selv nye poeng',async()=>{
  const a=article(),calls=[],p=payloads(a)
  const result=await runEditorial({article:a,run:newEditorialRun(a,{at}),model,now:()=>at,reviewVerification,
    executeStage:async({stage})=>{calls.push(stage);return{value:p[stage]}}})
  assert.equal(result.run.status,'needs-review');assert.equal(result.run.revisions,0)
  assert.equal(calls.length,7)
})
test('signaturen må komme fra betrodd evaluator og gjelde aktuell tekst, vurdering og tidspunkt',()=>{
  const a=article(),rating=assessment(a),envelope=signReview(a,rating)
  assert.equal(verifyEditorialReview(a,rating,envelope,reviewVerification).verified,true)
  const wrong=generateKeyPairSync('ed25519')
  assert.equal(verifyEditorialReview(a,rating,{...envelope,signature:sign(null,Buffer.from(envelope.payload),wrong.privateKey).toString('base64')},reviewVerification).verified,false)
  assert.equal(verifyEditorialReview(a,rating,envelope,{...reviewVerification,now:Date.parse('2026-11-28T20:00:00Z')}).verified,false)
  a.copy.lead+=' En endret setning som krever ny kontroll.'
  assert.equal(verifyEditorialReview(a,rating,envelope,reviewVerification).verified,false)
  const changed=structuredClone(rating);changed.dimensions.language.score=100
  assert.equal(verifyEditorialReview(article(),changed,envelope,reviewVerification).verified,false)
})
test('ett løsrevet før-/ettereksempel dekker ikke artikkelens språk og flyt',()=>{
  const a=article(),p=payloads(a);let run=newEditorialRun(a,{at})
  for(const s of ['research','angle','draft','visual'])run=checkpoint(run,a,s,p[s],{at,model,key:`language regression setup ${s}`})
  const old={summary:p.language.summary,changes:p.language.changes}
  assert.throws(()=>checkpoint(run,a,'language',old,{at,model,key:'language regression old payload'}),/hver seksjon/)
  const missing=structuredClone(p.language);missing.sections.pop()
  assert.throws(()=>checkpoint(run,a,'language',missing,{at,model,key:'language regression incomplete'}),/hver seksjon/)
  const invented=structuredClone(p.language);invented.sections[0].evidence='Et sitat som aldri har stått i artikkelen.'
  assert.throws(()=>checkpoint(run,a,'language',invented,{at,model,key:'language regression invented quote'}),/hver seksjon/)
})
test('brukerens eksempel oppdages uten at nødvendige forbehold forbys',()=>{
  const a=article();a.copy.sections[0].paragraphs.push('Slike gevinster er muligheter reformen må prøves mot, ikke resultater den allerede har levert.')
  assert.ok(diagnoseArticle(a).warnings.some(w=>w.kind==='epistemic-scaffolding'))
  a.copy.sections[0].paragraphs.pop()
  a.copy.sections[0].paragraphs.push('Befolkningstall og avtalte årsverk måler ikke antall pasienter på en vakt.')
  assert.equal(diagnoseArticle(a).warnings.filter(w=>w.kind==='epistemic-scaffolding').length,0)
})
test('registrerte vurderinger kan ikke erstattes etter at kontrollsteget er fullført',()=>{
  const a=article(),run=complete(a)
  run.completed.language.value.summary='En ny etterregistrert vurdering som ikke ble utført i steget.'
  assert.throws(()=>finishEditorial(run,a,{reviewVerification}),/endret etter registrering/)
})
test('utløp hindrer ny godkjenning uten å ødelegge et allerede godkjent artikkelarkiv',()=>{
  const a=article(),result=finishEditorial(complete(a),a,{reviewVerification})
  a.editorial=result.editorial;a.status='published';a.publishedAt=at
  a.approval={reviewer:'human fixture',approvedAt:at,contentHash:contentHash(a)}
  const later={...reviewVerification,now:Date.parse('2026-11-28T20:00:00Z')}
  validateArticle(a,{published:true,reviewVerification:later})
  assert.throws(()=>assertEditorialApproval(a,later),/utløpt/)
})
