import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { migrateAdmin, adminSchemaVersion } from '../../server/admin/migrations.mjs'
import { ingest, liveMetrics, metrics } from '../../server/admin/telemetry.mjs'
import { testDatabase } from './test-support.mjs'

test('live-målinger avgrenser 15 minutter, vekter målinger og endrer ikke historiske totaler', async t => {
  const db = await testDatabase(); t.after(() => db.engine.close())
  const empty = await liveMetrics(db.sql)
  assert.equal(empty.totals.lcp, null)
  assert.equal(empty.totals.views, 0)
  assert.equal(empty.totals.latest_sample_at, null)
  const event = { path: '/', source: 'direkte', device: 'mobile' }
  await ingest(db.sql, { ...event, type: 'view' }, 'isolated-client', db.secret)
  await ingest(db.sql, { ...event, type: 'lcp', value: 1200 }, 'isolated-client', db.secret)
  await ingest(db.sql, { ...event, device: 'desktop', type: 'lcp', value: 1800 }, 'isolated-client', db.secret)
  await db.sql.query(`INSERT INTO ft_admin_minute(minute, device, views, lcp_sum, lcp_count)
    VALUES (date_trunc('minute', now()) - interval '20 minutes', 'desktop', 30, 90000, 1)`)
  const live = await liveMetrics(db.sql)
  assert.equal(live.windowMinutes, 15)
  assert.equal(live.totals.views, 1)
  assert.equal(live.totals.lcp, 1500)
  assert.equal(live.totals.lcp_count, 2)
  assert.equal(live.totals.inp, null)
  assert.ok(live.totals.latest_sample_at)
  assert.equal(live.series.length, 1)
  assert.equal((await metrics(db.sql, 7)).totals.views, 1)
  assert.equal((await metrics(db.sql, 7)).totals.lcp, 1500)
  await db.sql.query(`INSERT INTO ft_admin_minute(minute, device) VALUES (now() - interval '25 hours', 'desktop')`)
  await ingest(db.sql, { ...event, type: 'view' }, 'isolated-client', db.secret)
  assert.equal((await db.sql.query("SELECT count(*)::int AS n FROM ft_admin_minute WHERE minute < now() - interval '24 hours'"))[0].n, 0)
})

test('nye tabeller migreres uten bootstrap-passord, bevarer data og migreres bare én gang', async t => {
  const engine = new PGlite(); t.after(() => engine.close())
  const schema = await readFile(new URL('../../server/admin/schema.sql', import.meta.url), 'utf8')
  await engine.exec(schema.split('CREATE TABLE IF NOT EXISTS ft_admin_schema')[0])
  await engine.query(`INSERT INTO ft_admin_user(id, name, email) VALUES ('existing', 'Existing admin', 'existing@example.com')`)
  await engine.query(`INSERT INTO ft_admin_daily(day, path, source, device, views) VALUES (CURRENT_DATE, '/', 'direkte', 'mobile', 12)`)
  let migrations = 0
  const client = { async query(text, values) { if (text.includes('CREATE TABLE IF NOT EXISTS ft_admin_minute')) migrations++; return engine.query(text, values) }, release() {} }
  const pool = { connect: async () => client }
  await migrateAdmin(pool); await migrateAdmin(pool)
  assert.equal(migrations, 1)
  assert.equal((await engine.query('SELECT version FROM ft_admin_schema')).rows[0].version, adminSchemaVersion)
  assert.equal((await engine.query('SELECT views FROM ft_admin_daily')).rows[0].views, 12)
  assert.equal((await engine.query('SELECT id FROM ft_admin_user')).rows[0].id, 'existing')
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM ft_admin_minute')).rows[0].n, 0)
})
