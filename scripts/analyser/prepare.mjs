import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { githubClient } from './github.mjs'
import { analysisSettings } from './config.mjs'
import { nextReport } from './candidates.mjs'
import { pendingFeedback, readReviewContext } from './workflow.mjs'
import { validateArticle } from './schema.mjs'

const output = process.argv[2]
if (!output || !/^editorial\/handoff\/[a-z0-9-]+\.json$/.test(output))
  throw Error('Oppgi editorial/handoff/<navn>.json som utfil')
if (!analysisSettings().enabled) throw Error('Analyselevering er deaktivert')
const g = githubClient()
const number = Number(process.argv[3])
let packet
if (process.argv[3]) {
  if (!Number.isSafeInteger(number) || number < 1) throw Error('Ugyldig gjennomgangsnummer')
  const { pr, article } = await readReviewContext(g, { issue: { number } })
  const feedback = await pendingFeedback(g, number, article)
  if (!feedback.length) throw Error('Ingen ubehandlede endringsønsker')
  packet = {
    article,
    base: {
      number,
      head: pr.head.sha,
      feedback: feedback.map((f) => `${f.user}: ${f.body}`).join('\n\n'),
    },
  }
} else {
  const open = await g.pages('/pulls?state=open&base=main')
  if (open.some((pr) => /^analysis\/weekly-/.test(pr.head.ref)))
    throw Error('Et utkast venter allerede på gjennomgang; behandle dette først')
  const published = (await g.content('web/src/analyser/publications.json')).value
  published.forEach((a) => validateArticle(a, { published: true }))
  const report = nextReport('web/public/data', published)
  if (!report) throw Error('Ingen ny dokumentert problemstilling')
  const createdAt = new Date().toISOString()
  packet = {
    article: {
      slug: `utgifter-per-innbygger-${report.scopeId}-${report.start}-${report.end}-${createdAt.slice(0, 10)}`,
      status: 'draft',
      createdAt,
      generatedAt: createdAt,
      topic: report.scopeId === 'state' ? 'Statsfinanser' : report.scopeName,
      geography: 'Staten',
      type: 'Utvikling over tid',
      report,
      copy: null,
    },
  }
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(packet, null, 2) + '\n')
console.log(
  `Kontrollert grunnlag lagret i ${output}. AI skal skrive article.copy og validere før levering.`,
)
