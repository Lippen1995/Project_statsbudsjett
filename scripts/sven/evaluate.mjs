import { fileURLToPath, pathToFileURL } from 'node:url'
import { analyzeWithSven } from '../../server/sven/analysis.mjs'
import { anthropicSven } from '../../server/sven/anthropic.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))

// Fixed regression cases. Keep future blind evaluation material outside this repository.
const cases = [
  {
    id: 'stavanger-netto-2025',
    surface: 'chat',
    question: 'Hva var netto driftsutgifter per innbygger i Stavanger i 2025? Oppgi hele kroner.',
    expectations: [{ sourceId: 'kostra-net-expenses-1103', value: /\b80[\s.,]?909\b/u }],
  },
  {
    id: 'olje-budsjettfase-2027',
    surface: 'editorial',
    question: 'Hvor mange milliarder kroner i strukturell oljepengebruk legger budsjettforslaget for 2027 opp til? Angi budsjettfase og bruk to desimaler.',
    expectations: [{ value: /\b608[,.]43\b/u, word: /forslag/iu }],
  },
]

export async function evaluateSven(generate) {
  const rows = []
  for (const { id, surface, question, expectations } of cases) {
    try {
      const sources = await resolveSvenSources(question, dataDir)
      const answer = await analyzeWithSven({ question, sources, surface }, generate)
      const verified = expectations.every(expected => answer.findings.some(finding =>
        expected.value.test(finding.text) &&
        (!expected.word || expected.word.test(finding.text)) &&
        (!expected.sourceId || finding.sourceIds.includes(expected.sourceId))))
      rows.push({ id, passed: verified, ...(verified ? {} : { reason: 'Forventet tall, budsjettfase eller kilde mangler i den kildebelagte delen av svaret.' }) })
    } catch {
      rows.push({ id, passed: false, reason: 'Kildeoppslag eller gyldig modellsvar mangler.' })
    }
  }
  return rows
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const rows = await evaluateSven(anthropicSven())
    console.log(JSON.stringify(rows, null, 2))
    if (rows.some(row => !row.passed)) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
