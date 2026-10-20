import { readFile } from 'node:fs/promises'

export const adminSchemaVersion = 4

// Independent of the removed account-bootstrap secret. Existing installations
// receive additive schema changes once, serialized across cold starts.
export async function migrateAdmin(pool) {
  const client = await pool.connect()
  try {
    try {
      const ready = await client.query('SELECT version FROM ft_admin_schema WHERE id = 1')
      if ((ready.rows[0]?.version || 0) >= adminSchemaVersion) return
    } catch (error) { if (error.code !== '42P01') throw error }
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1179935052, 1835363385)')
    await client.query('CREATE TABLE IF NOT EXISTS ft_admin_schema (id integer PRIMARY KEY CHECK (id = 1), version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
    const current = await client.query('SELECT version FROM ft_admin_schema WHERE id = 1')
    if ((current.rows[0]?.version || 0) < adminSchemaVersion) {
      const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
      for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await client.query(statement)
      await client.query('INSERT INTO ft_admin_schema(id, version) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now()', [adminSchemaVersion])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
