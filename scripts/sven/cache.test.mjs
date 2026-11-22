import assert from 'node:assert/strict'
import test from 'node:test'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'

test('Claude caches the stable instructions while keeping question and history in the message', async () => {
  let sent
  let usage
  const request = claudeTransport({
    apiKey: 'test', model: 'claude-sonnet-5-5', cacheInstructions: true,
    onUsage: entry => { usage = entry },
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body)
      return Response.json({ stop_reason: 'end_turn', usage: { cache_read_input_tokens: 600 } })
    },
  })
  await request({ instructions: 'Stabile instruksjoner', input: 'Privat samtale' })
  assert.deepEqual(sent.system, [{
    type: 'text', text: 'Stabile instruksjoner', cache_control: { type: 'ephemeral' },
  }])
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'Privat samtale' }])
  assert.equal(usage.cacheRead, 600)
})

test('public snapshots coalesce, revalidate by ETag and replace stale data', async () => {
  const storage = new Map()
  const cache = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value) }
  let clock = 0
  const fetches = []
  const fetchImpl = async (_url, { headers }) => {
    fetches.push(headers?.['If-None-Match'])
    if (fetches.length === 2) return new Response(null, { status: 304 })
    return new Response(JSON.stringify({ latestYear: fetches.length === 1 ? 2025 : 2026,
      updated: 'test', entities: [{ kind: 'municipality', name: 'Stavanger', code: '1103', ignored: 'large' }],
      sources: [{ source_table: '12137' }], omitted: 'large',
    }), { headers: { etag: fetches.length === 1 ? '"v1"' : '"v2"' } })
  }
  const load = snapshotLoader({ cache, now: () => clock, fetchImpl })
  const file = 'kostra/index.json'
  const [first, concurrent] = await Promise.all([load(file), load(file)])
  assert.equal(first, concurrent)
  assert.deepEqual(JSON.parse(first), {
    latestYear: 2025, updated: 'test', entities: [{ kind: 'municipality', name: 'Stavanger', code: '1103' }],
    sources: [{ source_table: '12137' }],
  })
  assert.equal(await load(file), first)
  clock += 121_000
  assert.equal(await load(file), first)
  clock += 121_000
  assert.equal(JSON.parse(await load(file)).latestYear, 2026)
  assert.deepEqual(fetches, [undefined, '"v1"', '"v1"'])
})
