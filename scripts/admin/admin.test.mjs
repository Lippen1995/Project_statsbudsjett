import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../../server/admin/handler.mjs'
import { createGithub, validateSvenEdit } from '../../server/admin/sven.mjs'
import { telemetryEvent, ingest, metrics } from '../../server/admin/telemetry.mjs'
import { adminEmail } from '../../server/admin/auth.mjs'
import { testDatabase } from './test-support.mjs'

const origin = 'http://localhost:5173'
const request = (path, options = {}) => new Request(origin + path, {
  ...options, headers: { origin, 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '127.0.0.1', ...options.headers },
})

test('ekte innlogging, serververn, CSRF, utlogging og statistikk mot PostgreSQL', async t => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  let writes = 0
  const handler = createHandler({ ...db, github: { writable: true, save: async () => { writes++; return {} } }, origin })
  const login = password => handler(request('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: adminEmail, password }) }))
  for (const path of ['/api/admin/session', '/api/admin/metrics', '/api/admin/pipeline', '/api/admin/sven/files', '/api/admin/sven/file?id=instructions', '/api/admin/log', '/api/admin/status']) {
    const result = await handler(request(path))
    assert.equal(result.status, 401, path)
    assert.equal(result.headers.get('cache-control'), 'no-store')
  }
  assert.equal((await handler(request('/api/admin/sven/file', { method: 'PUT', body: '{}' }))).status, 401)
  assert.equal(writes, 0)
  assert.equal((await login('feil-passord')).status, 401)
  const signedIn = await login(db.password)
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  const cookies = signedIn.headers.getSetCookie()
  assert.ok(cookies.some(c => /httponly/i.test(c)))
  assert.ok(cookies.some(c => /samesite=lax/i.test(c)))
  const cookie = cookies.map(c => c.split(';')[0]).join('; ')
  const authenticated = (path, options = {}) => handler(request(path, { ...options, headers: { cookie, ...options.headers } }))
  assert.equal((await authenticated('/api/admin/session')).status, 200)
  assert.equal((await authenticated('/api/admin/metrics?days=999')).status, 400)
  assert.equal((await authenticated('/api/admin/sven/file', { method: 'PUT', body: '{}', headers: { origin: 'https://uvedkommende.no' } })).status, 403)
  assert.equal((await authenticated('/api/admin/sven/file', { method: 'PUT', body: '{}', headers: { origin: '' } })).status, 403)
  assert.equal(writes, 0)
  const signup = await handler(request('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ email: 'other@example.com', password: db.password, name: 'Other' }) }))
  assert.equal(signup.status, 400)
  assert.equal((await db.sql.query('SELECT count(*)::int AS n FROM ft_admin_user'))[0].n, 1)
  for (let i = 0; i < 2; i++) {
    assert.equal((await handler(request('/api/telemetry', { method: 'POST', body: JSON.stringify({ path: '/', source: 'direkte', device: 'desktop', type: 'view' }) }))).status, 204)
  }
  await ingest(db.sql, { path: '/', source: 'direkte', device: 'desktop', type: 'lcp', value: 1800 }, '127.0.0.1', db.secret)
  await ingest(db.sql, { path: '/', source: 'direkte', device: 'desktop', type: 'lcp', value: 2200 }, '127.0.0.1', db.secret)
  const report = await (await authenticated('/api/admin/metrics?days=7')).json()
  assert.equal(report.totals.views, 2)
  assert.equal(report.totals.lcp, 2000)
  assert.equal(report.totals.inp, null)
  assert.equal(report.totals.lcp_count, 2)
  assert.deepEqual(report.pages, [{ label: '/', views: 2 }])
  assert.equal(JSON.stringify(await db.sql.query('SELECT * FROM ft_admin_ingest_limit')).includes('127.0.0.1'), false)
  assert.equal((await authenticated('/api/auth/sign-out', { method: 'POST', body: '{}' })).status, 200)
  assert.equal((await authenticated('/api/admin/session')).status, 401)
  // Sperren lever i databasen, også når en ny instans av auth opprettes.
  for (let i = 0; i < 7; i++) {
    const result = await login('feil-passord')
    if (i === 6) assert.equal(result.status, 429)
  }
})

test('målinger avviser admin, søkestrenger, rå henvisninger og ugyldige verdier', () => {
  const value = { path: '/analyser/', device: 'mobile', source: 'ssb.no', type: 'view' }
  assert.ok(telemetryEvent(value))
  for (const patch of [{ path: '/admin' }, { path: '/admin/' }, { path: '/api/admin/session' }, { path: '/?inntekt=900000' }, { path: '//example.com/' }, { device: 'fingerprint' }, { type: 'lcp', value: -1 }, { type: 'cls', value: 11 }]) assert.equal(telemetryEvent({ ...value, ...patch }), null)
  assert.equal(telemetryEvent({ ...value, source: 'https://site.no/private?query=person' }).source, 'direkte')
})

test('Sven bruker tillatte filer, SHA-basert lagring og avviser filkonflikter', async () => {
  const edit = { id: 'handbook', content: 'En konkret og god redaksjonell føring. '.repeat(5), sha: 'a'.repeat(40), reason: 'Presiser kildearbeidet' }
  assert.equal(validateSvenEdit(edit).path, 'editorial/learning/handbook.md')
  for (const patch of [{ id: '../../.env' }, { sha: '' }, { reason: 'x' }, { reason: 'En endring\nNy linje' }, { content: ' ' }, { id: 'preferences', content: '{ødelagt JSON}' }]) assert.throws(() => validateSvenEdit({ ...edit, ...patch }))
  let call
  const github = createGithub({ token: 'kun-test-token', fetcher: async (url, options) => {
    call = { url, options }
    return Response.json({ content: { sha: 'b'.repeat(40) }, commit: { sha: 'c'.repeat(40) } })
  } })
  assert.equal((await github.save(edit)).sha, 'b'.repeat(40))
  assert.equal(call.url, 'https://api.github.com/repos/Lippen1995/Project_statsbudsjett/contents/editorial/learning/handbook.md')
  assert.equal(JSON.parse(call.options.body).sha, edit.sha)
  assert.equal(JSON.parse(call.options.body).branch, 'main')
  const conflicted = createGithub({ token: 'test', fetcher: async () => Response.json({}, { status: 409 }) })
  await assert.rejects(conflicted.save(edit), { status: 409 })
  await assert.rejects(createGithub({ token: '' }).save(edit), { status: 503 })
})

test('summer er vektet, perioder isolerte og tomme målinger er null', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  const initial = await metrics(db.sql, 7)
  assert.equal(initial.totals.lcp, null)
  await db.sql.query(`INSERT INTO ft_admin_daily(day, path, source, device, views, lcp_sum, lcp_count) VALUES
    (CURRENT_DATE, '/', 'direkte', 'desktop', 5, 6000, 3),
    (CURRENT_DATE, '/analyser/', 'ssb.no', 'mobile', 2, 4000, 1),
    (CURRENT_DATE - 20, '/', 'direkte', 'mobile', 10, 9000, 1)`)
  const week = await metrics(db.sql, 7)
  assert.equal(week.totals.views, 7)
  assert.equal(week.totals.lcp, 2500)
  assert.equal((await metrics(db.sql, 30)).totals.views, 17)
  for (let i = 0; i < 60; i++) await ingest(db.sql, { path: '/', device: 'mobile', source: 'direkte', type: 'view' }, 'test-ip', db.secret, 10000)
  assert.equal(await ingest(db.sql, { path: '/', device: 'mobile', source: 'direkte', type: 'view' }, 'test-ip', db.secret, 10000), false)
})
