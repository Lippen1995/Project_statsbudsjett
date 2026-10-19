import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { hashPassword } from 'better-auth/crypto'
import { bootstrapAdmin } from '../../server/admin/bootstrap.mjs'
import { createAuth, adminEmail } from '../../server/admin/auth.mjs'

test('første oppstart lager konto atomisk, beholder eksisterende passord og rører ikke datagrunnlaget', async t => {
  const engine = new PGlite()
  t.after(() => engine.close())
  await engine.exec('CREATE TABLE snapshot_fixture(id integer PRIMARY KEY); INSERT INTO snapshot_fixture VALUES (1)')
  let releases = 0
  const client = { query: (text, values) => engine.query(text, values), release() { releases++ } }
  const pool = { query: client.query, connect: async () => client, end: async () => {} }
  assert.equal(await bootstrapAdmin(pool, ''), false)
  await assert.rejects(bootstrapAdmin(pool, 'ugyldig'), /Ugyldig/)
  assert.equal(releases, 0)
  const password = randomBytes(16).toString('hex')
  const first = await hashPassword(password)
  assert.equal(await bootstrapAdmin(pool, first), true)
  await bootstrapAdmin(pool, await hashPassword(randomBytes(16).toString('hex')))
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM ft_admin_user')).rows[0].n, 1)
  assert.equal((await engine.query('SELECT password FROM ft_admin_account')).rows[0].password, first)
  assert.deepEqual((await engine.query('SELECT * FROM snapshot_fixture')).rows, [{ id: 1 }])
  const auth = createAuth(pool, { secret: randomBytes(32).toString('hex'), baseURL: 'http://localhost:5173' })
  const login = await auth.handler(new Request('http://localhost:5173/api/auth/sign-in/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ email: adminEmail, password }),
  }))
  assert.equal(login.status, 200, await login.clone().text())
  assert.ok(login.headers.getSetCookie().some(c => /httponly/i.test(c)))
})

test('mislykket førstegangsoppsett ruller tilbake hele skjemaet og frigir forbindelsen', async t => {
  const engine = new PGlite(); t.after(() => engine.close())
  let released = false
  const client = {
    async query(text, values) {
      if (text.includes('INSERT INTO ft_admin_account')) throw Error('simulert kontofeil')
      return engine.query(text, values)
    },
    release() { released = true },
  }
  await assert.rejects(bootstrapAdmin({ connect: async () => client }, await hashPassword(randomBytes(16).toString('hex'))), /simulert kontofeil/)
  assert.equal(released, true)
  assert.equal((await engine.query("SELECT to_regclass('public.ft_admin_user') AS table_name")).rows[0].table_name, null)
})
