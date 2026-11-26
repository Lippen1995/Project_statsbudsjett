import { readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { graphPlan } from '../../web/src/analyser/chart-plan.js'
import { validateArticle } from './schema.mjs'
import { diagnoseArticle } from './editorial-quality.mjs'
import { policy, policyHash, digest, editorialInputHash, validateAssessment } from './editorial-policy.mjs'
import { loadSkills } from './editorial-skills.mjs'
import { editorialRendererHash } from './editorial-render-hash.mjs'

export const stages = Object.freeze(['research', 'angle', 'draft', 'visual', 'language', 'factcheck', 'editor'])
const text = value => typeof value === 'string' && value.trim().length >= 12 && value.length <= 4000
export const fileHash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
export function newEditorialRun(article, { at = new Date().toISOString(), mode = 'editorial' } = {}) {
  if (!['editorial', 'editorial-revision'].includes(mode)) throw Error('Vanlig chat starter ikke en redaksjonell kjøring')
  if (!article?.report?.sources?.length) throw Error('Kjøringen krever en eksisterende frosset rapport')
  return { version: 1, id: randomUUID(), mode, slug: article.slug, reportHash: digest(article.report),
    policyHash, startedAt: at, updatedAt: at, revision: 0, revisions: 0, status: 'working',
    completed: {}, history: [], usage: [] }
}
export function assertRun(run, article) {
  if (run.version !== 1 || run.policyHash !== policyHash || run.slug !== article.slug || run.reportHash !== digest(article.report))
    throw Error('Rapport eller evalueringsstandard er endret; opprett en ny sporbar kjøring')
}
function sourcesValid(sources, article) {
  return Array.isArray(sources) && sources.length && sources.every(url => article.report.sources.some(s => s.url === url))
}
function validateStage(stage, value, article) {
  if (!value || !text(value.summary)) throw Error('Arbeidssteget krever en kort beslutningsoppsummering')
  if (stage === 'research' && (!Array.isArray(value.questions) || !value.questions.length ||
      value.questions.some(q => !text(q.question) || !text(q.answer) || !sourcesValid(q.sources, article)) ||
      !Array.isArray(value.materialGaps) || value.materialGaps.length))
    throw Error('Research krever besvarte spørsmål, kontrollerte kilder og ingen vesentlige kunnskapshull')
  if (stage === 'angle') {
    const minimum = article.copy?.format === 'brief' ? 1 : 3
    if (!Array.isArray(value.alternatives) || value.alternatives.length < minimum ||
        new Set(value.alternatives.map(a => a.approach)).size !== value.alternatives.length ||
        value.alternatives.some(a => !text(a.approach) || !text(a.finding) || !text(a.relevance) || !sourcesValid(a.sources, article)) ||
        !Number.isInteger(value.selected) || !value.alternatives[value.selected] || !text(value.reason) || !text(value.structure))
      throw Error('Vurder reelt ulike vinklinger med dokumentasjon, leserbetydning og valgt dramaturgi')
  }
  if (['draft', 'language'].includes(stage)) validateArticle(article)
  if (stage === 'language' && (!Array.isArray(value.changes) || !value.changes.length ||
      value.changes.some(c => !text(c.before) || !text(c.after) || !text(c.reason))))
    throw Error('Språkpasset krever konkrete før-/ettereksempler og begrunnelse')
  if (stage === 'visual') {
    const count = graphPlan(article.copy, article.report).length
    if (!text(value.purpose) || !text(value.choice)) throw Error('Begrunn grafbehov og valgt fremstilling')
    if (!count) return
    if (!Array.isArray(value.captures) || !['desktop', 'mobile'].every(device => value.captures.some(c => c.device === device)))
      throw Error('Grafer må faktisk rendres og inspiseres på mobil og desktop')
    for (const capture of value.captures) {
      const manifest = JSON.parse(readFileSync(capture.manifest, 'utf8'))
      if (fileHash(capture.manifest) !== capture.hash || manifest.inputHash !== editorialInputHash(article) ||
          manifest.rendererHash !== editorialRendererHash() || capture.rendererHash !== manifest.rendererHash ||
          manifest.device !== capture.device || manifest.graphCount !== count || manifest.failures.length ||
          !manifest.images.length || manifest.images.some(i => fileHash(resolve(dirname(capture.manifest), i.file)) !== i.hash) ||
          !text(capture.critique) || capture.accepted !== true)
        throw Error('Visuell kontroll mangler bilder, gjelder gammel tekst, har feil eller mangler faktisk kritikk')
    }
  }
  if (stage === 'factcheck') {
    // Same protected completeness/traceability checks as the final editor.
    validateAssessment(article, value.assessment, { graphCount: graphPlan(article.copy, article.report).length })
    if (value.assessment.claimChecks.some(c => c.status === 'unsupported')) throw Error('Vesentlige påstander mangler kildebelegg')
  }
  if (stage === 'editor') validateAssessment(article, value.assessment, { graphCount: graphPlan(article.copy, article.report).length })
}
export function checkpoint(run, article, stage, value, { key, at = new Date().toISOString(),
  model, workUnits = 1, inputTokens = null, outputTokens = null, costUsd = null } = {}) {
  assertRun(run, article)
  if (!stages.includes(stage) || !text(key) || !text(model)) throw Error('Oppgi gyldig steg, idempotensnøkkel og faktisk modell/vert')
  const inputHash = editorialInputHash(article), payloadHash = digest(value)
  const existing = run.completed[stage]
  if (existing?.key === key && existing.payloadHash === payloadHash && existing.inputHash === inputHash) return run
  if (run.history.some(e => e.key === key)) throw Error('Idempotensnøkkelen er allerede brukt med annet innhold')
  if (run.status !== 'working') throw Error('Kjøringen er avsluttet eller blokkert; revider med dokumentert årsak')
  const prior = stages.slice(0, stages.indexOf(stage))
  if (prior.some(s => !run.completed[s])) throw Error('Nødvendige tidligere arbeidssteg mangler')
  if (prior.filter(s => stages.indexOf(s) >= 2).some(s => run.completed[s].inputHash !== inputHash))
    throw Error('Artikkelen er endret; gjenoppta fra utkast og kontroller senere steg på nytt')
  if (!Number.isInteger(workUnits) || workUnits < 1 || workUnits > 10 ||
      [inputTokens, outputTokens, costUsd].some(v => v !== null && (!Number.isFinite(v) || v < 0))) throw Error('Ugyldig forbruksregistrering')
  const next = structuredClone(run)
  const used = run.usage.reduce((n, u) => n + u.workUnits, 0)
  if (used + workUnits > policy.maxWorkUnits || Date.parse(at) - Date.parse(run.startedAt) > policy.maxElapsedMinutes * 60000) {
    next.status = 'blocked'; next.reason = 'Arbeids- eller tidsgrensen er nådd; artikkelen er ikke internt godkjent'
    next.revision++; next.updatedAt = at
    return next
  }
  validateStage(stage, value, article)
  const skills = loadSkills(stage, { query: value.summary })
  const entry = { stage, key, at, inputHash, payloadHash, value, skills: skills.skills.map(({id,version,hash}) => ({id,version,hash})) }
  next.completed[stage] = entry
  // Replacing a checkpoint always invalidates downstream work.
  for (const s of stages.slice(stages.indexOf(stage) + 1)) delete next.completed[s]
  next.history.push(entry)
  next.usage.push({ stage, model, workUnits, inputTokens, outputTokens, costUsd, at })
  next.updatedAt = at; next.revision++
  return next
}
export function reviseRun(run, stage, reason, { at = new Date().toISOString() } = {}) {
  if (!stages.includes(stage) || !text(reason)) throw Error('Revisjon krever gyldig målsteg og konkret grunn')
  const next = structuredClone(run)
  if (run.status === 'approved') throw Error('Godkjent kjøring er frosset; start en revisjonskjøring')
  if (run.revisions >= policy.maxRevisions || run.usage.reduce((n,u) => n+u.workUnits,0) >= policy.maxWorkUnits) {
    next.status = 'blocked'; next.reason = 'Revisjonsgrensen er nådd; mer arbeid krever et nytt avgrenset oppdrag'
  } else {
    next.revisions++; next.status = 'working'; next.reason = reason
    next.pending = null
    for (const s of stages.slice(stages.indexOf(stage))) delete next.completed[s]
  }
  next.history.push({ stage: 'revision', target: stage, reason, at })
  next.updatedAt = at; next.revision++
  return next
}
export function finishEditorial(run, article) {
  assertRun(run, article)
  if (run.status !== 'working') throw Error('En blokkert kjøring kan ikke sluttgodkjennes')
  if (stages.some(s => !run.completed[s])) throw Error('Redaksjonelle arbeidssteg mangler')
  for (const stage of stages) {
    if (stages.indexOf(stage) >= 2 && run.completed[stage].inputHash !== editorialInputHash(article))
      throw Error('Kontrollen gjelder en tidligere artikkelversjon')
    validateStage(stage, run.completed[stage].value, article)
  }
  const diagnostics = diagnoseArticle(article)
  const assessment = run.completed.editor.value.assessment
  const result = validateAssessment(article, assessment, { graphCount: graphPlan(article.copy, article.report).length })
  const approved = result.approved && !diagnostics.blockers.length
  const next = structuredClone(run)
  next.status = approved ? 'approved' : 'needs-revision'
  next.reason = [...result.reasons, ...diagnostics.blockers.map(b => b.observation)].join('; ')
  next.revision++
  const editorial = { version: 1, runId: run.id, policyHash, inputHash: editorialInputHash(article),
    status: next.status, score: result.score, assessment, angle: run.completed.angle.value,
    stages: stages.map(stage => ({ stage, at: run.completed[stage].at, skills: run.completed[stage].skills })),
    visual: run.completed.visual.value, usage: run.usage, revisions: run.revisions, diagnostics }
  return { run: next, editorial }
}
export function assertEditorialApproval(article) {
  const e = article.editorial
  if (!e || e.version !== 1 || e.status !== 'approved' || e.policyHash !== policyHash || e.inputHash !== editorialInputHash(article))
    throw Error('Artikkelen mangler intern kvalitetsgodkjenning for gjeldende versjon')
  const result = validateAssessment(article, e.assessment, { graphCount: graphPlan(article.copy, article.report).length })
  if (graphPlan(article.copy, article.report).length && (!['desktop','mobile'].every(device => e.visual?.captures?.some(c =>
    c.device === device && c.accepted === true && c.rendererHash === editorialRendererHash() && /^[a-f0-9]{64}$/.test(c.hash) && text(c.critique)))))
    throw Error('Visuell godkjenning mangler eller gjelder en eldre grafvisning')
  if (!result.approved || result.score !== e.score || stages.some(s => !e.stages?.some(c => c.stage === s)) || diagnoseArticle(article).blockers.length)
    throw Error('Artikkelen oppfyller ikke de interne kvalitetskravene')
  return e
}
// A short-lived lock + revision compare prevents concurrent writers and lost updates.
export function saveRun(path, next, expectedRevision = null) {
  mkdirSync(dirname(path), { recursive: true })
  const lock = path + '.lock', fd = openSync(lock, 'wx')
  try {
    if (expectedRevision !== null && JSON.parse(readFileSync(path, 'utf8')).revision !== expectedRevision)
      throw Error('En annen prosess har endret kjøringen; les checkpointet på nytt')
    if (expectedRevision === null) {
      try { readFileSync(path); throw Error('Kjøringen finnes allerede') }
      catch (e) { if (e.code !== 'ENOENT') throw e }
    }
    const temp = path + '.' + randomUUID() + '.tmp'
    writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    renameSync(temp, path)
  } finally { closeSync(fd); unlinkSync(lock) }
}
