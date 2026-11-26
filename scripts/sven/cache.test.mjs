import assert from 'node:assert/strict'
import test from 'node:test'
import { claudeTransport, countClaudeTokens } from '../../server/sven/provider.mjs'
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

test('Claude receives an explicit effort only when configured', async () => {
  const sent = []
  const options = { apiKey: 'test', model: 'claude-sonnet-5-5', fetchImpl: async (_url, body) => {
    sent.push(JSON.parse(body.body))
    return Response.json({ stop_reason: 'end_turn' })
  } }
  const input = { instructions: 'Instruksjoner', input: 'Spørsmål' }
  await claudeTransport(options)(input)
  await claudeTransport({ ...options, effort: 'medium' })(input)
  assert.equal(sent[0].output_config, undefined)
  assert.deepEqual(sent[1].output_config, { effort: 'medium' })
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

const sse = events => {
  const content = events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('')
  const bytes = new TextEncoder().encode(content)
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 37) controller.enqueue(bytes.subarray(i, i + 37))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

test('strømmet Claude-research beholder kilder og kumulativ bruk ved max_tokens', async () => {
  const citation = { type: 'web_search_result_location', cited_text: 'Kildeutdrag', url: 'https://www.ssb.no/' }
  const search = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'SSB', url: citation.url }] }
  const events = [
    { type: 'message_start', message: { id: 'test-stream', model: 'claude-opus-5-5',
      usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Intern resonnering' } },
    { type: 'content_block_start', index: 1, content_block: search },
    { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Første ' } },
    { type: 'ping' },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'utdrag.' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'citations_delta', citation } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: {
      output_tokens: 30, server_tool_use: { web_search_requests: 2 },
    } },
    { type: 'message_stop' },
  ]
  const records = []
  const request = claudeTransport({
    apiKey: 'test', model: 'claude-opus-5-5', effort: 'high', stream: true, onUsage: entry => records.push(entry),
    fetchImpl: async (_, { body }) => {
      const payload = JSON.parse(body)
      assert.equal(payload.stream, true)
      assert.equal(payload.max_tokens, 48_000)
      assert.deepEqual(payload.output_config, { effort: 'high' })
      return sse(events)
    },
  })
  const result = await request({ instructions: 'Undersøk', input: 'Privat', phase: 'research-followup', maxTokens: 48_000 })
  assert.deepEqual(result.content, [search, { type: 'text', text: 'Første utdrag.', citations: [citation] }])
  assert.equal(records.length, 1)
  assert.equal(records[0].input, 12)
  assert.equal(records[0].output, 30)
  assert.equal(records[0].cacheRead, 100)
  assert.equal(records[0].searches, 2)
  assert.equal(records[0].stopReason, 'max_tokens')
  assert.equal(records[0].maxTokens, 48_000)
})

test('en avbrutt Claude-strøm godkjennes ikke som et ferdig svar', async () => {
  let calls = 0
  const records = []
  const request = claudeTransport({
    apiKey: 'test', model: 'claude-opus-5-5', stream: true, onUsage: entry => records.push(entry),
    fetchImpl: async () => {
      calls++
      return sse([{ type: 'message_start', message: { usage: { input_tokens: 12 } } }])
    },
  })
  await assert.rejects(request({ instructions: 'Svar', input: 'Spørsmål' }), error => {
    assert.equal(error.usage.input_tokens, 12)
    return /uten et ferdig svar/.test(error.message)
  })
  assert.equal(calls, 1)
  assert.equal(records[0].input, 12)
  assert.equal(records[0].stopReason, 'stream_interrupted')
  assert.equal(records[0].complete,false)
})

test('tokenberegning bruker samme private grunnlag og utelater serververktøy som endepunktet avviser',async()=>{
  let counted,sent,url
  const options={apiKey:'test',model:'claude-sonnet-5-5',cacheInstructions:true}
  const params={instructions:'Stabile instrukser',input:[{type:'text',text:'Privat spørsmål'}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:1}]}
  const count=await countClaudeTokens({...options,...params,fetchImpl:async(endpoint,{body})=>{url=endpoint;counted=JSON.parse(body);return Response.json({input_tokens:123})}})
  assert.equal(count,123);assert.match(url,/\/messages\/count_tokens$/)
  await claudeTransport({...options,fetchImpl:async(_url,{body})=>{sent=JSON.parse(body);return Response.json({stop_reason:'end_turn',usage:{input_tokens:123,output_tokens:5},content:[]})}})(params)
  for(const key of ['model','system','messages'])assert.deepEqual(counted[key],sent[key])
  assert.equal(counted.tools,undefined);assert.deepEqual(sent.tools,params.tools)
  await assert.rejects(countClaudeTokens({...options,...params,fetchImpl:async()=>Response.json({error:'avvist'},{status:429})}),/utilgjengelig/)
  await assert.rejects(countClaudeTokens({...options,...params,fetchImpl:async()=>Response.json({})}),/mangler måling/)
})

test('research can preserve completed citation blocks when a stream disconnects', async () => {
  const citation = { type: 'web_search_result_location', cited_text: 'Primærkilde', url: 'https://www.ssb.no/' }
  const request = claudeTransport({ apiKey: 'test', model: 'claude-sonnet-5-5', stream: true,
    fetchImpl: async () => sse([
      { type: 'message_start', message: { usage: { input_tokens: 12 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Utdrag', citations: [citation] } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: 'Ufullstendig' } },
    ]),
  })
  const result = await request({ instructions: 'Finn kilder', input: 'Spørsmål', phase: 'research' })
  assert.equal(result.stop_reason, 'pause_turn')
  assert.equal(result.content.length, 1)
  assert.deepEqual(result.content[0].citations, [citation])
})
