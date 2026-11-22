import assert from 'node:assert/strict'
import test from 'node:test'
import { hostedPreview } from './hosted-preview.mjs'

const headers = {
  host: 'preview.test',
  origin: 'https://preview.test',
  'content-type': 'application/json',
}

function call(handler, method, body, requestHeaders = headers) {
  let status
  const res = {
    setHeader() {},
    status(code) { status = code; return res },
    json(payload) { return { status, payload } },
  }
  return handler({ method, headers: requestHeaders, body }, res)
}

test('preview-status og avviste forespørsler bruker ingen modellkall', async () => {
  const options = { apiKey: 'test', createRequest: () => assert.fail('Ingen modellkall forventet') }
  assert.equal((await call(hostedPreview({ ...options, environment: 'production' }), 'GET')).status, 404)
  const preview = hostedPreview({ ...options, environment: 'preview' })
  assert.deepEqual(await call(preview, 'GET'), {
    status: 200, payload: { configured: true, model: 'claude-sonnet-5-5' },
  })
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd' }, { ...headers, origin: 'https://annet.test' })).status, 403)
  assert.equal((await call(preview, 'POST', { question: 'Barnetrygd', history: [null] })).status, 400)
})

test('preview kjører Sven med Sonnet 5.5 og returnerer brukte kilder', async () => {
  const calls = []
  const outputs = {
    plan: { scope: 'Norge', questions: ['Hva viser kildene?'], searches: ['barnetrygd'], counterSearch: 'usikkerhet', missing: [] },
    'answer-0': { summary: 'Oppsummert', findings: [{ text: 'Funn', sourceIds: ['nav'] }], uncertainties: [], recommendation: null },
    'review-0': { passed: true, issues: [] },
  }
  const preview = hostedPreview({
    environment: 'preview',
    apiKey: 'test',
    sources: async () => [{ id: 'nav', title: 'NAV', url: 'https://www.nav.no/', text: 'Testgrunnlag' }],
    createRequest: ({ model }) => async input => {
      assert.equal(model, 'claude-sonnet-5-5')
      calls.push(input.phase)
      if (input.phase === 'plan') assert.match(input.input, /review-5664781959/)
      return { content: input.phase === 'research' ? [] : [{ type: 'text', text: JSON.stringify(outputs[input.phase]) }] }
    },
  })
  const result = await call(preview, 'POST', { question: 'Hva skjedde med barnetrygd?' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.payload.sources, [{ title: 'NAV', url: 'https://www.nav.no/' }])
  assert.deepEqual(calls, ['plan', 'research', 'answer-0', 'review-0'])
})
