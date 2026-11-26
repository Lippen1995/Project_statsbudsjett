import { readFile } from 'node:fs/promises'

export const customerSchemaVersion = 1

export async function migrateCustomers(pool) {
  const client = await pool.connect()
  try {
    try {
      const current = await client.query('SELECT version FROM ft_customer_schema WHERE id=1')
      if (current.rows[0]?.version >= customerSchemaVersion) return
    } catch (error) { if (error.code !== '42P01') throw error }
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1179935052, 1129665364)')
    await client.query('CREATE TABLE IF NOT EXISTS ft_customer_schema (id integer PRIMARY KEY CHECK (id=1), version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
    const current = await client.query('SELECT version FROM ft_customer_schema WHERE id=1')
    if (!(current.rows[0]?.version >= customerSchemaVersion)) {
      const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
      for (const statement of schema.split(';').map(value=>value.trim()).filter(Boolean)) await client.query(statement)
      await client.query('INSERT INTO ft_customer_schema(id,version) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()', [customerSchemaVersion])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
