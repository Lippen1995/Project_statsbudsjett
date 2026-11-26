import {candidateSettings} from './learning.mjs'
import {parseModelJSON} from './provider.mjs'

// Only aggregate, explicitly enumerated error counts cross this boundary. No
// questions, political profiles, documents, user IDs or raw feedback are accepted.
const allowedSignals=['unsupportedClaim','wrongPeriod','wrongUnit','missingCounterEvidence','unwantedRecommendation','tooVerbose','tooBrief','toolFailure']
export function learningSignals(value) {
  if(!value || Object.keys(value).some(key=>!allowedSignals.includes(key)) || Object.values(value).some(count=>!Number.isSafeInteger(count)||count<0))throw new Error('Læring mottar bare aggregerte feiltellinger')
  return {...value}
}

export async function runLearningCycle({registry,signals,request,evaluate,maxCandidates=2,checkpoint=async()=>{}}) {
  const summary=learningSignals(signals)
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>3)throw new Error('Ugyldig iterasjonsbudsjett')
  const attempts=[]
  for(let i=0;i<maxCandidates;i++) {
    const baseline=registry.current()
    const candidate=candidateSettings(parseModelJSON(await request({phase:`learning-${i}`,maxTokens:500,
      instructions:'Foreslå én konfigurasjonsforbedring basert på aggregerte feil. Du kan kun endre maxSearches (heltall 3–10) og responseDensity (concise, balanced eller detailed). Endre aldri kildekrav, publiseringsregler, evaluering eller personvern. Svar kun med JSON med disse to feltene. Ikke hev at forslaget er bedre før uavhengig evaluering.',
      input:JSON.stringify({baseline:baseline.settings,signals:summary,previousAttempts:attempts.map(a=>({candidate:a.settings,accepted:a.accepted,reason:a.reason}))})})))
    const proposed=registry.propose(candidate)
    if(proposed.id===baseline.id || attempts.some(a=>a.id===proposed.id)) {
      attempts.push({...proposed,accepted:false,reason:'Kandidaten er uendret eller allerede prøvd'})
      await checkpoint(attempts.at(-1));continue
    }
    // evaluate is a separate service with its own held-out data and signing key.
    // The learner receives no test questions or answer keys.
    const attestation=await evaluate({candidate:proposed,baseline})
    const report=JSON.parse(attestation.payload)
    if(report.kind!=='evaluation'||report.candidateId!==proposed.id||report.baselineId!==baseline.id)throw new Error('Evaluatoren svarte for feil kandidat eller sammenligningsversjon')
    const decision=registry.apply(attestation)
    attempts.push({...proposed,accepted:decision.accepted,reason:decision.reason})
    await checkpoint(attempts.at(-1))
    if(decision.accepted)break
  }
  return {attempts,active:registry.current()}
}
