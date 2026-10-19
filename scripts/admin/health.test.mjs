import test from 'node:test'
import assert from 'node:assert/strict'
import { createHealthMonitor } from '../../server/admin/health.mjs'
import { createHandler } from '../../server/admin/handler.mjs'
import { testDatabase } from './test-support.mjs'

test('status bygger på faktiske kontroller, mellomlagres og logger bare endringer og gjenoppretting', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  let website = true, githubUp = true, requests = 0
  const github = { async checkHealth() { if (!githubUp) throw Error('isolated outage'); return { writable: true } } }
  const health = createHealthMonitor({ sql: db.sql, github, origin: 'https://example.invalid', alertsEnabled: false, fetcher: async () => { requests++; return new Response(website ? 'Fellestall' : 'unavailable', { status: website ? 200 : 503 }) } })
  const expire = () => db.sql.query("UPDATE ft_admin_health_state SET checked_at = now() - interval '1 minute'")
  const first = await health.dashboard()
  assert.equal(first.status, 'operational')
  assert.equal(first.components.length, 3)
  assert.equal(first.incidents.length, 0)
  assert.equal(first.history[0].checks, 3)
  assert.equal(first.history[0].operational, 3)
  assert.equal(first.notifications.enabled, false)
  assert.ok(first.components.every(c => Number.isFinite(c.latency_ms)))
  await health.dashboard(); assert.equal(requests, 1)
  website = false; await expire()
  const broken = await health.dashboard()
  assert.equal(broken.status, 'outage')
  assert.equal(broken.incidents.length, 1)
  assert.equal(broken.incidents[0].status, 'detected')
  assert.equal(broken.history[0].checks, 6)
  assert.equal(broken.history[0].operational, 5)
  await expire(); await health.dashboard()
  assert.equal((await db.sql.query('SELECT count(*)::int AS n FROM ft_admin_health_events'))[0].n, 1)
  githubUp = false; await expire()
  assert.equal((await health.dashboard()).incidents[0].status, 'updated')
  website = true; githubUp = true; await expire()
  const recovered = await health.dashboard()
  assert.equal(recovered.status, 'operational')
  assert.equal(recovered.incidents[0].status, 'resolved')
  assert.equal(recovered.incidents.length, 3)
  assert.equal(recovered.history.length, 1, 'No invented earlier history')
})

test('parallelle serverinstanser deler en databaselease og utfører én statuskontroll', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  let probes = 0
  const options = { sql: db.sql, github: { checkHealth: async () => ({ writable: true }) }, origin: 'https://example.invalid', fetcher: async () => { probes++; await new Promise(resolve => setTimeout(resolve, 50)); return new Response('Fellestall') } }
  const a = createHealthMonitor(options), b = createHealthMonitor(options)
  const reports = await Promise.all([a.check(), b.check()])
  assert.equal(probes, 1)
  assert.deepEqual(reports[0], reports[1])
  assert.equal((await db.sql.query('SELECT sum(checks)::int AS n FROM ft_admin_health_samples'))[0].n, 3)
})

test('offentlig helsesjekk lekker ingen administrasjonsdata; historikk og varsler krever innlogging', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  const github = { checkHealth: async () => ({ writable: true }) }
  const health = createHealthMonitor({ sql: db.sql, github, origin: 'http://localhost:5173', fetcher: async () => new Response('Fellestall') })
  const handle = createHandler({ ...db, github, health, origin: 'http://localhost:5173' })
  const request = path => handle(new Request('http://localhost:5173' + path))
  const publicResponse = await request('/api/health')
  assert.equal(publicResponse.status, 200)
  assert.deepEqual(Object.keys(await publicResponse.json()).sort(), ['checkedAt', 'components', 'status'])
  assert.equal((await request('/api/admin/live-status')).status, 401)
  assert.equal((await request('/api/admin/live')).status, 401)
  const broken = createHandler({ ...db, github, health: { check: async () => { throw Error('private connection details') } } })
  const error = await broken(new Request('https://fellestall.no/api/health'))
  assert.equal(error.status, 503)
  assert.equal((await error.text()).includes('private connection details'), false)
})
