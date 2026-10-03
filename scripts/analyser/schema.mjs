import { createHash } from 'node:crypto'
import { calculateFacts } from './facts.mjs'
export const contentHash = (article) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        slug: article.slug,
        createdAt: article.createdAt,
        topic: article.topic,
        geography: article.geography,
        type: article.type,
        report: article.report,
        copy: article.copy,
      }),
    )
    .digest('hex')
const fields = ['title', 'description', 'lead', 'conclusion', 'linkedin']
export function validateCopy(copy, report) {
  if (!copy || fields.some((k) => typeof copy[k] !== 'string' || !copy[k].trim()))
    throw Error('Ufullstendig artikkeltekst')
  if (!Array.isArray(copy.sections) || copy.sections.length < 4 || copy.sections.length > 10)
    throw Error('Analysen må ha fire til ti faglige seksjoner')
  if (copy.description.length > 220 || copy.title.length > 120 || copy.linkedin.length > 1400)
    throw Error('Tittel, beskrivelse eller LinkedIn-tekst er for lang')
  const texts = [...fields.map((k) => copy[k])]
  for (const s of copy.sections) {
    if (
      typeof s.heading !== 'string' ||
      !s.heading ||
      !Array.isArray(s.paragraphs) ||
      !s.paragraphs.length ||
      s.paragraphs.some((p) => typeof p !== 'string' || !p.trim())
    )
      throw Error('Ufullstendig seksjon')
    if (!Array.isArray(s.factIds) || s.factIds.some((k) => !Object.hasOwn(report.facts, k)))
      throw Error('Ukjent faktahenvisning')
    texts.push(s.heading, ...s.paragraphs)
  }
  for (const text of texts) {
    const stripped = text.replace(/\{\{fact:([A-Za-z]+)\}\}/g, (_, key) => {
      if (!Object.hasOwn(report.facts, key)) throw Error(`Ukjent faktum: ${key}`)
      return ''
    })
    if (/\d|\{\{|\}\}|https?:\/\//.test(stripped))
      throw Error('Bruk kontrollerte faktumreferanser for alle tall; lenker legges til av systemet')
  }
  const words = copy.sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .split(/\s+/).length
  if (words < 450) throw Error('Analysen er for kort til en omfattende faglig gjennomgang')
  return copy
}
export function validateArticle(article, { published = false } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || article.slug === 'forhandsvisning')
    throw Error('Ugyldig analyseadresse')
  if (!Number.isFinite(Date.parse(article.createdAt))) throw Error('Ugyldig opprettelsesdato')
  if (
    ['topic', 'geography', 'type'].some((k) => typeof article[k] !== 'string' || !article[k].trim())
  )
    throw Error('Mangler tema, geografi eller analysetype')
  const r = article.report
  if (!r?.scopeId || !r.scopeName) throw Error('Mangler avgrensning')
  if (
    !r ||
    r.kind !== 'real-expenditure-per-capita' ||
    !/^[a-f0-9]{64}$/.test(r.dataHash) ||
    !Number.isFinite(Date.parse(r.dataUpdated))
  )
    throw Error('Mangler datagrunnlag')
  if (
    !Array.isArray(r.rows) ||
    r.rows.length < 2 ||
    r.rows.some((row) =>
      [
        'year',
        'expenditure',
        'population',
        'cpi',
        'perCapita',
        'nominalIndex',
        'priceIndex',
        'realPerCapita',
      ].some((k) => !Number.isFinite(row[k])),
    )
  )
    throw Error('Ugyldige grafdata')
  if (
    !r.facts ||
    Object.values(r.facts).some((f) => !Number.isFinite(f.value) || typeof f.text !== 'string')
  )
    throw Error('Ugyldige fakta')
  if (
    r.rows.length !== r.end - r.start + 1 ||
    r.rows.some(
      (row, i) =>
        row.year !== r.start + i || row.population <= 0 || row.cpi <= 0 || row.expenditure <= 0,
    )
  )
    throw Error('Ufullstendig eller ugyldig tidsserie')
  const first = r.rows[0],
    last = r.rows.at(-1)
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-10
  for (const row of r.rows) {
    const perCapita = (row.expenditure * 1e6) / row.population
    if (
      !near(row.perCapita, perCapita) ||
      !near(row.realPerCapita, (perCapita * last.cpi) / row.cpi) ||
      !near(row.nominalIndex, (perCapita / first.perCapita) * 100) ||
      !near(row.priceIndex, (row.cpi / first.cpi) * 100)
    )
      throw Error('Grafverdiene samsvarer ikke med regnestykket')
  }
  if (r.factsVersion !== undefined && r.factsVersion !== 2)
    throw Error('Ukjent versjon av faktagrunnlaget')
  if (
    JSON.stringify(r.facts) !==
    JSON.stringify(calculateFacts(first, last, r.factsVersion === 2 ? r.rows : undefined))
  )
    throw Error('Fakta samsvarer ikke med datagrunnlaget')
  if (
    !Array.isArray(r.methodology) ||
    !r.methodology.length ||
    !Array.isArray(r.limitations) ||
    !r.limitations.length ||
    !Array.isArray(r.sources) ||
    !r.sources.length ||
    r.sources.some((s) => !s.name || !/^https:\/\//.test(s.url))
  )
    throw Error('Metode, begrensninger eller kilder mangler')
  validateCopy(article.copy, r)
  if (
    published &&
    (article.status !== 'published' ||
      article.approval?.contentHash !== contentHash(article) ||
      !article.approval?.reviewer ||
      !Number.isFinite(Date.parse(article.approval?.approvedAt)) ||
      !Number.isFinite(Date.parse(article.publishedAt)))
  )
    throw Error('Den eksakte artikkel- og LinkedIn-versjonen mangler godkjenning')
  return article
}
