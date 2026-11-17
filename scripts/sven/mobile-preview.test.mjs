import { test } from 'node:test'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mobilePreview } from './mobile-preview.mjs'

test('lokal mobilchat henter reelt KOSTRA-grunnlag og returnerer kilder over HTTP', async () => {
  const root = fileURLToPath(new URL('../../web', import.meta.url))
  let calls = 0
  const server = mobilePreview({ root, generate: async ({ input }) => {
    calls++
    const { sources, question } = JSON.parse(input)
    const source = sources.find(item => item.id === 'kostra-net-expenses-1103')
    const [{ year, netExpenditureNokPerCapita }] = JSON.parse(source.text).data
    assert.match(question, new RegExp(String(year)))
    if (calls === 1) assert.equal(netExpenditureNokPerCapita, 80909)
    else assert.equal(year, 2024)
    return {
      summary: 'Netto driftsutgifter i Stavanger.',
      findings: [{ text: `${netExpenditureNokPerCapita} kroner per innbygger`, sourceIds: [source.id] }],
      uncertainties: [],
      recommendation: null,
    }
  } })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const send = (question, requestOrigin = origin, context) => fetch(origin + '/api/sven/chat', {
    method:'POST', headers:{ origin:requestOrigin, 'content-type':'application/json' }, body:JSON.stringify({ question, context }),
  })
  try {
    assert.equal((await fetch(origin + '/')).status, 200)
    assert.equal((await send('Netto driftsutgifter i Stavanger i 2025', 'https://example.org')).status, 403)
    assert.equal((await send('Utenfor kildedekningen')).status, 422)
    const response = await send('Netto driftsutgifter i Stavanger i 2025')
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.findings[0].text, '80909 kroner per innbygger')
    assert.match(body.sources[0].url, /12137/)
    assert.deepEqual(body.context, { topic:'municipal', municipalities:['Stavanger'] })
    assert.equal((await send('Hva med 2024?')).status, 422)
    const followUp = await send('Hva med 2024?', origin, body.context)
    assert.equal(followUp.status, 200)
    assert.deepEqual((await followUp.json()).context, body.context)
    assert.equal(calls, 2)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
