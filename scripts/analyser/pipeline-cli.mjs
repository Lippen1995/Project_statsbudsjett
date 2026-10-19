import { readFileSync, writeFileSync } from 'node:fs'
import { githubClient } from './github.mjs'
import { pipelineRepository } from './pipeline-model.mjs'
import { ensurePipelineNext } from './pipeline-reports.mjs'

const local = process.argv.includes('--local')
const path = 'editorial/analysis-pipeline.json'
const repository = local ? {
  async read() { return { document: JSON.parse(readFileSync(path, 'utf8')), sha: null } },
  async write(document) { writeFileSync(path, JSON.stringify(document, null, 2) + '\n'); return { document, sha: null } },
} : pipelineRepository(githubClient({ transport: 'gh' }))
const published = JSON.parse(readFileSync('web/src/analyser/publications.json', 'utf8'))
const result = await ensurePipelineNext(repository, { dataDir: 'web/public/data', published, at: new Date().toISOString() })
console.log(result.document.items.length ? `Pipeline har ${result.document.items.length} kommende tema(er). Ingen ekstra temaer er lagt til.` : 'Ingen ny dokumentert problemstilling er tilgjengelig.')
