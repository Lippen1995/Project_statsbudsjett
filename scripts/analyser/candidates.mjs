import { readFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { nextBudgetReport } from './budget-report.mjs'
import { topicBlocked, focusedQuestions, topicKey } from '../../web/src/analyser/topics.js'
export function nextReport(dataDir, published, { at = new Date().toISOString(), excludeTopicKeys = [], reportCache } = {}) {
  const budget = nextBudgetReport(dataDir, published, {
    eligible: (r) => Date.parse(r.dataUpdated) <= Date.parse(at) && !topicBlocked(r, published, at) && !excludeTopicKeys.includes(topicKey(r)),
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
    const cacheKey = JSON.stringify(option)
    if (reportCache?.has(cacheKey)) {
      report = reportCache.get(cacheKey)
      if (!report) continue
    } else {
      try {
        report = buildReport(dataDir, option)
        reportCache?.set(cacheKey, report)
      } catch (error) {
        // Newly created departments may not have a complete historical series.
        if (error.message.startsWith('Ingen utgifter for') || error.message.includes('Problemstillingen mangler')) { reportCache?.set(cacheKey, null); continue }
        throw error
      }
    }
    const alreadyCovered = topicBlocked(report, published, at)
    if (!alreadyCovered && !excludeTopicKeys.includes(topicKey(report))) return report
  }
  return null
}
