import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { githubClient } from './github.mjs'
import { analysisSettings } from './config.mjs'
import { nextReport } from './candidates.mjs'
import { pendingFeedback, readReviewContext } from './workflow.mjs'
import { validateArticle } from './schema.mjs'
import { articleMetadata } from './article-metadata.mjs'
import { nextBudgetReport } from './budget-report.mjs'
import { topicBlocked } from '../../web/src/analyser/topics.js'
import { buildOilReport } from './oil-report.mjs'

const output = process.argv[2]
if (!output || !/^editorial\/handoff\/[a-z0-9-]+\.json$/.test(output))
  throw Error('Oppgi editorial/handoff/<navn>.json som utfil')
if (!analysisSettings().enabled) throw Error('Analyselevering er deaktivert')
// Use the already authenticated CLI/proxy in native cloud tasks; no new token is requested.
const g = githubClient({ transport: 'gh' })
const number = Number(process.argv[3])
const budgetDay = /^--budget-year=(\d{4})$/.exec(process.argv[3] ?? '')
const budgetYear = budgetDay ? Number(budgetDay[1]) : null
const oil = /^--oil-year=(\d{4})$/.exec(process.argv[3] ?? '')
const oilYear = oil ? Number(oil[1]) : null
let packet
if (process.argv[3] && !budgetDay && !oil) {
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
  if (open.some((pr) => /^analysis\/weekly-/.test(pr.head.ref)) && !budgetDay && !oil)
    throw Error('Et utkast venter allerede på gjennomgang; behandle dette først')
  if (budgetDay) {
    for (const pr of open.filter((pr) => /^analysis\/weekly-/.test(pr.head.ref))) {
      const { article } = await readReviewContext(g, { issue: { number: pr.number } })
      const r = article.report
      if (
        r.kind === 'budget-comparison' &&
        r.year === budgetYear &&
        r.phase === 'initial' &&
        r.comparison === 'previous-budget-to-proposal'
      )
        throw Error('Dette budsjettforslaget har allerede et utkast til gjennomgang')
    }
  }
  const published = (await g.content('web/src/analyser/publications.json')).value
  published.forEach((a) => validateArticle(a, { published: true }))
  if (oil) {
    for (const pr of open.filter((pr) => /^analysis\/weekly-/.test(pr.head.ref))) {
      const { article } = await readReviewContext(g, { issue: { number: pr.number } })
      if (article.report.kind === 'oil-funds' && article.report.year === oilYear)
        throw Error('Denne oljepengeanalysen har allerede et utkast til gjennomgang')
    }
  }
  const report = oil ? buildOilReport('web/public/data', oilYear) : budgetDay
    ? nextBudgetReport('web/public/data', published, {
        eligible: (r) =>
          r.year === budgetYear &&
          r.phase === 'initial' &&
          r.comparison === 'previous-budget-to-proposal' &&
          !topicBlocked(r, published, new Date().toISOString()),
      })
    : nextReport('web/public/data', published)
  if (!report) throw Error('Ingen ny dokumentert problemstilling')
  if (oil && topicBlocked(report, published)) throw Error('Oljepengeanalysen er allerede dekket')
  const createdAt = new Date().toISOString()
  packet = {
    ...(oil ? { mode: 'oil-funds' } : budgetDay ? { mode: 'budget-day' } : {}),
    article: {
      ...articleMetadata(report, createdAt.slice(0, 10)),
      status: 'draft',
      createdAt,
      generatedAt: createdAt,
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
