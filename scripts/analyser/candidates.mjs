import { readFileSync } from 'node:fs'
import { buildReport } from './report.mjs'
import { nextBudgetReport } from './budget-report.mjs'
export function nextReport(dataDir, published) {
  const budget = nextBudgetReport(dataDir, published)
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
  ]
  for (const option of options) {
    let report
    try {
      report = buildReport(dataDir, option)
    } catch (error) {
      // Newly created departments may not have a complete historical series.
      if (error.message.startsWith('Ingen utgifter for')) continue
      throw error
    }
    const alreadyCovered = published.some(
      (a) =>
        a.report.scopeId === report.scopeId &&
        a.report.kind === report.kind &&
        JSON.stringify(a.report.rows) === JSON.stringify(report.rows),
    )
    if (!alreadyCovered) return report
  }
  return null
}
