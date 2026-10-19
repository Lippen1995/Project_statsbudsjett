import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyPipeline, ensureAutomatic, applySvenSuggestion } from '../analyser/pipeline-model.mjs'
import { eligibleTopics } from '../../server/admin/topics.mjs'
import { createGithub } from '../../server/admin/sven.mjs'
import { createHandler } from '../../server/admin/handler.mjs'
import { testDatabase } from './test-support.mjs'

const at = '2026-10-19T12:00:00Z'
const topic = id => ({ topic: `Et konkret spørsmål om ${id}`, instructions: 'Undersøk primærkilder og forklar endringen i faste kroner.', topicKey: `${id}:real-expenditure-growth`, reportPlan: { kind: 'expenditure', departmentId: id, start: 2020, end: 2025 } })
const topics = ['alpha', 'beta', 'gamma', 'delta'].map(topic)
const publishedArticle = id => ({ createdAt: at, report: { kind: 'real-expenditure-per-capita', scopeId: id } })

test('ett automatisk tema består; eksplisitte Sven-bestillinger legges til én om gangen og erstatning bevarer dato/plass', () => {
  const automatic = ensureAutomatic(emptyPipeline(), topics[0], { at })
  let document = applySvenSuggestion(automatic, { suggestion: topics[1], scheduledDate: '2026-11-02' }, at)
  document = applySvenSuggestion(document, { suggestion: topics[2], scheduledDate: '2026-11-09' }, at)
  assert.equal(document.items.length, 3)
  assert.equal(ensureAutomatic(document, topics[3], { at }).items.length, 3)
  const original = document.items[0]
  const replaced = applySvenSuggestion(document, { id: original.id, suggestion: topics[3], scheduledDate: original.scheduledDate }, at)
  assert.equal(replaced.items[0].id, original.id)
  assert.equal(replaced.items[0].scheduledDate, original.scheduledDate)
  assert.equal(replaced.items[0].topicKey, topics[3].topicKey)
  assert.equal(replaced.items[0].requestedBy, 'admin')
  assert.deepEqual(replaced.items.slice(1), document.items.slice(1))
  assert.deepEqual(replaced.history[0], { entry: original, status: 'replaced', at })
})

test('Sven gjenbruker ikke publiserte, kølagte, slettede eller forkastede forslag', () => {
  const document = ensureAutomatic(emptyPipeline(), topics[0], { at })
  document.history.push({ entry: { topicKey: topics[1].topicKey }, status: 'deleted', at })
  assert.deepEqual(eligibleTopics({ topics }, [publishedArticle('gamma')], document, { at }).map(t => t.topicKey), [topics[3].topicKey])
  assert.equal(eligibleTopics({ topics }, [publishedArticle('gamma')], document, { at, excludeKeys: [topics[3].topicKey] }).length, 0)
  assert.throws(() => eligibleTopics({ topics }, [], document, { excludeKeys: [null] }), /Ugyldig/)
})

test('Sven-forslag vises uten skriving; lagring kontrollerer fersk historikk, SHA og serverens plan', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  let document = ensureAutomatic(emptyPipeline(), topics[0], { at }), revision = 1, writes = 0, publications = []
  const sha = () => String(revision).padStart(40, '0')
  const github = createGithub({ token: 'isolated-test', suggestions: async () => ({ version: 1, topics }), fetcher: async (url, options) => {
    if (url.includes('publications.json')) { assert.equal(options.headers.Accept, 'application/vnd.github.raw+json'); return Response.json(publications) }
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body)
      assert.equal(body.sha, sha())
      document = JSON.parse(Buffer.from(body.content, 'base64')); revision++; writes++
      return Response.json({ content: { sha: sha() } })
    }
    return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(document)).toString('base64'), sha: sha() })
  } })
  const origin = 'http://localhost:5173'
  const handle = createHandler({ ...db, github, origin })
  const call = (path, body, cookie, requestOrigin = origin, method = 'POST') => handle(new Request(origin + path, { method, headers: { origin: requestOrigin, 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '127.0.0.1', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }))
  assert.equal((await call('/api/admin/pipeline/suggest', { sha: sha() })).status, 401)
  const login = await call('/api/auth/sign-in/email', { email: 'info@fjordinsight.com', password: db.password })
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  assert.equal((await call('/api/admin/pipeline/suggest', {}, cookie, 'https://other.invalid')).status, 403)
  const proposed = await call('/api/admin/pipeline/suggest', { sha: sha() }, cookie)
  assert.equal(proposed.status, 200)
  assert.equal((await proposed.json()).suggestion.topicKey, topics[1].topicKey)
  assert.equal(writes, 0)
  const generate = { action: 'generate', topicKey: topics[1].topicKey, scheduledDate: '2026-11-02', sha: sha() }
  const save = value => call('/api/admin/pipeline', value, cookie, origin, 'PUT')
  assert.equal((await save({ ...generate, reportPlan: { kind: 'forged' } })).status, 400)
  publications = [publishedArticle('beta')]
  assert.equal((await save(generate)).status, 409)
  assert.equal(writes, 0)
  publications = []
  const saved = await save(generate)
  assert.equal(saved.status, 200)
  const first = (await saved.json()).items[1]
  assert.deepEqual(first.reportPlan, topics[1].reportPlan)
  assert.equal(first.source, 'sven'); assert.equal(first.requestedBy, 'admin')
  assert.equal((await save(generate)).status, 409)
  const original = document.items[0]
  const replacement = await call('/api/admin/pipeline/suggest', { id: original.id, sha: sha() }, cookie)
  assert.equal((await replacement.json()).suggestion.topicKey, topics[2].topicKey)
  assert.equal((await save({ action: 'generate', id: original.id, topicKey: topics[2].topicKey, scheduledDate: original.scheduledDate, sha: sha() })).status, 200)
  assert.equal(document.items[0].id, original.id)
  assert.equal(document.items[0].scheduledDate, original.scheduledDate)
  assert.equal(document.history[0].status, 'replaced')
  assert.equal((await save({ action: 'generate', topicKey: topics[2].topicKey, scheduledDate: '2026-11-16', sha: sha() })).status, 409)
  assert.equal(writes, 2)
})
