// Editorial asset adapter for the EXISTING signed learning registry and benchmark.
// No second evaluator, holdout authority, activation threshold or learning database.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { digest, policyHash, dimensions } from './editorial-policy.mjs'
import { skillRoot } from './editorial-skills.mjs'
import { saveRun } from './editorial.mjs'
import { prepareBenchmark, blindBenchmark, scoreBenchmark } from '../../server/sven/benchmark.mjs'
import { candidateId } from '../../server/sven/tuning.mjs'
import { runLearningCycle } from '../../server/sven/learning-cycle.mjs'
import { parseModelJSON } from '../../server/sven/provider.mjs'

export const benchmarkPath = new URL('./editorial-benchmark.json', import.meta.url)
const editable = ['language','storytelling','visual']
const read = path => JSON.parse(readFileSync(path,'utf8'))
const sameAsset = (a,b) => a?.file===b?.file && a?.hash===b?.hash && a?.version===b?.version
function profileAsset(skill, profile, root) {
  const expected=profile.settings.editorialSkills?.[skill]
  const file=expected ? readdirSync(root).find(name=>new RegExp(`^${skill}-v[1-9][0-9]*\\.md$`).test(name) && digest(readFileSync(root+name,'utf8'))===expected) : `${skill}-v1.md`
  if(!file)throw Error('Den signerte profilens skill-fil mangler')
  return {file,hash:expected??digest(readFileSync(root+file,'utf8')),version:Number(/-v(\d+)\.md$/.exec(file)[1])}
}
function validateExperiment(experiment, root) {
  if(!editable.includes(experiment.skill) || candidateId(experiment.candidate.settings)!==experiment.candidate.id ||
    candidateId(experiment.baseline.settings)!==experiment.baseline.id ||
    experiment.candidate.settings.editorialSkills?.[experiment.skill]!==experiment.asset.hash ||
    experiment.asset.file!==`${experiment.skill}-v${experiment.asset.version}.md` ||
    !Number.isSafeInteger(experiment.asset.version) || experiment.asset.version<2 ||
    digest(readFileSync(root+experiment.asset.file,'utf8'))!==experiment.asset.hash ||
    !sameAsset(profileAsset(experiment.skill,experiment.baseline,root),experiment.previousAsset))
    throw Error('Skill-filen eller tilbakeføringsversjonen samsvarer ikke med signert profil')
}
export function proposeSkill({ registry, skill, content, hypothesis, evidence, root = skillRoot }) {
  if (!registry || !editable.includes(skill) || typeof content !== 'string' || content.length < 200 || content.length > 12000 ||
      typeof hypothesis !== 'string' || hypothesis.length < 20 || !Array.isArray(evidence) || !evidence.length ||
      evidence.some(e=> typeof e.source !== 'string' || !e.source || !/^[a-f0-9]{64}$/.test(e.articleHash) || typeof e.observation !== 'string' || e.observation.length < 20))
    throw Error('Kandidater krever eksisterende læringsregister, avgrenset skill, hypotese og sporbare svakheter')
  const baseline=registry.current(), assets=read(root+'registry.json'), hash=digest(content)
  const version=1+Math.max(assets.skills[skill].version,...assets.history.filter(h=>h.skill===skill).map(h=>h.version??1),
    ...readdirSync(root).flatMap(name=>new RegExp(`^${skill}-v([1-9][0-9]*)\\.md$`).exec(name)?.slice(1).map(Number)??[]))
  const file=`${skill}-v${version}.md`
  try {writeFileSync(root+file,content,{flag:'wx'})}
  catch(e){if(e.code!=='EEXIST'||digest(readFileSync(root+file,'utf8'))!==hash)throw e}
  const candidate=registry.propose({...baseline.settings,editorialSkills:{...baseline.settings.editorialSkills,[skill]:hash}})
  return {version:1,skill,candidate,baseline,asset:{version,file,hash},previousAsset:profileAsset(skill,baseline,root),
    policyHash,benchmarkHash:digest(read(benchmarkPath)),hypothesis,evidence,status:'candidate'}
}
export function editorialBenchmark({asOf,products=['active','candidate']}={}) {
  const tasks=read(benchmarkPath).tasks
  return prepareBenchmark(tasks.map(t=>({id:t.id,domain:t.topic,question:t.prompt,surface:'editorial'})),
    {asOf,products,evaluationDimensions:Object.keys(dimensions),referenceProduct:products[0]})
}
export { blindBenchmark, scoreBenchmark }
export function activateSkill(experiment,{registry,attestation,root=skillRoot,at=new Date().toISOString()}={}) {
  validateExperiment(experiment,root)
  if(!registry || experiment.policyHash!==policyHash || experiment.benchmarkHash!==digest(read(benchmarkPath)) ||
    !editable.includes(experiment.skill) || digest(readFileSync(root+experiment.asset.file,'utf8'))!==experiment.asset.hash)
    throw Error('Kandidatens grunnlag eller skill-innhold er endret')
  const active=registry.current()
  if(active.id===experiment.candidate.id && digest(active.settings)!==digest(experiment.candidate.settings))throw Error('Den aktive profilen samsvarer ikke med kandidaten')
  // Resume asset synchronization after a registry activation whose file write was interrupted.
  if(active.id!==experiment.candidate.id) {
    if(active.id!==experiment.baseline.id)throw Error('En nyere kandidat er aktiv')
    const report=JSON.parse(attestation?.payload??'null')
    if(report?.kind!=='evaluation'||report.candidateId!==experiment.candidate.id||report.baselineId!==experiment.baseline.id)throw Error('Evalueringen gjelder feil kandidat')
    const decision=registry.apply(attestation)
    if(!decision.accepted)throw Error(decision.reason)
  }
  const assets=read(root+'registry.json')
  if(assets.skills[experiment.skill].hash!==experiment.asset.hash) {
    if(!sameAsset(assets.skills[experiment.skill],experiment.previousAsset))throw Error('En annen prosess har endret skill-versjonen')
    saveRun(root+'registry.json',{...assets,revision:assets.revision+1,
      skills:{...assets.skills,[experiment.skill]:experiment.asset},history:[...assets.history,
        {skill:experiment.skill,version:experiment.asset.version,at,action:'activate',before:experiment.previousAsset,after:experiment.asset,
          candidateId:experiment.candidate.id,policyHash,hypothesis:experiment.hypothesis}]},assets.revision)
  }
  return {...experiment,status:'active',activatedAt:at}
}
export function monitorSkill(experiment,{registry,attestation,root=skillRoot,at=new Date().toISOString()}={}) {
  validateExperiment(experiment,root)
  if(experiment.status!=='active')throw Error('Kandidaten er ikke aktiv')
  const report=JSON.parse(attestation?.payload??'null')
  if(report?.kind!=='monitor'||report.candidateId!==experiment.candidate.id)throw Error('Overvåkingen gjelder feil kandidat')
  const decision=registry.apply(attestation) // existing signature, replay, privacy and critical-error checks
  if(!decision.accepted)return experiment
  const assets=read(root+'registry.json')
  if(assets.skills[experiment.skill].hash!==experiment.asset.hash)throw Error('En nyere skill-versjon er aktiv; ikke overskriv den')
  saveRun(root+'registry.json',{...assets,revision:assets.revision+1,
    skills:{...assets.skills,[experiment.skill]:experiment.previousAsset},history:[...assets.history,
      {skill:experiment.skill,version:experiment.asset.version,at,action:'rollback',candidateId:experiment.candidate.id}]},assets.revision)
  return {...experiment,status:'rolled-back'}
}

// Uses the existing bounded autonomous cycle and its signed evaluator. Only
// generalized observations and article hashes enter candidate generation.
export async function runEditorialLearning({registry,request,evaluate,skill,evidence,signals,
  root=skillRoot,maxCandidates=2,checkpoint=async()=>{}}) {
  if(!editable.includes(skill)||!Array.isArray(evidence)||evidence.some(e=>Object.keys(e).some(k=>!['source','articleHash','observation'].includes(k))))
    throw Error('Redaksjonell læring krever avgrenset skill og dataminimert evidens')
  const experiments=new Map()
  const result=await runLearningCycle({registry,signals,request,evaluate,maxCandidates,checkpoint,
    propose:async({baseline,signals,attempt})=>{
      const current=profileAsset(skill,baseline,root)
      const proposed=parseModelJSON(await request({phase:`editorial-learning-${attempt}`,maxTokens:2400,
        instructions:'Forbedre bare denne avgrensede redaksjonelle skillen ut fra de dokumenterte svakhetene. Bevar faktakrav, politisk integritet, personvern og publiseringsvern. Ikke endre verktøy, modeller, evalueringsstandard eller holdout. Oppgi en testbar hypotese; hev ingen kvalitetsgevinst før signert uavhengig evaluering. Returner JSON med hypothesis og content (hele skillen).',
        input:JSON.stringify({skill,content:readFileSync(root+current.file,'utf8'),signals,evidence})}))
      const experiment=proposeSkill({registry,skill,content:proposed.content,hypothesis:proposed.hypothesis,evidence,root})
      experiments.set(experiment.candidate.id,experiment)
      await checkpoint({phase:'editorial-candidate',skill,candidateId:experiment.candidate.id,hypothesis:experiment.hypothesis})
      return experiment.candidate.settings
    },onDecision:async({candidate,decision})=>{
      if(decision.accepted){const active=activateSkill(experiments.get(candidate.id),{registry,root});await checkpoint({phase:'editorial-activation',...active})}
    }})
  return {...result,experiments:[...experiments.values()].map(e=>({candidateId:e.candidate.id,skill:e.skill,asset:e.asset,hypothesis:e.hypothesis}))}
}
