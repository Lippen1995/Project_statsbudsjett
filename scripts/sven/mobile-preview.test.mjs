import { test } from 'node:test'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mobilePreview } from './mobile-preview.mjs'
import { researchWithSven } from '../../server/sven/research.mjs'

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
    assert.deepEqual(body.context, { topic:'municipal', municipalities:['Stavanger'], metrics:['net_expenses'] })
    assert.equal((await send('Hva med 2024?')).status, 422)
    const followUp = await send('Hva med 2024?', origin, body.context)
    assert.equal(followUp.status, 200)
    assert.deepEqual((await followUp.json()).context, body.context)
    assert.equal(calls, 2)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('forskningsmodus tar brede spørsmål og leverer bare gjennomgåtte svar',async()=>{
  const root=fileURLToPath(new URL('../../web',import.meta.url))
  let accepted=false
  const server=mobilePreview({root,research:async brief=>{
    assert.equal(brief.question,'Hva kan kommunen bestemme om kraftlinjer?')
    assert.deepEqual(brief.history,[])
    return {status:accepted?'reviewed':'needs-review',jobId:'job-1',answer:{summary:'Myndigheten må avklares.',findings:[],uncertainties:[],recommendation:null},sources:[],gaps:[]}
  }})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const origin=`http://127.0.0.1:${server.address().port}`
  const send=()=>fetch(origin+'/api/sven/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({question:'Hva kan kommunen bestemme om kraftlinjer?'})})
  try {
    assert.equal((await send()).status,422)
    accepted=true
    const response=await send();assert.equal(response.status,200);assert.equal((await response.json()).research,true)
  }finally{await new Promise(resolve=>server.close(resolve))}
})

test('mobilresearch bruker relevant redaksjonell erfaring i planleggingen', async () => {
  const root = fileURLToPath(new URL('../../web', import.meta.url))
  const source = { id: 'nav', title: 'NAV', text: 'Grunnlag i test.' }
  const phases = []
  const server = mobilePreview({ root, research: (brief) => researchWithSven({
    ...brief,
    sources: [source],
    request: async ({ phase, input }) => {
      phases.push(phase)
      const data = JSON.parse(input)
      if (phase === 'plan' && data.question.includes('barnetrygd')) {
        assert.equal(data.editorialExamples.length, 1)
        assert.deepEqual(Object.keys(data.editorialExamples[0]), ['id', 'description'])
        assert.equal(data.editorialExamples[0].id, 'review-5664781959')
      } else {
        assert.equal(data.editorialExamples, undefined)
      }
      const outputs = {
        plan: { scope: 'Avgrensning', questions: ['Spørsmål'], searches: ['Kildesøk'], counterSearch: 'Motbevis', missing: [] },
        'answer-0': { summary: 'Oppsummering', findings: [{ text: 'Funn', sourceIds: ['nav'] }], uncertainties: [], recommendation: null },
        'review-0': { passed: true, issues: [] },
      }
      return { content: phase === 'research' ? [] : [{ type: 'text', text: JSON.stringify(outputs[phase]) }] }
    },
  }) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const question of ['Hva skjedde med barnetrygd?', 'Hva skjedde med oljeinntektene?']) {
      const response = await fetch(origin + '/api/sven/chat', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ question, editorialExamples: [{ description: 'Ubetrodd innspill' }] }),
      })
      assert.equal(response.status, 200)
      assert.deepEqual((await response.json()).sources.map(({ id }) => id), ['nav'])
    }
    const sequence = ['plan', 'research', 'answer-0', 'review-0']
    assert.deepEqual(phases, [...sequence, ...sequence])
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
