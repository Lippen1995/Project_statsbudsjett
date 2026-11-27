import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { newEditorialRun, checkpoint, reviseRun, finishEditorial, saveRun } from './editorial.mjs'
import { loadSkills } from './editorial-skills.mjs'
import { diagnoseArticle } from './editorial-quality.mjs'
import { copyBlocks, policy, policyHash, editorialInputHash } from './editorial-policy.mjs'

const { positionals: [command, packetPath, runPath], values } = parseArgs({ allowPositionals: true,
  options: { stage: { type: 'string' }, payload: { type: 'string' }, key: { type: 'string' },
    reason: { type: 'string' }, model: { type: 'string' }, units: { type: 'string' } } })
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const packet = read(packetPath), article = packet.article ?? packet
if (command === 'init') {
  if (article.status !== 'draft' || article.approval || article.publishedAt) throw Error('Bruk eksisterende prepare-/revisjonsflyt til å opprette et utkast først')
  delete article.editorial
  writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n', {mode:0o600})
  const run = newEditorialRun(article, { mode: packet.base || article.replaces ? 'editorial-revision' : 'editorial' })
  saveRun(runPath, run); console.log(JSON.stringify({ id: run.id, next: 'research', policy }))
} else if (command === 'context') {
  console.log(JSON.stringify({ policy, policyHash, inputHash: editorialInputHash(article),
    ...loadSkills(values.stage, { query: packet.pipeline?.topic ?? article.topic, packet }),
    ...(article.copy ? { blocks: copyBlocks(article.copy), diagnostics: diagnoseArticle(article) } : {}),
    sources: article.report.sources }, null, 2))
} else if (command === 'diagnose') {
  console.log(JSON.stringify(diagnoseArticle(article), null, 2))
} else {
  const run = read(runPath)
  if (command === 'checkpoint') {
    const next = checkpoint(run, article, values.stage, read(values.payload), {
      key: values.key, model: values.model, workUnits: Number(values.units ?? 1) })
    saveRun(runPath, next, run.revision)
    console.log(JSON.stringify({ status: next.status, reason: next.reason, completed: Object.keys(next.completed), revision: next.revision }))
  } else if (command === 'revise') {
    const next = reviseRun(run, values.stage, values.reason)
    saveRun(runPath, next, run.revision); console.log(JSON.stringify({status: next.status, reason: next.reason}))
  } else if (command === 'finish') {
    const result = finishEditorial(run, article)
    saveRun(runPath, result.run, run.revision)
    article.editorial = result.editorial
    // Private capture paths stay in the local checkpoint; published reports keep hashes and critique.
    article.editorial.visual.captures = article.editorial.visual.captures?.map(({manifest, ...capture}) => capture)
    writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify({ status: result.run.status, score: result.editorial.score, reason: result.run.reason }))
    if (result.run.status !== 'approved') process.exitCode = 1
  } else throw Error('Bruk init, context, diagnose, checkpoint, revise eller finish')
}
