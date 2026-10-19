import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { adminEmail } from './auth.mjs'

// Optional first-deployment initialization. Remove the hash from the runtime
// environment after verification; an existing account is never reset.
export async function bootstrapAdmin(pool, passwordHash) {
  if (!passwordHash) return false
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash)) throw Error('Ugyldig administratorhash')
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize first requests from separate serverless instances before DDL.
    await client.query('SELECT pg_advisory_xact_lock(1179935052, 1835363385)')
    for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await client.query(statement)
    await client.query(`INSERT INTO ft_admin_user(id, name, email, "emailVerified")
      VALUES ($1, 'Fjord Insight', $2, true) ON CONFLICT (email) DO NOTHING`, [randomUUID(), adminEmail])
    await client.query(`INSERT INTO ft_admin_account(id, "accountId", "providerId", "userId", password)
      SELECT $1, id, 'credential', id, $3 FROM ft_admin_user WHERE email = $2
      ON CONFLICT ("providerId", "accountId") DO NOTHING`, [randomUUID(), adminEmail, passwordHash])
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
