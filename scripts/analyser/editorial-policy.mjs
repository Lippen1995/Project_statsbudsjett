// Trusted evaluation policy. Skill experiments must never write this module.
import { createHash } from 'node:crypto'
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const dimensions = Object.freeze({
  factual: 20, analysis: 20, language: 15, angle: 10, visual: 10,
  engagement: 10, structure: 5, precision: 5, pedagogy: 5,
})
export const policy = Object.freeze({ version: 2, target: 90, independentReviewRequired: true, maxRevisions: 3,
  maxWorkUnits: 40, maxElapsedMinutes: 180, dimensions })
export const policyHash = digest(policy)
export const editorialInputHash = (article) => digest({
  slug: article.slug, report: article.report, copy: article.copy,
  presentation: article.presentation ?? null, replaces: article.replaces ?? null,
})
export function copyBlocks(copy) {
  return [
    ...['title', 'description', 'lead', 'conclusion', 'linkedin'].map(id => ({ id, text: copy[id] })),
    ...copy.sections.flatMap((s, i) => [
      { id: `section-${i}-heading`, text: s.heading },
      ...s.paragraphs.map((text, j) => ({ id: `section-${i}-paragraph-${j}`, text })),
    ]),
    ...(copy.graphs ?? []).flatMap((g, i) => [
      ...['title', 'description'].filter(k => g[k]).map(k => ({ id: `graph-${i}-${k}`, text: g[k] })),
      ...(g.series ?? []).flatMap((s,j) => s.label ? [{id:`graph-${i}-series-${j}`,text:s.label}] : []),
      ...(g.groups ?? []).flatMap((s,j) => s.label ? [{id:`graph-${i}-group-${j}`,text:s.label}] : []),
    ]),
  ]
}
const note = value => typeof value === 'string' && value.trim().length >= 12 && value.length <= 4000
export function validateAssessment(article, assessment, { graphCount = 0 } = {}) {
  if (!assessment || assessment.policyHash !== policyHash ||
      assessment.inputHash !== editorialInputHash(article)) throw Error('Kvalitetsvurderingen gjelder ikke gjeldende artikkel eller evalueringsstandard')
  if (!note(assessment.evaluator) || !Number.isFinite(Date.parse(assessment.at)))
    throw Error('Vurderingen mangler evaluator og tidspunkt')
  const scores = assessment.dimensions
  if (!scores || Object.keys(scores).some(k => !Object.hasOwn(dimensions, k))) throw Error('Ukjent kvalitetsdimensjon')
  let total = 0, weight = 0
  for (const [key, w] of Object.entries(dimensions)) {
    const value = scores[key]
    if (key === 'visual' && graphCount === 0 && value?.notApplicable === true && note(value.observation)) continue
    if (!value || !Number.isFinite(value.score) || value.score < 0 || value.score > 100 ||
        !note(value.observation) || !note(value.action)) throw Error(`Ufullstendig kvalitetsvurdering: ${key}`)
    total += value.score * w
    weight += w
  }
  if (!Array.isArray(assessment.findings) || assessment.findings.some(f =>
    !['blocker', 'revision', 'suggestion'].includes(f.severity) || !note(f.observation) || !note(f.action)))
    throw Error('Vurderingen mangler konkrete funn og tiltak')
  const blocks = copyBlocks(article.copy)
  if (!Array.isArray(assessment.claimChecks) || assessment.claimChecks.length !== blocks.length ||
      new Set(assessment.claimChecks.map(c => c.block)).size !== blocks.length)
    throw Error('Alle tekstblokker må faktasjekkes, også ingress, tittel og graftekster')
  for (const block of blocks) {
    const check = assessment.claimChecks.find(c => c.block === block.id)
    if (!check || !['verified', 'non-factual', 'unsupported'].includes(check.status) || !note(check.note) ||
        !Array.isArray(check.sources) || check.sources.some(url => !article.report.sources.some(s => s.url === url)))
      throw Error(`Mangler kontrollert kildespor: ${block.id}`)
    if (check.status === 'verified' && !check.sources.length) throw Error('Faktapåstander krever frosne kildereferanser')
  }
  const score = Math.round(total / weight * 100) / 100
  const blockers = assessment.findings.filter(f => f.severity !== 'suggestion')
  const unsupported = assessment.claimChecks.filter(c => c.status === 'unsupported')
  return { score, meetsRubric: score >= policy.target && !blockers.length && !unsupported.length,
    reasons: [...blockers.map(f => f.observation), ...unsupported.map(c => c.block + ': ' + c.note),
      ...(score < policy.target ? [`Kvalitet ${score} er under målet ${policy.target}`] : [])] }
}
