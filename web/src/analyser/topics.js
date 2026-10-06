// Editorial questions, not headings, broad subject tags, years or data hashes.
export const focusedQuestions = {
  'pension-expenditure': { evidence: ['alderspensjon'], label: 'Pensjonsutgifter' },
  'temporary-crisis-support': {
    evidence: ['dagpenger', 'koronakompensasjon'],
    label: 'Midlertidig krisestøtte',
  },
  'military-support': { evidence: ['ukrainastotte'], label: 'Militær støtte til Ukraina' },
}
export function topicKey(report) {
  if (report.kind === 'budget-comparison') {
    if (
      !Number.isInteger(report.year) ||
      !['initial', 'revised'].includes(report.phase) ||
      !['previous-budget-to-proposal', 'proposal-to-adopted-budget'].includes(report.comparison)
    )
      throw Error('Ukjent budsjettproblemstilling')
    // A new budget event is a different object, not a renamed historical topic.
    return `budget:${report.year}:${report.phase}:${report.comparison}`
  }
  if (report.kind !== 'real-expenditure-per-capita') throw Error('Ukjent analyseproblemstilling')
  const question = report.question ?? 'real-expenditure-growth'
  if (question !== 'real-expenditure-growth') {
    const definition = focusedQuestions[question]
    if (
      !definition ||
      !definition.evidence.every((id) => report.eventEvidence?.items.some((e) => e.id === id))
    )
      throw Error('Problemstillingen mangler sitt konkrete postgrunnlag')
    return `posts:${definition.evidence.join(',')}:${question}`
  }
  return `${report.scopeId}:${question}`
}
export function cooldownEnd(article) {
  const value = article.publishedAt ?? article.createdAt
  if (!value || !Number.isFinite(Date.parse(value))) return Infinity // Fail closed for undated history.
  const date = new Date(value),
    month = date.getUTCMonth()
  date.setUTCFullYear(date.getUTCFullYear() + 2)
  if (date.getUTCMonth() !== month) date.setUTCDate(0) // Leap day -> last day in February.
  return date.getTime()
}
export function topicBlocked(report, published, at = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(at))) throw Error('Ugyldig tidspunkt for temakontroll')
  const key = topicKey(report),
    time = Date.parse(at)
  return published.some((a) => topicKey(a.report) === key && time < cooldownEnd(a))
}
export function successorFor(article, published) {
  const time = Date.parse(article.publishedAt),
    key = topicKey(article.report)
  return (
    published
      .filter(
        (a) =>
          a.slug !== article.slug &&
          topicKey(a.report) === key &&
          Date.parse(a.publishedAt) >= time &&
          (a.replaces?.slug === article.slug ||
            (Date.parse(a.publishedAt) > time && Date.parse(a.publishedAt) < cooldownEnd(article))),
      )
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
  )
}
export function currentAnalyses(published) {
  return published.filter((a) => !successorFor(a, published))
}
