import test from 'node:test'
import { base32 } from '@better-auth/utils/base32'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './test-support.mjs'
import { createHandler } from '../../server/admin/handler.mjs'
import { createPlatform } from '../../server/admin/platform.mjs'
import { recordStore } from '../../server/admin/core.mjs'
import { backupService } from '../../server/admin/backups.mjs'
import { monitoringService } from '../../server/admin/monitoring.mjs'
import { notificationService } from '../../server/admin/notifications.mjs'
import { mailService } from '../../server/admin/mail.mjs'
import { insightReport } from '../../server/admin/insights.mjs'
import { ingest, telemetryEvent } from '../../server/admin/telemetry.mjs'
import { editorialService } from '../../server/admin/editorial.mjs'
import { contentHash } from '../analyser/schema.mjs'
import { checkLinks } from '../../server/admin/infrastructure.mjs'
const origin = 'http://localhost:5173'
const cookieOf = (response) =>
  response.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
const request = (path, value, cookie, method = value ? 'POST' : 'GET') =>
  new Request(origin + path, {
    method,
    headers: {
      origin,
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(value ? { body: JSON.stringify(value) } : {}),
  })

test('tilgang, atomiske versjoner, revisjonslogg og faktisk isolert gjenoppretting', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const owner = (await db.sql.query('SELECT * FROM ft_admin_user'))[0]
  const records = recordStore(db.sql),
    github = { writable: true },
    health = {}
  const platform = createPlatform({ ...db, github, health, origin }),
    handler = createHandler({ ...db, github, health, platform, origin })
  const login = await handler(
    request('/api/auth/sign-in/email', {
      email: owner.email,
      password: db.password,
    }),
  )
  assert.equal(login.status, 200)
  const cookie = cookieOf(login)
  const call = (path, value) =>
    handler(request('/api/admin/' + path, value, cookie))
  await t.test(
    'konto-plugin kan ikke omgå eiervern via offentlig HTTP',
    async () => {
      assert.equal(
        (
          await handler(
            request(
              '/api/auth/admin/set-role',
              { userId: owner.id, role: 'viewer' },
              cookie,
            ),
          )
        ).status,
        403,
      )
    },
  )
  let row
  await t.test(
    'oppretting, CAS-oppdatering og før/etter er én atomisk operasjon',
    async () => {
      row = await records.write(owner, 'issues', {
        data: {
          title: 'Feil ved sammenligning',
          note: 'Isolert test av en reell arbeidsflyt.',
          type: 'bug',
          status: 'open',
          priority: 'normal',
        },
      })
      const old = row.revision
      row = await records.write(owner, 'issues', {
        id: row.id,
        revision: old,
        data: { ...row.data, status: 'resolved' },
      })
      assert.ok(row.revision > old)
      await assert.rejects(
        records.write(owner, 'issues', {
          id: row.id,
          revision: old,
          data: { ...row.data, status: 'open' },
        }),
        (e) => e.status === 409,
      )
      const log = await db.sql.query(
        "SELECT before_value,after_value FROM ft_admin_audit WHERE action='update'",
      )
      assert.equal(log[0].before_value.status, 'open')
      assert.equal(log[0].after_value.status, 'resolved')
    },
  )
  await t.test(
    'leser kan ikke skrive, se mottakere eller omgå ferskt passord',
    async () => {
      await db.sql.query("UPDATE ft_admin_user SET role='viewer' WHERE id=$1", [
        owner.id,
      ])
      assert.equal((await call('records/issues', { data: {} })).status, 403)
      assert.equal((await call('records/recipients')).status, 403)
      assert.equal(
        (await call('editorial/approve', { password: db.password })).status,
        403,
      )
      const notifications = await (await call('notifications')).json()
      assert.equal('recipients' in notifications, false)
      await db.sql.query("UPDATE ft_admin_user SET role='editor' WHERE id=$1", [
        owner.id,
      ])
      assert.equal(
        (await call('data/restore', { password: db.password })).status,
        403,
      )
      await db.sql.query("UPDATE ft_admin_user SET role='admin' WHERE id=$1", [
        owner.id,
      ])
      assert.equal(
        (await call('backups/restore', { password: 'feil' })).status,
        403,
      )
    },
  )
  await t.test(
    'kopien er kryptert, testet i separat skjema og versjonslåst ved tilbakeføring',
    async () => {
      const backups = backupService(db),
        copy = await backups.create(owner, { label: 'Før isolert test' })
      const download = await backups.download(owner, copy.id)
      assert.equal(
        JSON.stringify(download).includes('Feil ved sammenligning'),
        false,
      )
      assert.equal((await backups.test(owner, copy.id)).verified, true)
      assert.equal(
        (
          await db.sql.query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'ft_restore_%'",
          )
        ).length,
        0,
      )
      const version = await backups.version()
      row = await records.write(owner, 'issues', {
        id: row.id,
        revision: row.revision,
        data: { ...row.data, note: 'Endret etter kopien' },
      })
      const restore = {
        id: copy.id,
        checksum: copy.checksum,
        expectedVersion: version,
        confirm: 'GJENOPPRETT',
        reason: 'Test av kontrollert tilbakeføring',
      }
      await assert.rejects(
        backups.restore(owner, restore),
        (e) => e.status === 409,
      )
      await backups.restore(owner, {
        ...restore,
        expectedVersion: await backups.version(),
      })
      const imported = await backups.import(owner, { backup: download })
      assert.equal(imported.imported, true)
      assert.equal(
        (await backups.list(owner)).find((b) => b.id === imported.id).tested_at,
        null,
      )
      const restored = (await records.list('issues'))[0]
      assert.equal(restored.data.status, 'resolved')
      assert.notEqual(restored.data.note, row.data.note)
      assert.ok(restored.revision > row.revision)
      await assert.rejects(
        records.write(owner, 'issues', {
          id: row.id,
          revision: row.revision,
          data: row.data,
        }),
        (e) => e.status === 409,
      )
    },
  )
  await t.test(
    'bakgrunnsarbeid deler en varig lease og lager én automatisk døgnkopi',
    async () => {
      await db.sql.query('DELETE FROM ft_admin_backups')
      let probes = 0
      const dependencies = {
        ...db,
        origin,
        github: {
          api: async () => ({ workflow_runs: [] }),
          readFile: async () => null,
        },
        health: {
          dashboard: async () => ({ status: 'operational', components: [] }),
        },
        providers: {
          monitoring: {
            get: async () => {
              probes++
              return { available: true }
            },
          },
          infrastructure: { get: async () => ({ ssl: { available: false } }) },
        },
      }
      const first = createPlatform(dependencies),
        second = createPlatform(dependencies)
      const result = await Promise.all([first.maintain(), second.maintain()])
      assert.equal(result.filter((r) => r.skipped).length, 1)
      assert.equal(probes, 1)
      assert.equal(
        (
          await db.sql.query('SELECT count(*)::int AS n FROM ft_admin_backups')
        )[0].n,
        1,
      )
    },
  )
  await t.test(
    'tidsinnstillinger og direkte regelaktivering valideres på serveren',
    async () => {
      assert.equal(
        (await call('records/rules', { data: { status: 'active' } })).status,
        400,
      )
      assert.equal(
        (
          await call('records/preferences', {
            id: 'notifications',
            data: { severity: 'warning', quietStart: '99:99' },
          })
        ).status,
        400,
      )
    },
  )
})

test('tofaktor krever bekreftet kode, gir innloggingsutfordring og forbruker reservekode bare én gang', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const auth = db.auth,
    owner = (await db.sql.query('SELECT email FROM ft_admin_user'))[0]
  let login = await auth.handler(
      request('/api/auth/sign-in/email', {
        email: owner.email,
        password: db.password,
      }),
    ),
    cookie = cookieOf(login)
  const enabled = await auth.handler(
    request('/api/auth/two-factor/enable', { password: db.password }, cookie),
  )
  assert.equal(enabled.status, 200, await enabled.clone().text())
  const setup = await enabled.json()
  assert.ok(setup.backupCodes.length > 0)
  assert.equal(
    (await db.sql.query('SELECT "twoFactorEnabled" FROM ft_admin_user'))[0]
      .twoFactorEnabled,
    false,
  )
  const secret = new URL(setup.totpURI).searchParams.get('secret'),
    otp = await auth.api.generateTOTP({
      body: { secret: new TextDecoder().decode(base32.decode(secret)) },
    })
  const verified = await auth.handler(
    request('/api/auth/two-factor/verify-totp', { code: otp.code }, cookie),
  )
  assert.equal(verified.status, 200, await verified.clone().text())
  cookie = cookieOf(verified) || cookie
  assert.equal(
    (await db.sql.query('SELECT "twoFactorEnabled" FROM ft_admin_user'))[0]
      .twoFactorEnabled,
    true,
  )
  await auth.handler(request('/api/auth/sign-out', {}, cookie))
  login = await auth.handler(
    request('/api/auth/sign-in/email', {
      email: owner.email,
      password: db.password,
    }),
  )
  assert.equal((await login.clone().json()).twoFactorRedirect, true)
  cookie = cookieOf(login)
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  })
  assert.equal(session, null)
  const recovered = await auth.handler(
    request(
      '/api/auth/two-factor/verify-backup-code',
      { code: setup.backupCodes[0] },
      cookie,
    ),
  )
  assert.equal(recovered.status, 200, await recovered.clone().text())
  await auth.handler(request('/api/auth/sign-out', {}, cookieOf(recovered)))
  login = await auth.handler(
    request('/api/auth/sign-in/email', {
      email: owner.email,
      password: db.password,
    }),
  )
  cookie = cookieOf(login)
  const reused = await auth.handler(
    request(
      '/api/auth/two-factor/verify-backup-code',
      { code: setup.backupCodes[0] },
      cookie,
    ),
  )
  assert.equal(reused.status, 401)
})

test('anonyme fordelinger, faktisk providerforbruk, kvotevarsler og idempotent e-post', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  for (const value of [500, 1000, 1500, 2500])
    await ingest(
      db.sql,
      {
        path: '/',
        source: 'direkte',
        device: 'desktop',
        type: 'lcp',
        value,
        release: 'a'.repeat(40),
      },
      'local',
      db.secret,
    )
  const insights = await insightReport(db.sql, 7)
  assert.equal(insights.percentiles[0].samples, 4)
  assert.equal(insights.percentiles[0].lower, 1500)
  assert.equal(insights.percentiles[0].p75, 1550)
  assert.equal(
    telemetryEvent({
      path: '/',
      source: 'direkte',
      device: 'desktop',
      type: 'feature',
      feature: 'raw-search-text',
    }),
    null,
  )
  const notifications = notificationService(db.sql),
    account = 'test-account',
    at = new Date().toISOString()
  let calls = 0
  const fetcher = async (url) => {
    calls++
    const path = new URL(url).pathname
    if (path.endsWith('/entitlements'))
      return Response.json({
        entitlements: [
          {
            type: 'metered',
            key: 'api_check_runs',
            name: 'API check runs',
            quantity: 10,
          },
        ],
      })
    if (path === '/v1/accounts/me')
      return Response.json({
        id: account,
        name: 'Testkonto',
        planDisplayName: 'Hobby',
      })
    if (path === '/v1/checks')
      return Response.json([
        {
          id: 'test-check',
          name: 'Fellestall',
          checkType: 'API',
          request: { url: 'https://fellestall.no/api/health' },
          created_at: at,
          activated: true,
          muted: false,
          frequency: 5,
          locations: ['eu-central-1', 'eu-west-2'],
          runParallel: false,
        },
      ])
    return Response.json({
      entries: [
        {
          id: 'initial-only',
          startedAt: at,
          attempts: 1,
          responseTime: 200,
          hasFailures: false,
        },
        {
          id: 'result-one',
          startedAt: at,
          attempts: 8,
          responseTime: 200,
          hasFailures: false,
        },
      ],
      nextId: null,
    })
  }
  const monitoring = monitoringService({
    sql: db.sql,
    notifications,
    fetcher,
    key: 'test-only',
    accountId: account,
  })
  const first = await monitoring.get()
  assert.equal(first.quota.observedRuns, 9)
  assert.equal(first.quota.limit, 10)
  assert.equal(first.checks[0].stopped, false)
  const initialCalls = calls
  await monitoring.get()
  assert.equal(calls, initialCalls)
  const list = await notifications.list()
  assert.equal(
    list.items.filter((n) => n.type === 'quota' && !n.resolved_at).length,
    2,
  )
  let sends = 0
  const mail = mailService({
    sql: db.sql,
    key: 'test-only',
    from: 'test@example.com',
    fetcher: async () => {
      sends++
      return Response.json({ id: 'mail-one' })
    },
  })
  const message = {
    key: 'same-message',
    recipient: 'test@example.com',
    type: 'test',
    subject: 'Testmelding',
    text: 'Ingen ekte ekstern sending i testen.',
  }
  await Promise.all([mail.send(message), mail.send(message)])
  assert.equal(sends, 1)
  assert.equal(
    (
      await db.sql.query(
        "SELECT count(*)::int AS n FROM ft_admin_deliveries WHERE status='sent'",
      )
    )[0].n,
    1,
  )
  const alert = {
    key: 'cycle-test',
    type: 'operations',
    severity: 'critical',
    title: 'Test av statusendring',
    detail: 'Kun isolert testintegrasjon.',
  }
  await notifications.publish(alert)
  await mail.flush(notifications)
  const afterAlert = sends
  await notifications.publish({ ...alert, resolved: true })
  await mail.flush(notifications)
  assert.equal(sends, afterAlert + 1)
  await notifications.publish(alert)
  await mail.flush(notifications)
  assert.equal(sends, afterAlert + 2)
})

test('publiseringsgodkjenning binder sjekkliste, menneske og innhold til eksakt GitHub-versjon', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const user = (await db.sql.query('SELECT * FROM ft_admin_user'))[0]
  const article = JSON.parse(
    await readFile(
      new URL('../../web/src/analyser/publications.json', import.meta.url),
      'utf8',
    ),
  )[0]
  article.status = 'draft'
  delete article.approval
  delete article.publishedAt
  let head = 'a'.repeat(40),
    approved = 0
  const github = {
    async identity() {
      return { login: 'Lippen1995' }
    },
    async readFile(path) {
      return path === 'editorial/analysis-settings.json'
        ? { content: JSON.stringify({ reviewer: 'Lippen1995' }) }
        : { path, sha: 'b'.repeat(40), content: JSON.stringify(article) }
    },
    async api(path, options) {
      if (path === 'pulls/1')
        return {
          state: 'open',
          head: {
            sha: head,
            ref: 'analysis/weekly-test',
            repo: { full_name: 'Lippen1995/Project_statsbudsjett' },
          },
          base: { ref: 'main' },
          html_url:
            'https://github.com/Lippen1995/Project_statsbudsjett/pull/1',
        }
      if (path === 'pulls/1/files?per_page=100')
        return [{ filename: 'editorial/drafts/test.json', status: 'added' }]
      if (path === 'collaborators/Lippen1995/permission')
        return { permission: 'admin' }
      if (options?.method === 'POST') {
        approved++
        return { id: 1, user: { login: 'Lippen1995' } }
      }
      return []
    },
  }
  const service = editorialService({ sql: db.sql, github }),
    value = { number: 1, head, hash: contentHash(article), confirm: 'GODKJENN' }
  await assert.rejects(service.approve(user, value), /sjekklisten/)
  assert.equal(approved, 0)
  await recordStore(db.sql).write(user, 'checklists', {
    data: {
      article: '1',
      head,
      numbers: true,
      sources: true,
      scope: true,
      title: true,
      conclusion: true,
      images: true,
      note: '',
    },
  })
  head = 'c'.repeat(40)
  await assert.rejects(service.approve(user, value), (e) => e.status === 409)
  assert.equal(approved, 0)
  head = value.head
  await service.approve(user, value)
  assert.equal(approved, 1)
  let requested = 0
  const links = await checkLinks(
    ['https://127.0.0.1/', 'http://fellestall.no/', 'https://www.ssb.no/'],
    async () => {
      requested++
      return new Response(null, { status: 200 })
    },
  )
  assert.equal(requested, 1)
  assert.equal(links.items[0].status, 'Ikke testet')
})

test('invitasjon og passordgjenoppretting gir faktisk redaktørtilgang uten å åpne registrering', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const { createAuth } = await import('../../server/admin/auth.mjs'),
    { accountService } = await import('../../server/admin/accounts.mjs')
  const messages = [],
    auth = createAuth(db.pool, {
      secret: db.secret,
      baseURL: origin,
      sendResetPassword: async (value) => messages.push(value),
    })
  const owner = (await db.sql.query('SELECT * FROM ft_admin_user'))[0],
    login = await auth.handler(
      request('/api/auth/sign-in/email', {
        email: owner.email,
        password: db.password,
      }),
    ),
    headers = new Headers({ cookie: cookieOf(login), origin })
  const service = accountService({ sql: db.sql, auth, mail: { ready: true } })
  const invited = await service.invite(
    owner,
    { email: 'editor@example.com', name: 'Isolert redaktør', role: 'editor' },
    headers,
  )
  assert.equal(invited.user.role, 'editor')
  assert.equal(messages.length, 1)
  const token = new URL(messages[0].url).pathname.split('/').at(-1),
    password = 'Isolert-redaktor-passord!'
  await auth.api.resetPassword({ body: { token, newPassword: password } })
  const signedIn = await auth.handler(
    request('/api/auth/sign-in/email', {
      email: 'editor@example.com',
      password,
    }),
  )
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookieOf(signedIn) }),
  })
  assert.equal(session.user.role, 'editor')
  await assert.rejects(
    auth.api.resetPassword({ body: { token, newPassword: password } }),
  )
  await service.invite(
    owner,
    { email: 'editor@example.com', name: 'Isolert redaktør', role: 'editor' },
    headers,
  )
  assert.equal(messages.length, 2)
  assert.equal(
    (await db.sql.query('SELECT count(*)::int AS n FROM ft_admin_user'))[0].n,
    2,
  )
})

test('produksjonsmigrering retter tidligere Checkly-telling én gang og bevarer resultatene', async (t) => {
  const db = await testDatabase()
  t.after(() => db.engine.close())
  const { migrateAdmin } = await import('../../server/admin/migrations.mjs')
  await db.sql.query('INSERT INTO ft_admin_schema(id,version) VALUES(1,4)')
  for (const [id, runs] of [
    ['initial', 2],
    ['retried', 3],
    ['zero-legacy', 1],
  ])
    await db.sql.query(
      "INSERT INTO ft_admin_checkly_results(id,check_id,check_name,checked_at,runs,failed,degraded) VALUES($1,'check','Test',now(),$2,false,false)",
      [id, runs],
    )
  await db.sql.query(
    "INSERT INTO ft_admin_provider_cache(provider,data) VALUES('checkly','{}'::jsonb)",
  )
  await migrateAdmin(db.pool)
  const rows = await db.sql.query(
    'SELECT id,runs,attempts FROM ft_admin_checkly_results ORDER BY id',
  )
  assert.deepEqual(rows, [
    { id: 'initial', runs: 1, attempts: 1 },
    { id: 'retried', runs: 2, attempts: 2 },
    { id: 'zero-legacy', runs: 1, attempts: 0 },
  ])
  assert.equal(
    (
      await db.sql.query(
        "SELECT * FROM ft_admin_provider_cache WHERE provider='checkly'",
      )
    ).length,
    0,
  )
  await migrateAdmin(db.pool)
  assert.deepEqual(
    await db.sql.query(
      'SELECT id,runs,attempts FROM ft_admin_checkly_results ORDER BY id',
    ),
    rows,
  )
})
