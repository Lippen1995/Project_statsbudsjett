import { readFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { nextBudgetReport } from './budget-report.mjs'
import { topicBlocked, focusedQuestions } from '../../web/src/analyser/topics.js'
export function nextReport(dataDir, published, { at = new Date().toISOString() } = {}) {
  const budget = nextBudgetReport(dataDir, published, {
    eligible: (r) => Date.parse(r.dataUpdated) <= Date.parse(at) && !topicBlocked(r, published, at),
  })
  if (budget) return budget
  const meta = JSON.parse(readFileSync(`${dataDir}/meta.json`))
  const nodes = JSON.parse(readFileSync(`${dataDir}/utgifter.json`))
  const end = meta.regnskap_aar.at(-1),
    start = meta.regnskap_aar[0]
  const recent = Math.max(start, end - 5)
  const departments = nodes.map((n) => n.id).sort()
  const options = [
    {},
    ...departments.map((departmentId) => ({ departmentId, start: recent, end })),
    { start: recent, end },
    ...departments.map((departmentId) => ({ departmentId, start, end })),
    ...Object.keys(focusedQuestions).map((question) => ({ question, start, end })),
  ]
  for (const option of options) {
    let report
    try {
      report = buildReport(dataDir, option)
    } catch (error) {
      // Newly created departments may not have a complete historical series.
      if (error.message.startsWith('Ingen utgifter for')) continue
      if (error.message.includes('Problemstillingen mangler')) continue
      throw error
    }
    const alreadyCovered = topicBlocked(report, published, at)
    if (!alreadyCovered) return report
  }
  return null
}
