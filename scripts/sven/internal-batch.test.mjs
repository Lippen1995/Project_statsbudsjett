import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import { prepareBenchmark, validateSubmission } from '../../server/sven/benchmark.mjs'
import { builtinSettings } from '../../server/sven/tuning.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { batchBenchmark } from './benchmark-run.mjs'
import { batchEvaluateSven } from './evaluate.mjs'
import { hostedPreview } from './hosted-preview.mjs'
import { anthropicBatch, runInternalBatch } from './internal-batch.mjs'

const message = value => ({
  stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
  content: [{ type: 'text', text: JSON.stringify(value) }],
})
const endedAt = () => new Date(Date.now() + 3_600_000).toISOString()

async function withFile(work) {
  const dir = await mkdtemp(join(tmpdir(), 'sven-batch-test-'))
  try { return await work(join(dir, 'state.json')) }
  finally { await rm(dir, { recursive: true, force: true }) }
}

test('Anthropic batch submits Messages params, polls, and retrieves JSONL', async () => {
  const seen = []
  const id = 'msgbatch_X1'
  const row = { custom_id: 'case-1', result: { type: 'succeeded', message: message('Test') } }
  const batch = anthropicBatch({ apiKey: 'test', wait: async () => {}, fetchImpl: async (url, options) => {
    seen.push([new URL(url).pathname, options.method ?? 'GET'])
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { requests: [{ custom_id: 'case-1', params: { model: 'sonnet' } }] })
      return Response.json({ id })
    }
    if (seen.length === 2) return Response.json({ id, processing_status: 'in_progress' })
    if (seen.length === 3) return Response.json({ id, processing_status: 'ended', ended_at: endedAt() })
    return new Response(JSON.stringify(row) + '\n')
  } })
  assert.equal(await batch.create([{ custom_id: 'case-1', params: { model: 'sonnet' } }]), id)
  assert.deepEqual((await batch.results(id)).rows, [row])
  assert.deepEqual(seen, [
    ['/v1/messages/batches', 'POST'], ['/v1/messages/batches/' + id, 'GET'],
    ['/v1/messages/batches/' + id, 'GET'], ['/v1/messages/batches/' + id + '/results', 'GET'],
  ])
})

test('benchmark submits dependent phases in waves and resumes without new batches', () => withFile(async file => {
  const plan = { scope: 'Norge', questions: ['Hva viser kilden?'], searches: ['Kilde'], counterSearch: 'Motbevis', missing: [] }
  const phases = [message(plan), { ...message('Web research'), content: [] }, message({
    summary: 'Svar', findings: [{ text: 'Funn', sourceIds: ['local'] }], uncertainties: [], recommendation: null,
  }), message({ passed: true, issues: [] })]
  const manifest = prepareBenchmark(['a', 'b'].map(id => ({ id, domain: 'kommune', question: 'Spørsmål ' + id })), {
    asOf: '2026-11-22', svenExecution: 'batch',
  })
  const waves = []
  let lookups = 0
  const batch = {
    async create(entries) {
      assert.equal(entries.length, 2)
      waves.push(entries)
      return 'msgbatch_' + waves.length
    },
    async results(id) {
      const index = Number(id.split('_')[1]) - 1
      return { endedAt: endedAt(), rows: [...waves[index]].reverse().map(({ custom_id }) =>
        ({ custom_id, result: { type: 'succeeded', message: phases[index] } })) }
    },
  }
  const opts = { manifest, file, model: 'sonnet', profile: { id: 'test', settings: builtinSettings },
    batch, progress() {}, sourceLookup: async () => {
      lookups++
      return [{ id: 'local', title: 'Kilde', text: 'Funn', url: 'https://example.org/' }]
    },
  }
  const rows = await batchBenchmark(opts)
  assert.deepEqual(rows.map(row => validateSubmission(manifest, row).status), ['completed', 'completed'])
  assert.ok(rows.every(row => row.elapsedSeconds > 900 && row.execution === 'batch'))
  assert.deepEqual(rows[0].usage.map(x => x.phase), ['plan', 'research', 'answer-0', 'review-0'])
  assert.deepEqual(await batchBenchmark(opts), rows)
  assert.equal(waves.length, 4)
  assert.equal(lookups, 2)
}))

test('a known batch resumes after polling failure and unknown submissions are never recreated', () => withFile(async file => {
  const common = { model: 'sonnet', signature: 'test', tasks: [{ id: 'one' }], progress() {},
    execute: (_task, { request }) => request({ instructions: 'Test', input: 'Test' }),
  }
  let entries
  let submissions = 0
  const result = () => ({ endedAt: endedAt(), rows: entries.map(({ custom_id }) =>
    ({ custom_id, result: { type: 'expired' } })) })
  const create = async input => { entries = input; submissions++; return 'msgbatch_one' }
  await assert.rejects(runInternalBatch({ ...common, file, batch: {
    create, results: async () => { throw new Error('Avbrutt statusoppslag') },
  } }), /Avbrutt/)
  assert.equal((await runInternalBatch({ ...common, file, batch: {
    create, results: async () => result(),
  } }))[0].status, 'timeout')
  assert.equal(submissions, 1)

  const unknownFile = file + '.unknown'
  await assert.rejects(runInternalBatch({ ...common, file: unknownFile, batch: {
    create: async input => { await create(input); throw new Error('Mistet POST-svar') },
  } }), /Mistet/)
  await assert.rejects(runInternalBatch({ ...common, file: unknownFile, batch: { create } }), /ukjent status/)
  const recovered = await runInternalBatch({ ...common, file: unknownFile, recoverId: 'msgbatch_one', batch: {
    create, results: async () => result(),
  } })
  assert.equal(recovered[0].status, 'timeout')
  assert.equal(submissions, 2)
}))

test('the fixed regression CLI shares the batch runner', () => withFile(async file => {
  let entries
  const rows = await batchEvaluateSven({ file, model: 'sonnet', progress() {}, batch: {
    async create(input) {
      assert.equal(input.length, 2)
      entries = input
      return 'msgbatch_regression'
    },
    async results() {
      return { endedAt: endedAt(), rows: entries.map(({ custom_id, params }, index) => {
        const source = JSON.parse(params.messages[0].content).sources[0]
        return { custom_id, result: { type: 'succeeded', message: message({
          summary: 'Svar', findings: [{ text: index === 0 ? '80 909 kroner' : 'Forslag 608,43 milliarder', sourceIds: [source.id] }],
          uncertainties: [], recommendation: null,
        }) } }
      }) }
    },
  } })
  assert.ok(rows.every(row => row.execution === 'batch' && row.passed))
}))

test('both user chat bundles exclude batch code; hosted chat calls Messages directly', async () => {
  const bundles = await build({
    entryPoints: ['hosted-preview.mjs', 'mobile-preview.mjs'].map(name => fileURLToPath(new URL(name, import.meta.url))),
    outdir: 'out', write: false, metafile: true, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  })
  assert.ok(Object.keys(bundles.metafile.inputs).every(file => !file.includes('internal-batch.mjs')))
  assert.ok(bundles.outputFiles.every(file => !file.text.includes('/v1/messages/batches')))
  const calls = []
  const cache = { get: async () => null, set: async () => {} }
  const handler = hostedPreview({ environment: 'preview', apiKey: 'test', cache, onUsage() {},
    createRequest: options => claudeTransport({ ...options, fetchImpl: async url => {
      calls.push(url)
      return Response.json(message({
        intent: { request: 'Hjelp', purpose: 'Orientering', meaning: 'Hva kan Sven hjelpe med?' },
        action: 'reply', reply: 'Jeg kan hjelpe med offentlig økonomi.',
      }))
    } }),
  })
  const result = await handler({ method: 'POST', headers: { host: 'preview.test', origin: 'https://preview.test',
    'content-type': 'application/json' }, body: { requestId: 'e'.repeat(64), question: 'Hva kan du hjelpe med?' },
  }, { setHeader() {}, status(code) { assert.equal(code, 200); return this }, json: value => value })
  assert.match(result.summary, /offentlig økonomi/)
  assert.deepEqual(calls, ['https://api.anthropic.com/v1/messages'])
})
