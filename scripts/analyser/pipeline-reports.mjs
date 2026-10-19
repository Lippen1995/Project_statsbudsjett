import { nextReport } from './candidates.mjs'
import { buildReport } from './report.mjs'
import { nextBudgetReport } from './budget-report.mjs'
import { buildOilReport } from './oil-report.mjs'
import { topicKey, topicBlocked } from '../../web/src/analyser/topics.js'
import { dueEntry, ensureAutomatic, entryFingerprint } from './pipeline-model.mjs'

export function planForReport(report) {
  if (report.kind === 'budget-comparison') return { kind: 'budget', year: report.year, phase: report.phase, comparison: report.comparison, baselineSeries: report.baselineSeries ?? 'saldert', ...(report.question ? { question: report.question } : {}) }
  if (report.kind === 'oil-funds') return { kind: 'oil', year: report.year }
  return { kind: 'expenditure', departmentId: report.scopeId === 'state' ? null : report.scopeId, start: report.start, end: report.end, ...(report.question ? { question: report.question } : {}), ...(report.detailSelections ? { detailSelections: report.detailSelections } : {}) }
}
export function buildPipelineReport(dataDir, published, plan, at = new Date().toISOString()) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !['expenditure', 'budget', 'oil'].includes(plan.kind)) throw Error('Temaet krever en konkret og kontrollert analyseplan. Ikke erstatt det med et annet tema.')
  const allowed = {
    expenditure: ['kind', 'departmentId', 'start', 'end', 'question', 'detailSelections', 'researchPlan'],
    budget: ['kind', 'year', 'phase', 'comparison', 'baselineSeries', 'question'], oil: ['kind', 'year'],
  }
  if (Object.keys(plan).some(key => !allowed[plan.kind].includes(key))) throw Error('Analyseplanen inneholder ukjente felter.')
  let report
  if (plan.kind === 'expenditure') {
    const { kind, ...options } = plan
    report = buildReport(dataDir, options)
  } else if (plan.kind === 'oil') report = buildOilReport(dataDir, plan.year)
  else report = nextBudgetReport(dataDir, published, { baselineSeries: plan.baselineSeries ?? 'saldert', question: plan.question,
    eligible: r => r.year === plan.year && r.phase === plan.phase && r.comparison === plan.comparison })
  if (!report || topicBlocked(report, published, at)) throw Error('Analyseplanen mangler datagrunnlag, eller problemstillingen er allerede dekket. Behold bestillingen og avklar grunnlaget.')
  return report
}
export function suggestPipelineTopic(dataDir, published, document, at, { reportCache } = {}) {
  const excludeTopicKeys = document.history.map(h => h.entry.topicKey).filter(Boolean)
  const report = nextReport(dataDir, published, { at, excludeTopicKeys, reportCache })
  if (!report) return null
  return {
    topic: report.kind === 'budget-comparison' ? `${report.scopeName}: Hva endres i budsjettet for ${report.year}?`
      : `${report.scopeName}: Har det blitt mer eller mindre å rutte med?`,
    instructions: `Undersøk ${report.scopeName.toLowerCase()} med det kontrollerte tallgrunnlaget. Skill beløp fra prisvekst og befolkningsutvikling når det er relevant. Følg interessante funn til konkrete poster og primærkilder. Forklar avgrensning og usikkerhet.`,
    reportPlan: planForReport(report), topicKey: topicKey(report),
  }
}
export async function ensurePipelineNext(repository, { dataDir, published, at, includeToday = false }) {
  const loaded = await repository.read()
  if (loaded.document.items.length) return loaded
  const next = ensureAutomatic(loaded.document, suggestPipelineTopic(dataDir, published, loaded.document, at), { at, includeToday })
  return next === loaded.document ? loaded : repository.write(next, loaded.sha, 'analysis: planlegg bare neste tema for Sven')
}
export async function preparePipeline(repository, { dataDir, published, at = new Date().toISOString(), plan }) {
  const loaded = await ensurePipelineNext(repository, { dataDir, published, at, includeToday: true })
  const entry = dueEntry(loaded.document, at)
  if (!entry) return { packet: { pipelineState: 'waiting', nextDate: loaded.document.items.map(i => i.scheduledDate).sort()[0] ?? null, article: null } }
  const reference = { id: entry.id, fingerprint: entryFingerprint(entry), topic: entry.topic, instructions: entry.instructions, scheduledDate: entry.scheduledDate }
  const selectedPlan = plan ?? entry.reportPlan
  if (!selectedPlan) return { packet: { pipelineState: 'research-required', pipeline: reference, article: null,
    message: 'Undersøk bestillingen og bygg en relevant plan. Kjør prepare med --pipeline-plan=editorial/handoff/<navn>.json. Ikke bruk et annet tema som reserve.' } }
  return { reference: { ...reference, plan: selectedPlan }, report: buildPipelineReport(dataDir, published, selectedPlan, at) }
}
