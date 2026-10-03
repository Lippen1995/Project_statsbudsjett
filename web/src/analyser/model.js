export const analysisPath = (slug) => `/analyser/${slug}/`
export function factText(text, report) {
  return text.replace(/\{\{fact:([A-Za-z]+)\}\}/g, (_, key) => report.facts[key]?.text ?? '–')
}
export function archiveEntries(articles) {
  return articles.map((a) => ({
    slug: a.slug,
    topic: a.topic,
    geography: a.geography,
    type: a.type,
    publishedAt: a.publishedAt,
    copy: {
      title: factText(a.copy.title, a.report),
      description: factText(a.copy.description, a.report),
    },
    report: { start: a.report.start, end: a.report.end, facts: {} },
  }))
}
export function filterAnalyses(
  articles,
  { query = '', topic = '', geography = '', type = '' } = {},
) {
  const q = query.trim().toLocaleLowerCase('nb-NO')
  return articles
    .filter(
      (a) =>
        (!topic || a.topic === topic) &&
        (!geography || a.geography === geography) &&
        (!type || a.type === type) &&
        (!q ||
          [a.copy.title, a.copy.description, a.topic, a.geography, a.type]
            .join(' ')
            .toLocaleLowerCase('nb-NO')
            .includes(q)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug),
    )
}
export const displayDate = (value) =>
  new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  }).format(new Date(value))
export const number = (value, digits = 0) =>
  new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits }).format(value)
