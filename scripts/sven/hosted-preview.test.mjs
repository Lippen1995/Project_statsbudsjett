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

function callOnce(handler, method, body, requestHeaders = headers) {
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

async function call(handler, method, body, requestHeaders = headers) {
  if (method !== 'POST') return callOnce(handler, method, body, requestHeaders)
  const requestId = body?.requestId ?? randomBytes(32).toString('hex')
  let res = await callOnce(handler, method, { ...body, requestId }, requestHeaders)
  for (let i = 0; res.payload.continuation; i++) {
    assert(i < 12, 'Previewen fortsatte uten å bli ferdig')
    res = await callOnce(handler, 'POST', { requestId, resume: true }, requestHeaders)
  }
  return res
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

const chart = {
  type: 'line', title: 'Netto driftsutgifter i Oslo', axis: 'År', unit: 'Kr per innbygger',
  series: ['Oslo'], rows: [{ label: '2023', values: [81000] }, { label: '2024', values: [null] },
    { label: '2025', values: [87000] }], sourceIds: ['ssb'],
}

test('preview returnerer grafen og kilden etter kvalitetskontrollen', async () => {
  const preview = hostedPreview({
    environment: 'preview', apiKey: 'test',
    sources: async () => [{ id: 'ssb', text: '2023: 81 000. 2024: mangler. 2025: 87 000.', title: 'SSB', url: 'https://www.ssb.no/' }],
    createRequest: () => async ({ phase, instructions, input }) => {
      if (phase === 'interpret') {
        assert.match(instructions, /Chatten kan vise grafer direkte/)
        return response({ intent, action: 'research', tools: ['fellestall'], plan: searchPlan })
      }
      if (phase === 'answer-0') {
        assert.match(instructions, /Legg til feltet chart/)
        return response({ summary: 'Utgiftene økte.', findings: [], uncertainties: [], recommendation: null, chart })
      }
      assert.equal(phase, 'review-0')
      assert.deepEqual(JSON.parse(input).answer.chart, chart)
      return response({ passed: true, issues: [] })
    },
  })
  const { status, payload } = await call(preview, 'POST', { question: 'Vis netto driftsutgifter i Oslo i en graf' })
  assert.equal(status, 200)
  assert.deepEqual(payload.chart, chart)
  assert.deepEqual(payload.sources, [{ id: 'ssb', title: 'SSB', url: 'https://www.ssb.no/' }])
})

test('brukerens egne tall kan vises med ett kall og ukjente kilde-ID-er avvises', async () => {
  for (const sourceIds of [[], ['ukjent']]) {
    const userChart = { ...chart, type: 'bar', sourceIds }
    const preview = hostedPreview({
      environment: 'preview', apiKey: 'test', sources: () => assert.fail('Brukerdata trenger ikke kildeoppslag'),
      createRequest: () => async ({ phase }) => {
        assert.equal(phase, 'interpret')
        return response({ intent, action: 'reply', reply: 'Tallene du oppga.', chart: userChart })
      },
    })
    const { status, payload } = await call(preview, 'POST', { question: 'Vis 81 000 i 2023 og 87 000 i 2025 i et stolpediagram' })
    assert.equal(status, 200)
    assert.deepEqual(payload.chart, sourceIds.length ? undefined : userChart)
  }
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
      assert.equal(maxTokens, 128_000)
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
            assert.equal(tools.find(tool => tool.name === 'web_search').max_uses, 2)
            assert.equal(tools.find(tool => tool.name === 'web_fetch').max_uses, 2)
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
              assert.equal(input.canContinueResearch, true)
              return response({ passed: true, issues: [], followupSearch: proposedQuery })
            }
            assert.deepEqual(input.previousSearches, initialWeb ? [] : [proposedQuery])
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
    assert.equal(allocatedSearches, initialWeb ? 4 : 2)
    assert.deepEqual(phases, initialWeb
      ? ['interpret', 'research', 'research-followup', 'answer-0', 'review-0']
      : ['interpret', 'answer-0', 'review-0', 'research-followup', 'answer-1', 'review-1'])
  }
})

test('preview uses the provider maximum in every phase regardless of model or effort', async () => {
  for (const [model, effort] of [
    ['claude-sonnet-5-5', 'default'],
    ['claude-sonnet-5-5', 'high'],
    ['claude-opus-5-5', 'high'],
  ]) {
    const limits = []
    const preview = hostedPreview({
      environment: 'preview', apiKey: 'test',
      sources: async () => [{ id: 'local', title: 'Regnskap', text: 'Tall fra regnskapet', url: 'https://fellestall.no/' }],
      createRequest: options => async ({ phase, maxTokens }) => {
        assert.equal(options.model, model)
        assert.equal(options.effort, effort === 'default' ? undefined : effort)
        assert.equal(options.stream, true)
        assert.equal(options.timeoutMs, null)
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
    assert.deepEqual(limits, [128_000, 128_000, 128_000, 128_000])
  }
})

test('an investigation continues across separate invocations and each billed phase runs once', async () => {
  const data = new Map()
  const cache = { get: async key => data.get(key), set: async (key, value) => data.set(key, value) }
  const phases = []
  const options = {
    environment: 'preview', apiKey: 'test', cache,
    sources: async () => [{ id: 'local', title: 'Regnskap', text: 'Fellestalls tallgrunnlag' }],
    createRequest: ({ timeoutMs }) => async ({ phase }) => {
      assert.equal(timeoutMs, null)
      phases.push(phase)
      if (phase === 'interpret') return response({ intent, action: 'research', tools: ['fellestall', 'web'], plan: searchPlan })
      if (phase === 'research') return { content: [] }
      if (phase === 'answer-0') return response({
        summary: 'Svar', findings: [{ text: 'Funn', sourceIds: ['local'] }], recommendation: null, uncertainties: [],
      })
      assert.equal(phase, 'review-0')
      return response({ passed: true, issues: [] })
    },
  }
  const requestId = randomBytes(32).toString('hex')
  const expected = ['interpret', 'research', 'answer-0', 'review-0']
  for (const [i, phase] of expected.entries()) {
    const input = i === 0 ? { question: 'Hva viser regnskapet?' } : { resume: true }
    const result = await callOnce(hostedPreview(options), 'POST', { ...input, requestId })
    assert.deepEqual(phases, expected.slice(0, i + 1), phase)
    if (i < expected.length - 1) assert.deepEqual(result, { status: 202, payload: { pending: true, continuation: true } })
    else assert.equal(result.payload.summary, 'Svar')
  }
  const repeated = await callOnce(hostedPreview(options), 'POST', { requestId, resume: true })
  assert.equal(repeated.status, 200)
  assert.deepEqual(phases, expected)
})

test('queued analysis completes after the client leaves and restores a durable checkpoint after cache loss', async () => {
  const { previewJobCodec } = await import('../../server/sven/preview-requests.mjs')
  const codec = previewJobCodec('simulated-server-secret')
  const storage = new Map()
  const cache = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value) }
  const messages = new Map()
  const delivered = []
  const phases = []
  let interrupted = false
  const options = {
    environment: 'preview', apiKey: 'test', cache,
    publishJob: async (id, state) => {
      const key = id + ':' + state.revision
      if (!messages.has(key)) messages.set(key, codec.pack(id, state))
    },
    sources: async () => [{ id: 'accounts', title: 'Regnskap', text: 'Fellestalls tallgrunnlag' }],
    createRequest: ({ timeoutMs }) => async ({ phase }) => {
      assert.equal(timeoutMs, 260_000)
      phases.push(phase)
      if (phase === 'interpret') return response({ intent, action: 'research', tools: ['fellestall', 'web'], plan: searchPlan })
      if (phase === 'research') return { content: [] }
      if (phase === 'answer-0') {
        if (!interrupted) {
          interrupted = true
          throw new Error('Temporarily disconnected')
        }
        return response({
          summary: 'Ferdig analyse', findings: [{ text: 'Funn', sourceIds: ['accounts'] }], recommendation: null, uncertainties: [],
        })
      }
      assert.equal(phase, 'review-0')
      return response({ passed: true, issues: [] })
    },
  }
  const requestId = randomBytes(32).toString('hex')
  const question = 'Privat spørsmål til Sven'
  const chat = hostedPreview(options)
  const accepted = await callOnce(chat, 'POST', { requestId, question })
  assert.deepEqual(accepted, { status: 202, payload: { pending: true, background: true } })
  assert.deepEqual(await callOnce(chat, 'POST', { requestId, resume: true }),
    { status: 202, payload: { pending: true, background: true, phase: 'queued' } })
  assert.deepEqual(phases, [])
  assert.equal(messages.size, 1)
  assert(![...messages.values()][0].includes(question))
  // The browser sends nothing while fresh worker instances consume the queue.
  for (const [, packet] of messages) {
    const { id, state } = codec.unpack(packet)
    const work = () => hostedPreview(options).work(id, state)
    const result = await work()
    delivered.push(state.revision)
    if (state.revision === 0) storage.clear()
    if (result.status === 202 && !result.body.background) {
      assert.equal(state.revision, 2)
      assert.equal((await work()).body.background, true)
    }
  }
  assert.deepEqual(delivered, [0, 1, 2, 3])
  const finished = await callOnce(hostedPreview(options), 'POST', { requestId, resume: true })
  assert.equal(finished.payload.summary, 'Ferdig analyse')
  assert.deepEqual(phases, ['interpret', 'research', 'answer-0', 'answer-0', 'review-0'])
  // Redelivery of a completed queue entry cannot start another billable call.
  const { id, state } = codec.unpack([...messages.values()][0])
  assert.equal((await hostedPreview(options).work(id, state)).status, 200)
  assert.equal(phases.length, 5)
})

test('store undersøkelser kan ta flere enn tre nettsøk i køen, og kan gjenopptas uten nye kall for ferdige trinn', async () => {
  const { claudeTransport } = await import('../../server/sven/provider.mjs')
  const { previewJobCodec } = await import('../../server/sven/preview-requests.mjs')
  const codec = previewJobCodec('simulated-server-secret')
  const storage = new Map()
  const messages = new Map()
  const phases = []
  const allocations = []
  const excerpts = new Map([
    ['research', ['tildelinger','Offisiell tildelingsliste med beløp per mottaker.']],
    ['research-followup', ['utbetalinger','Regnskapsnote med bokførte utbetalinger.']],
    ['research-followup-2', ['leveranser','Kontrollrapport dokumenterer ferdige leveranser.']],
  ])
  const queries = ['ordning 2025 bokførte utbetalinger regnskapsnote','ordning 2025 ferdige leveranser kontrollrapport']
  const options = {
    environment:'preview', apiKey:'test',
    cache:{get:async key=>storage.get(key),set:async (key,value)=>storage.set(key,value)},
    publishJob:async (id,state)=>{
      if (!messages.has(state.revision)) messages.set(state.revision,codec.pack(id,state))
    },
    createRequest:options => claudeTransport({ ...options, onUsage:({phase})=>phases.push(phase), fetchImpl:async (_url,init)=>{
      const input = JSON.parse(init.body)
      const payload = JSON.parse(input.messages[0].content)
      const instructions = input.system[0].text
      const phase = phases.at(-1)
      if (instructions.includes('Tolk meldingen før')) {
        return Response.json({...response({intent,action:'research',tools:['web'],plan:searchPlan}),stop_reason:'end_turn',usage:{}})
      }
      const searchTool = input.tools?.find(tool=>tool.name==='web_search')
      if (searchTool) {
        allocations.push(searchTool.max_uses)
        const key = payload.query ? payload.query===queries[0] ? 'research-followup':'research-followup-2' : 'research'
        const [url,text]=excerpts.get(key)
        if (key==='research-followup-2') assert.deepEqual(payload.previousSearches,queries.slice(0,1))
        return Response.json({content:[{type:'text',text,citations:[{
          type:'web_search_result_location',url:'https://www.regjeringen.no/'+url,title:url,cited_text:text,
        }]}],stop_reason:key==='research-followup-2'?'pause_turn':'end_turn',usage:{server_tool_use:{web_search_requests:2}}})
      }
      if (payload.answer) {
        assert.equal(payload.canContinueResearch,true)
        assert.equal(payload.searchesRemaining,undefined)
        const query = queries[payload.sources.length-1]
        return Response.json({...response({passed:true,issues:[],...(query?{followupSearch:query}:{})}),stop_reason:'end_turn',usage:{}})
      }
      assert(phase)
      const findings = payload.sources.map(source=>({text:source.text,sourceIds:[source.id]}))
      return Response.json({...response({summary:'Gjennomgått',findings,uncertainties:[],recommendation:null}),stop_reason:'end_turn',usage:{}})
    }}),
  }
  const requestId = randomBytes(32).toString('hex')
  const chat = hostedPreview(options)
  assert.equal((await callOnce(chat,'POST',{requestId,question:'Hvilke tildelinger, utbetalinger og ferdige leveranser er dokumentert?'})).status,202)
  for (const [revision,packet] of messages) {
    assert(revision < 12)
    const {id,state}=codec.unpack(packet)
    if (revision===7) storage.clear()
    await hostedPreview(options).work(id,state)
  }
  const finished=await callOnce(chat,'POST',{requestId,resume:true})
  assert.equal(finished.status,200)
  assert.deepEqual(allocations,[2,2,2])
  assert.equal(finished.payload.usage.searches,6)
  assert.equal(finished.payload.sources.length,3)
  assert.deepEqual(phases,[
    'interpret','research','answer-0','review-0','research-followup','answer-1','review-1',
    'research-followup-2','answer-2','review-2',
  ])
})

test('videre nettsøk stanser ved gjentatte søk og ved kilder som gjentar samme innhold', async () => {
  const original = 'Årsrapporten beskriver tildelinger, men dokumenterer ikke utbetalinger.'
  const query = 'Oslo 2025 utbetalinger årsrapport'
  const publicExcerpt = (url,text)=>({content:[{type:'text',text,citations:[{
    type:'web_search_result_location',url,title:'Årsrapport',cited_text:text,
  }]}]})
  for (const sameEvidence of [true,false]) {
    const webPhases = []
    const options = { environment:'preview',apiKey:'test',createRequest:()=>async ({phase,input})=>{
      const payload = JSON.parse(input)
      if (phase === 'interpret') return response({intent,action:'research',tools:['web'],plan:searchPlan})
      if (phase === 'research') {
        webPhases.push(phase)
        return publicExcerpt('https://www.regjeringen.no/rapport',original)
      }
      if (phase === 'research-followup') {
        webPhases.push(phase)
        return publicExcerpt('https://www.regjeringen.no/rapport-kopi',sameEvidence?original.toUpperCase():'Vedlegget viser når ordningen åpnet.')
      }
      if (phase.startsWith('answer-')) return response({summary:original,
        findings:[{text:original,sourceIds:[payload.sources[0].id]}],uncertainties:[],recommendation:null})
      assert.match(phase,/^review-[01]$/)
      const followupSearch = phase === 'review-0' ? query : '2025 Oslo – årsrapport utbetalinger'
      return response({passed:true,issues:[],followupSearch})
    } }
    const result = await call(hostedPreview(options),'POST',{question:'Hvor mye ble tildelt og utbetalt i 2025?'})
    assert.equal(result.status,200)
    assert.deepEqual(webPhases,['research','research-followup'])
    assert.match(result.payload.uncertainties.join(' '),/Videre søk ga ikke nytt grunnlag/)
    assert.equal(result.payload.sources.length,1)
  }
})
