import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { getSql } from '../neon/postgres.mjs'
import { adminEmail } from '../../server/admin/auth.mjs'

// Passordhash via stdin eller hemmelig servervariabel. Ingen passord i argumenter eller logg.
const input = []
if (!process.stdin.isTTY && !process.env.FELLESTALL_ADMIN_PASSWORD_HASH) {
  for await (const chunk of process.stdin) input.push(chunk)
}
let passwordHash = process.env.FELLESTALL_ADMIN_PASSWORD_HASH
if (!passwordHash && input.length) {
  const password = Buffer.concat(input).toString('utf8').trimEnd()
  if (password.length < 12) throw Error('Passordet må ha minst 12 tegn')
  passwordHash = await hashPassword(password)
}
if (!passwordHash) throw Error('Tilfør startpassord via stdin eller FELLESTALL_ADMIN_PASSWORD_HASH')
if (!/^[a-f0-9]+:[a-f0-9]+$/i.test(passwordHash)) throw Error('Ugyldig Better Auth-passordhash')
const sql = getSql()
const schema = await readFile(new URL('../../server/admin/schema.sql', import.meta.url), 'utf8')
// Versjonert og idempotent skjema; ingen eksisterende analyse- eller datatabeller endres.
for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await sql.query(statement)
const id = randomUUID()
await sql.transaction([
  sql.query(`INSERT INTO ft_admin_user(id, name, email, "emailVerified") VALUES ($1, 'Fjord Insight', $2, true) ON CONFLICT (email) DO NOTHING`, [id, adminEmail]),
  sql.query(`INSERT INTO ft_admin_account(id, "accountId", "providerId", "userId", password)
    SELECT $1, id, 'credential', id, $3 FROM ft_admin_user WHERE email = $2
    ON CONFLICT ("providerId", "accountId") DO NOTHING`, [randomUUID(), adminEmail, passwordHash]),
])
console.log('Administratorskjema og konto er klargjort. Eksisterende passord er beholdt.')
