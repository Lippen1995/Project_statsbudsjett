import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { hashPassword } from 'better-auth/crypto'
import { createAuth, adminEmail } from '../../server/admin/auth.mjs'

export async function testDatabase() {
  const engine = new PGlite()
  await engine.exec(await readFile(new URL('../../server/admin/schema.sql', import.meta.url), 'utf8'))
  const client = {
    async query(text, values) {
      const result = await engine.query(text, values)
      return { ...result, rowCount: result.affectedRows ?? result.rows.length, command: text.trim().split(/\s/)[0].toUpperCase() }
    },
    release() {},
  }
  const pool = { connect: async () => client, query: client.query, end: async () => {} }
  const sql = { query: async (text, values) => (await client.query(text, values)).rows }
  const secret = randomBytes(32).toString('hex')
  const auth = createAuth(pool, { secret, baseURL: 'http://localhost:5173' })
  const password = randomBytes(16).toString('hex')
  const userId = randomUUID()
  await sql.query('INSERT INTO ft_admin_user(id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [userId, 'Testadmin', adminEmail])
  await sql.query('INSERT INTO ft_admin_account(id, "accountId", "providerId", "userId", password) VALUES ($1, $2, $3, $2, $4)', [randomUUID(), userId, 'credential', await hashPassword(password)])
  return { engine, sql, auth, secret, password }
}
