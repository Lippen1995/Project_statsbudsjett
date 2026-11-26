import { link, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { researchWithSven, researchVersion } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { digest } from '../../server/sven/benchmark.mjs'
import { activeLearningProfile } from '../../server/sven/learning-config.mjs'
import { runInternalBatch } from './internal-batch.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))

async function readOutput(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

export async function batchBenchmark({ manifest, file, model, profile, batch, recoverId, progress, sourceLookup = resolveSvenSources }) {
  if (manifest.svenExecution !== 'batch') throw new Error('Opprett et nytt batchmanifest med benchmark.mjs prepare')
  const manifestHash = digest(manifest)
  const rows = await runInternalBatch({ file, model, batch, recoverId, progress, tasks: manifest.cases,
    signature: { manifestHash, researchVersion, profile },
    execute: (task, { request, freeze }) => researchWithSven({
      ...task, tuning: profile.settings, asOf: manifest.asOf, request,
      localSources: question => freeze('fellestall', () => sourceLookup(question, dataDir)),
    }),
  })
  return rows.map(row => {
    const result = row.value
    const status = result ? result.status === 'reviewed' ? 'completed' : 'failed' : row.status
    const answer = result ? [result.answer.summary,
      ...result.answer.findings.map(f => `${f.text} [${f.sourceIds.join(', ')}]`),
      ...result.answer.uncertainties,
      ...(result.answer.recommendation ? [`${result.answer.recommendation.text} [${result.answer.recommendation.sourceIds.join(', ')}]`] : []),
      'Kilder:', ...result.sources.map(s => `${s.id}: ${s.title} ${s.url || s.snapshotUrl || ''}`),
    ].join('\n\n') : 'Kjøringen leverte ikke et godkjent svar: ' + row.error
    const end = Math.max(Date.parse(row.startedAt), ...row.phases.map(phase => Date.parse(phase.endedAt)))
    return {
      manifestHash, caseId: row.id, product: 'Sven', candidateId: profile.id, model, productVersion: researchVersion,
      execution: 'batch', runAt: row.startedAt, elapsedSeconds: (end - Date.parse(row.startedAt)) / 1000,
      tools: ['Fellestall snapshots', 'web search', 'web fetch', 'automated review'],
      status, answer, ...(result ? { result } : {}), usage: row.phases,
    }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [manifestPath, output, recover] = process.argv.slice(2)
    if (!manifestPath || !output || (recover && !recover.startsWith('--batch-id='))) {
      throw new Error('Bruk: benchmark-run.mjs <manifest.json> <privat-svarfil.json> [--batch-id=<id>]')
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const model = process.env.SVEN_MODEL
    const profile = await activeLearningProfile()
    const manifestHash = digest(manifest)
    const existing = await readOutput(output)
    if (existing && (!Array.isArray(existing) || existing.length !== manifest.cases.length ||
        existing.some(row => row.manifestHash !== manifestHash || row.execution !== 'batch' ||
          row.model !== model || row.candidateId !== profile.id || row.productVersion !== researchVersion))) {
      throw new Error('Målfilen inneholder svar fra en annen kjøring')
    }
    if (existing) {
      console.error(`${existing.length} Sven-resultater finnes allerede. Ingen modelltrinn er sendt.`)
    } else {
      const rows = await batchBenchmark({
        manifest, file: output + '.batch.json', model, profile, recoverId: recover?.slice('--batch-id='.length),
      })
      const temporary = output + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(rows, null, 2) + '\n', { flag:'wx', mode:0o600 })
      try { await link(temporary, output) }
      catch (error) { if (error.code !== 'EEXIST' || digest(await readOutput(output)) !== digest(rows)) throw error }
      finally { await unlink(temporary) }
      console.error(`${rows.length} Sven-resultater registrert. Batchtid kan ikke sammenlignes med svartid i chat.`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
