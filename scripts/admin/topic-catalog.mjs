import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { suggestPipelineTopic } from '../analyser/pipeline-reports.mjs'

// Build from the very same verified data that is published with this deployment.
// Each option already has a concrete plan for the existing research workflow.
export function buildTopicCatalog({ dataDir = fileURLToPath(new URL('../../web/public/data', import.meta.url)), published = JSON.parse(readFileSync(new URL('../../web/src/analyser/publications.json', import.meta.url), 'utf8')), at = new Date().toISOString() } = {}) {
  const topics = []
  const history = []
  const reportCache = new Map()
  for (let i = 0; i < 100; i++) {
    const suggestion = suggestPipelineTopic(dataDir, published, { history }, at, { reportCache })
    if (!suggestion) break
    if (topics.some(t => t.topicKey === suggestion.topicKey)) throw Error('Duplisert forslag i Svens tallgrunnlag')
    const focused = {
      'pension-expenditure': ['Hvordan utvikler utgiftene til alderspensjon seg?', 'Undersøk den konkrete alderspensjonsposten, prisvekst og befolkningsutvikling. Skill pensjonsutgifter fra øvrig offentlig pengebruk.'],
      'temporary-crisis-support': ['Hva skjedde med de midlertidige kriseutgiftene?', 'Følg de konkrete dagpenge- og kompensasjonspostene før, under og etter pandemien. Skill ordinære ordninger fra midlertidig støtte.'],
      'military-support': ['Hvordan utvikler den militære støtten til Ukraina seg?', 'Undersøk den konkrete militære støtteposten. Skill den fra øvrig Ukraina-støtte og statens samlede forsvarsutgifter.'],
    }[suggestion.reportPlan.question]
    if (focused) { suggestion.topic = focused[0]; suggestion.instructions = focused[1] + ' Dokumenter primærkilder, avgrensninger og usikkerhet.' }
    topics.push(suggestion)
    history.push({ entry: { topicKey: suggestion.topicKey } })
  }
  return { version: 1, builtAt: at, topics }
}
