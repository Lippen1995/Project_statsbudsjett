import test from 'node:test'
import assert from 'node:assert/strict'
import { createGithub } from '../../server/admin/sven.mjs'
import { createHandler } from '../../server/admin/handler.mjs'
import { emptyPipeline } from '../analyser/pipeline-model.mjs'
import { testDatabase } from './test-support.mjs'

test('pipeline-API krever innlogging og samme origin, lagrer varig og avviser gamle versjoner', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  let document = emptyPipeline(), revision = 1, writes = 0
  const sha = () => revision.toString(16).padStart(40, '0')
  const github = createGithub({ token: 'kun-test-token', fetcher: async (_url, options) => {
    if (options.method === 'PUT') {
      const value = JSON.parse(options.body)
      if (value.sha !== sha()) return Response.json({}, { status: 409 })
      document = JSON.parse(Buffer.from(value.content, 'base64')); revision++; writes++
      return Response.json({ content: { sha: sha() } })
    }
    return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(document)).toString('base64'), sha: sha() })
  } })
  const origin = 'http://localhost:5173'
  const handle = createHandler({ ...db, github, origin })
  const request = (path, options = {}) => handle(new Request(origin + path, { ...options, headers: { origin, 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '127.0.0.1', ...options.headers } }))
  assert.equal((await request('/api/admin/pipeline')).status, 401)
  assert.equal((await request('/api/admin/pipeline', { method: 'PUT', body: '{}' })).status, 401)
  assert.equal(writes, 0)
  const login = await request('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: 'info@fjordinsight.com', password: db.password }) })
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const change = (value, headers = {}) => request('/api/admin/pipeline', { method: 'PUT', body: JSON.stringify(value), headers: { cookie, ...headers } })
  const first = await (await request('/api/admin/pipeline', { headers: { cookie } })).json()
  assert.equal(first.items.length, 0)
  assert.equal(first.writable, true)
  const action = { action: 'add', topic: 'Har sykehusene fått mer å rutte med?', instructions: 'Sammenlign reelle bevilgninger, og dokumenter avgrensningen.', scheduledDate: '2026-10-26', sha: first.sha }
  assert.equal((await change(action, { origin: 'https://uvedkommende.no' })).status, 403)
  assert.equal(writes, 0)
  const saved = await (await change(action)).json()
  assert.equal(saved.items[0].source, 'admin')
  assert.equal(saved.items[0].scheduledDate, '2026-10-26')
  assert.equal(writes, 1)
  assert.equal((await change(action)).status, 409)
  assert.equal(writes, 1)
  const reloaded = await (await request('/api/admin/pipeline', { headers: { cookie } })).json()
  assert.deepEqual(reloaded, saved)
  const changed = await (await change({ action: 'edit', id: saved.items[0].id, sha: saved.sha, topic: 'Et mer presist sykehusspørsmål', instructions: 'Undersøk kapittel og poster.', scheduledDate: '2026-10-27' })).json()
  assert.equal(changed.items[0].scheduledDate, '2026-10-27')
  assert.equal((await change({ action: 'delete', id: changed.items[0].id, sha: changed.sha })).status, 200)
  assert.equal(document.items.length, 0)
  assert.equal(document.history[0].status, 'deleted')
})
