import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { hostedPreview } from './hosted-preview.mjs'

const headers = {
  host: 'preview.test',
  origin: 'https://preview.test',
  'content-type': 'application/json',
}

const intent = { request: 'Hva skjedde?', purpose: 'Forstå en endring', meaning: 'Undersøk hva som skjedde med barnetrygd.' }
const searchPlan = { scope: 'Norge', questions: ['Hva viser kildene?'], searches: ['barnetrygd'], counterSearch: 'usikkerhet', missing: [] }
const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })

function call(handler, method, body, requestHeaders = headers) {
  let status
  const res = {
    setHeader() {},
    status(code) { status = code; return res },
    json(payload) { return { status, payload } },
  }
  return handler({ method, headers: requestHeaders,
    body: method === 'POST' ? { requestId: randomBytes(32).toString('hex'), ...body } : body,
  }, res)
}

test('preview-status og avviste forespørsler bruker ingen modellkall', async () => {
  const options = { apiKey: 'test', createRequest: () => assert.fail('Ingen modellkall forventet') }
  assert.equal((await call(hostedPreview({ ...options, environment: 'production' }), 'GET')).status, 404)
  const preview = hostedPreview({ ...options, environment: 'preview' })
  const { status, payload } = await call(preview, 'GET')
  assert.equal(status, 200)
  assert.equal(payload.configured, true)
  assert.equal(payload.model, 'claude-sonnet-5-5')
  assert.deepEqual(payload.models.map(option => option.id), ['claude-sonnet-5-5', 'claude-opus-5-5'])
  assert.deepEqual(payload.effortLevels.map(option => option.id), ['default', 'low', 'medium', 'high'])
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd', model: 'ukjent' })).status, 400)
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd', effort: 'ukjent' })).status, 400)
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd' }, { ...headers, origin: 'https://annet.test' })).status, 403)
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd', history: [null] })).status, 400)
})

test('preview kjører Sven med Sonnet 5.5 og returnerer brukte kilder', async () => {
  const calls = []
  const outputs = {
    interpret: { intent, action: 'research', tools: ['fellestall', 'web'], plan: searchPlan },
    'answer-0': { summary: 'Oppsummert', findings: [{ text: 'Funn', sourceIds: ['nav'] }], uncertainties: [], recommendation: null },
    'review-0': { passed: true, issues: [] },
  }
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: async question => {
      assert.equal(question, intent.meaning)
      return [{ id: 'nav', title: 'NAV', url: 'https://www.nav.no/', text: 'Testgrunnlag' }]
    },
    createRequest: ({ model, cacheInstructions }) => async input => {
      assert.equal(model, 'claude-sonnet-5-5')
      assert.equal(cacheInstructions, true)
      calls.push(input.phase)
      if (input.phase === 'interpret') {
        assert.match(input.input, /review-5664781959/)
        assert.equal(input.tools, undefined)
      }
      if (input.phase === 'research') {
        assert.deepEqual(JSON.parse(input.input).intent, intent)
        assert.ok(input.tools.length)
        return { content: [] }
      }
      return response(outputs[input.phase])
    },
  })
  const result = await call(preview, 'POST', { question: 'Hei, hva skjedde med barnetrygd?' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.payload.sources, [{ id: 'nav', title: 'NAV', url: 'https://www.nav.no/' }])
  assert.deepEqual(calls, ['interpret', 'research', 'answer-0', 'review-0'])
})

test('gjentatt innsending og gjenopptak gjenbruker resultatet på tvers av instanser', async () => {
  const storage = new Map()
  const cache = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value) }
  let calls = 0
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const options = { environment: 'preview', apiKey: 'test', cache, createRequest: () => async () => {
    calls++
    started.resolve()
    await finish.promise
    return response({ intent, action: 'reply', reply: 'Privat svar' })
  } }
  const a = hostedPreview(options)
  const b = hostedPreview(options)
  const requestId = randomBytes(32).toString('hex')
  const input = { requestId, question: 'Hva kan du hjelpe med?' }
  const original = call(a, 'POST', input)
  await started.promise
  assert.deepEqual((await call(b, 'POST', { requestId, progress: true })).payload, { phase: 'interpret' })
  assert.equal((await call(a, 'POST', input)).status, 202)
  assert.equal((await call(b, 'POST', { requestId, resume: true })).status, 202)
  finish.resolve()
  const result = await original
  assert.equal(result.payload.summary, 'Privat svar')
  assert.deepEqual(await call(b, 'POST', { requestId, resume: true }), result)
  assert.deepEqual(await call(b, 'POST', input), result)
  assert.deepEqual((await call(b, 'POST', { requestId, progress: true })).payload, { done: true })
  assert.equal((await call(b, 'POST', { resume: true })).status, 410)
  assert.equal(calls, 1)
  assert.doesNotMatch(JSON.stringify([...storage]), /Privat svar|Hva kan du hjelpe|\brequestId\b/)
})

test('en kort hilsen får svar uten leverandør, søk eller datagrunnlag', async () => {
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: '',
    createRequest: () => assert.fail('En hilsen trenger ingen modell'),
  })
  for (const question of ['Hei', 'Hei, Sven! 👋', 'God kveld!']) {
    const { status, payload } = await call(preview, 'POST', { question })
    assert.equal(status, 200)
    assert.match(payload.summary, /^Hei!/)
    assert.deepEqual(payload.sources, [])
  }
})

test('samtale og avklaringer kan besvares med kun første modellkall', async () => {
  const calls = []
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: () => assert.fail('Samtale trenger ingen kilder'),
    createRequest: () => async input => {
      calls.push(input.phase)
      assert.match(input.instructions, /Tolk meldingen før du velger fremgangsmåte/)
      assert.equal(input.tools, undefined)
      assert.equal(JSON.parse(input.input).history[0].content, 'Hei!')
      return response({ intent, action: 'reply', reply: 'Jeg kan hjelpe deg å undersøke offentlig økonomi.' })
    },
  })
  const { status, payload } = await call(preview, 'POST', {
    question: 'Hva kan du hjelpe meg med?',
    history: [{ role: 'assistant', content: 'Hei!' }],
  })
  assert.equal(status, 200)
  assert.match(payload.summary, /offentlig økonomi/)
  assert.deepEqual(payload.sources, [])
  assert.deepEqual(calls, ['interpret'])
})

test('research uten kildegrunnlag forklares konkret', async () => {
  let localCalls = 0
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: async () => { localCalls++; return [] },
    createRequest: () => async ({ phase }) => phase === 'interpret'
      ? response({ intent, action: 'research', tools: ['web'], plan: searchPlan })
      : { content: [] },
  })
  const { status, payload } = await call(preview, 'POST', { question: 'Hva ble vedtatt i statsbudsjettet?' })
  assert.equal(status, 422)
  assert.match(payload.error, /fant ikke kilder/)
  assert.equal(localCalls, 0)
})

test('en uklar oppfølging kan avklares uten verktøy', async () => {
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: () => assert.fail('Avklaring trenger ingen kilder'),
    createRequest: () => async ({ phase, tools }) => {
      assert.equal(phase, 'interpret')
      assert.equal(tools, undefined)
      return response({
        intent: { request: 'Sammenligne med 2024', purpose: 'Forstå utvikling', meaning: 'Det er uklart hvilket tall som skal sammenlignes.' },
        action: 'clarify', reply: 'Hvilket tall vil du sammenligne med 2024?',
      })
    },
  })
  const result = await call(preview, 'POST', { question: 'Hva med 2024?' })
  assert.match(result.payload.summary, /Hvilket tall/)
})

test('en oppfølging får riktig kontekst og kan bruke bare Fellestall', async () => {
  const phases = []
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: async question => {
      assert.equal(question, 'Hva var netto driftsutgifter i Stavanger i 2024?')
      return [{ id: 'ssb', title: 'KOSTRA', url: 'https://www.ssb.no/', text: 'Testgrunnlag' }]
    },
    createRequest: () => async ({ phase, tools }) => {
      phases.push(phase)
      assert.equal(tools, undefined)
      if (phase === 'interpret') return response({
        intent: { request: 'Sammenligne med 2024', purpose: 'Forstå utvikling', meaning: 'Hva var netto driftsutgifter i Stavanger i 2024?' },
        action: 'research', tools: ['fellestall'], plan: { ...searchPlan, searches: [], counterSearch: '' },
      })
      if (phase === 'answer-0') return response({
        summary: 'Oppsummert', findings: [{ text: 'Funn', sourceIds: ['ssb'] }], uncertainties: [], recommendation: null,
      })
      assert.equal(phase, 'review-0')
      return response({ passed: true, issues: [] })
    },
  })
  const result = await call(preview, 'POST', {
    question: 'Hva med 2024?',
    history: [{ role: 'user', content: 'Hva var netto driftsutgifter i Stavanger i 2025?' }],
  })
  assert.equal(result.status, 200)
  assert.deepEqual(phases, ['interpret', 'answer-0', 'review-0'])
})

test('nettsøk brukes som reserve når et valgt Fellestall-oppslag mangler grunnlag', async () => {
  const phases = []
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: async () => [],
    createRequest: () => async ({ phase, tools, instructions }) => {
      phases.push(phase)
      if (phase === 'interpret') return response({
        intent, action: 'research', tools: ['fellestall'], plan: { ...searchPlan, searches: [], counterSearch: '' },
      })
      assert.ok(tools.some(tool => tool.name === 'web_search'))
      assert.match(instructions, /Fellestalls data ga ikke grunnlag/)
      return { content: [] }
    },
  })
  assert.equal((await call(preview, 'POST', { question: 'Hva skjedde med barnetrygden?' })).status, 422)
  assert.deepEqual(phases, ['interpret', 'research'])
})

test('kjent SSB-tabell hentes med web_fetch alene og går videre til faktakontroll', async () => {
  const url = 'https://www.ssb.no/statbank/table/12137/'
  const phases = []
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    createRequest: () => async ({ phase, input, tools }) => {
      phases.push(phase)
      const data = JSON.parse(input)
      if (phase === 'interpret') {
        assert.deepEqual(data.knownUrls, [url])
        return response({
          intent, action: 'research', tools: ['direct'], urls: [url, 'https://evil.test/'],
          plan: { ...searchPlan, searches: [], counterSearch: '' },
        })
      }
      if (phase === 'direct-fetch') {
        assert.deepEqual(data.urls, [url])
        assert.deepEqual(tools.map(tool => tool.name), ['web_fetch'])
        assert.deepEqual(tools[0].allowed_domains, ['www.ssb.no'])
        return { content: [...response({ covers: true }).content, {
          type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url,
            content: { title: 'SSB 12137', source: { type: 'text', data: 'Kontrollert tabelltekst' } },
          },
        }] }
      }
      if (phase === 'answer-0') return response({
        summary: 'Oppsummert', findings: [{ text: 'Funn', sourceIds: [data.sources[0].id] }],
        uncertainties: [], recommendation: null,
      })
      assert.equal(phase, 'review-0')
      return response({ passed: true, issues: [] })
    },
  })
  const result = await call(preview, 'POST', { question: 'Hva viser SSB tabell 12137?' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.payload.sources.map(({ title, url }) => ({ title, url })), [{ title: 'SSB 12137', url }])
  assert.deepEqual(phases, ['interpret', 'direct-fetch', 'answer-0', 'review-0'])
})

test('modell og resonneringsstyrke gjelder hele forespørselen og rapporteres sammen med forbruk', async () => {
  const requestId = randomBytes(32).toString('hex')
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    createRequest: ({ model, effort }) => async ({ maxTokens }) => {
      assert.equal(model, 'claude-opus-5-5')
      assert.equal(effort, 'high')
      assert.equal(maxTokens, 16_000)
      return {
        ...response({ intent, action: 'reply', reply: 'Svar' }),
        usage: { input_tokens: 17, output_tokens: 4, cache_read_input_tokens: 512, cache_creation_input_tokens: 0 },
      }
    },
  })
  const result = await call(preview, 'POST', { requestId, question: 'Hva kan du hjelpe med?', model: 'claude-opus-5-5', effort: 'high' })
  assert.equal(result.status, 200)
  assert.equal(result.payload.model, 'claude-opus-5-5')
  assert.equal(result.payload.effort, 'high')
  assert.deepEqual(result.payload.usage, { calls: 1, input: 17, output: 4, cacheRead: 512, cacheWrite: 0, searches: 0 })
  assert.deepEqual(await call(preview, 'POST', { requestId, resume: true, effort: 'low' }), result)
})

test('delt budsjettkapittel gir svar selv om leverandøren stopper midt i nettsøket', async () => {
  const { claudeTransport } = await import('../../server/sven/provider.mjs')
  const { resolveSvenSources } = await import('../../server/sven/sources.mjs')
  const directory = new URL('../../web/public/data/', import.meta.url)
  const { readFile } = await import('node:fs/promises')
  const storage = new Map()
  const cache = { get: async key => storage.get(key), set: async (key, value) => {
    assert(value.length < 150_000, 'Opaque web tool results must not reach the checkpoint')
    storage.set(key, value)
  } }
  const question = 'Valgt innhold i Fellestall: Felles ledelse og kommandoapparat\nKap. 1720\nRegnskap 2025\nFellestalls rad-ID: u-17-1720\n\nBrukerens spørsmål: Hvilke aktiviteter inngår?'
  for (const stop of ['pause_turn', 'max_tokens']) {
    let calls = 0
    const phases = []
    const preview = hostedPreview({
      environment: 'preview', apiKey: 'test', cache,
      sources: async query => {
        assert.equal(query, question)
        return resolveSvenSources(query, undefined, { read: async file => JSON.parse(await readFile(new URL(file, directory))) })
      },
      onUsage: usage => phases.push([usage.phase, usage.stopReason]),
      createRequest: options => claudeTransport({ ...options, fetchImpl: async (url, init) => {
        const { messages, tools } = JSON.parse(init.body)
        const input = JSON.parse(messages[0].content)
        const usage = { input_tokens: 2, output_tokens: 1 }
        calls++
        if (calls === 1) return Response.json({ ...response({ intent, action: 'research', tools: ['web'], plan: searchPlan }), stop_reason: 'end_turn', usage })
        if (calls === 2) {
          assert.ok(tools.some(tool => tool.name === 'web_fetch' && tool.max_content_tokens === 4000))
          return Response.json({ stop_reason: stop, usage, content: [
            { type: 'web_search_tool_result', content: [{ encrypted_content: randomBytes(1_450_000).toString('hex') }] },
            { type: 'text', text: 'Ufullstendig syntese', citations: [{
              type: 'web_search_result_location', url: 'https://www.regjeringen.no/test', cited_text: 'Et relevant kildeutdrag', title: 'Kilde',
            }] },
          ] })
        }
        if (calls === 3) {
          const data = input.sources.find(source => source.id === 'dfo-u-17-1720')
          assert.equal(JSON.parse(data.text).millionNokByYearAndPhase['2025'].regnskap, 51906)
          assert(input.sources.some(source => source.id === 'fd-prop1s-2025-1720' && source.text.includes('Hæren')))
          assert(input.sources.some(source => source.id === 'fd-prop16s-2025-1720' && source.text.includes('2021')))
          assert(input.sources.some(source => source.text === 'Et relevant kildeutdrag'))
          return Response.json({ ...response({ summary: 'Kapittel 1720 er Forsvaret.',
            findings: [{ text: 'Post 01 gjelder driftsutgifter.', sourceIds: ['fd-prop1s-2025-1720'] }],
            recommendation: null, uncertainties: [] }), stop_reason: 'end_turn', usage })
        }
        assert.equal(calls, 4)
        return Response.json({ ...response({ passed: true, issues: [] }), stop_reason: 'end_turn', usage })
      } }),
    })
    const result = await call(preview, 'POST', { question })
    assert.equal(result.status, 200)
    assert.equal(result.payload.usage.calls, 4)
    assert.equal(result.payload.sources[0].id, 'fd-prop1s-2025-1720')
    assert.deepEqual(phases.map(([phase]) => phase), ['interpret', 'research', 'answer-0', 'review-0'])
    assert.equal(phases[1][1], stop)
  }
})

test('konkrete spørsmål om budsjettposter blir undersøkt videre når tallene ikke dekker aktivitetene', async () => {
  const question = 'Valgt innhold i Fellestall: Nyanskaffelser av materiell og nybygg og nyanlegg\nKap. 1760\nRegnskap 2025\nFellestalls rad-ID: u-17-1760\n\nBrukerens spørsmål: Hva ligger i denne? Hvilke aktiviteter består den av?'
  const local = { id: 'post45', title: 'Postfordeling kapittel 1760', text: 'Regnskap 2025, post 45: 36,33 mrd. kr.' }
  const annualUrl = 'https://www.fma.no/arsrapport-2025/arsregnskap/Noter'
  const finding = 'Forsvarsmateriells årsrapport navngir F-35, nye ubåter og P-8A Poseidon.'
  const projectEvidence = { content: [{ type: 'text', text: finding, citations: [
    { type: 'web_search_result_location', url: annualUrl, title: 'Forsvarsmateriell, note om prosjekter', cited_text: finding },
  ] }] }
  const leads = [{ url: annualUrl, title: 'Forsvarsmateriells regnskapsnoter' }]
  const proposedQuery = 'Forsvarsmateriell årsrapport 2025 kapittel 1760 post 45 konkrete prosjekter'
  for (const initialWeb of [false, true]) {
    const phases = []
    let allocatedSearches = 0
    const preview = hostedPreview({
      environment: 'preview', apiKey: 'test',
      sources: async query => {
        assert.equal(query, question)
        return [local]
      },
      createRequest: () => async ({ phase, input: payload, tools, instructions }) => {
        phases.push(phase)
        const input = JSON.parse(payload)
        if (tools) allocatedSearches += tools.find(tool => tool.name === 'web_search').max_uses
        switch (phase) {
          case 'interpret':
            assert.match(instructions, /et postnavn viser hvor mye/i)
            return response({ intent, action: 'research', tools: [initialWeb ? 'web' : 'fellestall'],
              plan: initialWeb ? searchPlan : { ...searchPlan, searches: [], counterSearch: '' } })
          case 'research':
            assert.equal(tools.find(tool => tool.name === 'web_search').max_uses, 2)
            return { stop_reason: 'max_tokens', content: [{ type: 'web_search_tool_result', content: [
              { type: 'web_search_result', ...leads[0] },
            ] }] }
          case 'research-followup':
            assert.equal(tools.find(tool => tool.name === 'web_search').max_uses, initialWeb ? 1 : 2)
            assert.equal(tools.find(tool => tool.name === 'web_fetch').max_uses, 1)
            assert.deepEqual(input.sourceLeads, initialWeb ? leads : [])
            assert.equal(input.query, initialWeb ? null : proposedQuery)
            return projectEvidence
          case 'answer-0':
          case 'answer-1': {
            const project = input.sources.find(source => source.url === annualUrl)
            if (phase === 'answer-1' || initialWeb) assert(project)
            else assert.equal(project, undefined)
            return response({ summary: project ? finding : 'Grunnlaget viser post 45 og beløpet.',
              findings: [{ text: project ? finding : local.text, sourceIds: [project?.id ?? local.id] }],
              recommendation: null, uncertainties: [] })
          }
          case 'review-0':
          case 'review-1':
            assert.match(instructions, /besvarer det vesentlige/)
            if (!initialWeb && phase === 'review-0') {
              assert.equal(input.searchesRemaining, 3)
              return response({ passed: true, issues: [], followupSearch: proposedQuery })
            }
            assert.equal(input.searchesRemaining, 0)
            return response({ passed: true, issues: [] })
          default:
            assert.fail(phase)
        }
      },
    })
    const result = await call(preview, 'POST', { question })
    assert.equal(result.status, 200)
    assert.match(result.payload.summary, /P-8A Poseidon/)
    assert.deepEqual(result.payload.sources.map(source => source.url), [annualUrl])
    assert(allocatedSearches <= 3)
    assert.deepEqual(phases, initialWeb
      ? ['interpret', 'research', 'research-followup', 'answer-0', 'review-0']
      : ['interpret', 'answer-0', 'review-0', 'research-followup', 'answer-1', 'review-1'])
  }
})

test('preview uses the selected model and effort to give research and synthesis separate output limits', async () => {
  for (const [model, effort, expected] of [
    ['claude-sonnet-5-5', 'default', [6_000, 16_000, 12_000, 6_000]],
    ['claude-sonnet-5-5', 'high', [10_000, 24_000, 18_000, 10_000]],
    ['claude-opus-5-5', 'high', [16_000, 48_000, 32_000, 16_000]],
  ]) {
    const limits = []
    const preview = hostedPreview({
      environment: 'preview', apiKey: 'test',
      sources: async () => [{ id: 'local', title: 'Regnskap', text: 'Tall fra regnskapet', url: 'https://fellestall.no/' }],
      createRequest: options => async ({ phase, maxTokens }) => {
        assert.equal(options.model, model)
        assert.equal(options.effort, effort === 'default' ? undefined : effort)
        assert.equal(options.stream, true)
        assert(options.timeoutMs > 180_000)
        limits.push(maxTokens)
        if (phase === 'interpret') return response({ intent, action: 'research', tools: ['fellestall', 'web'], plan: searchPlan })
        if (phase === 'research') return { content: [] }
        if (phase === 'answer-0') return response({
          summary: 'Svar', findings: [{ text: 'Tall fra regnskapet', sourceIds: ['local'] }],
          recommendation: null, uncertainties: [],
        })
        assert.equal(phase, 'review-0')
        return response({ passed: true, issues: [] })
      },
    })
    const result = await call(preview, 'POST', { question: 'Hva viser regnskapet?', model, effort })
    assert.equal(result.status, 200)
    assert.deepEqual(limits, expected)
  }
})
