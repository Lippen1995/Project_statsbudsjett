import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import { audit, fail, requireRole, text } from './core.mjs'

export function backupService({
  sql,
  pool,
  secret = process.env.BETTER_AUTH_SECRET,
}) {
  const key = () =>
    createHash('sha256')
      .update('fellestall-admin-backups:' + secret)
      .digest()
  const checksum = (data) => createHash('sha256').update(data).digest('hex')
  function encrypt(data) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key(), iv),
      bytes = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64')
  }
  function decrypt(data) {
    try {
      const bytes = Buffer.from(data, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
      cipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString('utf8')
    } catch {
      fail('Sikkerhetskopien kunne ikke åpnes med prosjektets nøkkel.', 409)
    }
  }
  async function read(id) {
    const [row] = await sql.query(
      'SELECT * FROM ft_admin_backups WHERE id=$1',
      [text(id, 1, 100)],
    )
    if (!row) fail('Sikkerhetskopien finnes ikke.', 404)
    const plaintext = decrypt(row.ciphertext)
    if (checksum(plaintext) !== row.checksum)
      fail('Sikkerhetskopiens kontrollsum stemmer ikke.', 409)
    const value = JSON.parse(plaintext)
    if (
      value.version !== 1 ||
      !Array.isArray(value.records) ||
      value.records.length > 10000
    )
      fail('Ugyldig sikkerhetskopi.')
    return { row, value }
  }
  return {
    async import(user, input) {
      requireRole(user)
      const value = input.backup
      if (
        value?.version !== 1 ||
        typeof value.ciphertext !== 'string' ||
        value.ciphertext.length > 2800000 ||
        !/^[a-f0-9]{64}$/.test(value.checksum || '')
      )
        fail('Ugyldig sikkerhetskopifil.')
      const plain = decrypt(value.ciphertext)
      if (checksum(plain) !== value.checksum)
        fail('Kontrollsummen stemmer ikke.', 409)
      const parsed = JSON.parse(plain)
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.records) ||
        parsed.records.length > 10000
      )
        fail('Ugyldig sikkerhetskopi.')
      const id = randomUUID()
      await sql.query(
        'INSERT INTO ft_admin_backups(id,created_by,label,checksum,ciphertext,record_count) VALUES($1,$2,$3,$4,$5,$6)',
        [
          id,
          user.id,
          'Importert: ' + text(value.label, 1, 150),
          value.checksum,
          value.ciphertext,
          parsed.records.length,
        ],
      )
      await audit(sql, user, 'backup-import', 'backups/' + id, null, {
        checksum: value.checksum,
      })
      return { id, imported: true }
    },
    async list(user) {
      requireRole(user)
      return sql.query(
        'SELECT id,label,checksum,record_count,created_at,created_by,tested_at,restored_at FROM ft_admin_backups ORDER BY created_at DESC LIMIT 40',
      )
    },
    async create(user, value) {
      requireRole(user)
      if (!secret) fail('Sikker lagring er ikke konfigurert.', 503)
      const records = await sql.query(
        'SELECT collection,id,revision,data,created_by,updated_by,created_at,updated_at FROM ft_admin_records ORDER BY collection,id',
      )
      if (records.length > 10000)
        fail('Sikkerhetskopien er for stor for dette oppsettet.', 413)
      const payload = JSON.stringify({
          version: 1,
          at: new Date().toISOString(),
          records,
        }),
        id = randomUUID(),
        hash = checksum(payload)
      if (Buffer.byteLength(payload) > 2000000)
        fail('Sikkerhetskopien er for stor for dette oppsettet.', 413)
      await sql.query(
        'INSERT INTO ft_admin_backups(id,created_by,label,checksum,ciphertext,record_count) VALUES($1,$2,$3,$4,$5,$6)',
        [
          id,
          user.id,
          text(value.label, 5, 180),
          hash,
          encrypt(payload),
          records.length,
        ],
      )
      await audit(sql, user, 'backup-create', 'backups/' + id, null, {
        checksum: hash,
        records: records.length,
      })
      return { id, checksum: hash, records: records.length }
    },
    async test(user, id) {
      requireRole(user)
      const { row, value } = await read(id)
      const client = await pool.connect(),
        schema = 'ft_restore_' + randomUUID().replaceAll('-', '')
      try {
        await client.query('BEGIN')
        await client.query(`CREATE SCHEMA "${schema}"`)
        await client.query(
          `CREATE TABLE "${schema}".records (collection text,id text,revision integer,data jsonb,created_by text,updated_by text,created_at timestamptz,updated_at timestamptz,PRIMARY KEY(collection,id))`,
        )
        for (const r of value.records)
          await client.query(
            `INSERT INTO "${schema}".records VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
            [
              r.collection,
              r.id,
              r.revision,
              JSON.stringify(r.data),
              r.created_by,
              r.updated_by,
              r.created_at,
              r.updated_at,
            ],
          )
        const restored = await client.query(
          `SELECT collection,id,revision,data FROM "${schema}".records ORDER BY collection,id`,
        )
        const expected = value.records.map(
          ({ collection, id, revision, data }) => ({
            collection,
            id,
            revision,
            data,
          }),
        )
        // JSONB may normalize object key order; compare canonical JSON recursively.
        const canonical = (v) =>
          Array.isArray(v)
            ? v.map(canonical)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                  Object.entries(v)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, canonical(v)]),
                )
              : v
        if (
          JSON.stringify(canonical(restored.rows)) !==
          JSON.stringify(canonical(expected))
        )
          throw Error('Gjenopprettede data avviker fra sikkerhetskopien.')
        await client.query(`DROP SCHEMA "${schema}" CASCADE`)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      await sql.query(
        'UPDATE ft_admin_backups SET tested_at=now() WHERE id=$1',
        [id],
      )
      await audit(sql, user, 'backup-test', 'backups/' + id, null, {
        records: row.record_count,
        isolated: true,
        verified: true,
      })
      return { verified: true, isolated: true, records: row.record_count }
    },
    async preview(user, id) {
      requireRole(user)
      const { row, value } = await read(id)
      const current = await sql.query(
        'SELECT collection,id,revision FROM ft_admin_records',
      )
      return {
        id,
        checksum: row.checksum,
        records: value.records.map((r) => ({
          collection: r.collection,
          id: r.id,
          backupRevision: r.revision,
          currentRevision:
            current.find((c) => c.collection === r.collection && c.id === r.id)
              ?.revision ?? null,
        })),
        note: 'Kopien omfatter private administratorinnstillinger og registreringer. Kontoer, økter og publiserte analyser endres ikke.',
      }
    },
    async restore(user, value) {
      requireRole(user)
      if (value.confirm !== 'GJENOPPRETT')
        fail('Skriv GJENOPPRETT for å bekrefte.')
      const reason = text(value.reason, 5, 1000)
      const { row, value: backup } = await read(value.id)
      if (value.checksum !== row.checksum || !row.tested_at)
        fail('Kontroller og test sikkerhetskopien før tilbakeføring.', 409)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('LOCK TABLE ft_admin_records IN EXCLUSIVE MODE')
        const current = await client.query(
          'SELECT collection,id,revision FROM ft_admin_records',
        )
        const version = checksum(
          JSON.stringify(
            current.rows.sort((a, b) =>
              (a.collection + '/' + a.id).localeCompare(
                b.collection + '/' + b.id,
              ),
            ),
          ),
        )
        if (value.expectedVersion !== version)
          fail(
            'Administratorinnholdet er endret. Hent en ny forhåndsvisning.',
            409,
          )
        await client.query('DELETE FROM ft_admin_records')
        for (const r of backup.records)
          await client.query(
            "INSERT INTO ft_admin_records(collection,id,revision,data,created_by,updated_by,created_at,updated_at) VALUES($1,$2,nextval('ft_admin_revision_seq'),$3::jsonb,$4,$5,$6,now())",
            [
              r.collection,
              r.id,
              JSON.stringify(r.data),
              r.created_by,
              user.id,
              r.created_at,
            ],
          )
        await client.query(
          'UPDATE ft_admin_backups SET restored_at=now() WHERE id=$1',
          [value.id],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      await audit(sql, user, 'backup-restore', 'backups/' + value.id, null, {
        checksum: row.checksum,
        records: row.record_count,
        reason,
      })
      return { restored: true, records: row.record_count }
    },
    async version() {
      const rows = await sql.query(
        'SELECT collection,id,revision FROM ft_admin_records ORDER BY collection,id',
      )
      return checksum(
        JSON.stringify(
          rows.sort((a, b) =>
            (a.collection + '/' + a.id).localeCompare(
              b.collection + '/' + b.id,
            ),
          ),
        ),
      )
    },
    async download(user, id) {
      requireRole(user)
      const { row } = await read(id)
      return {
        version: 1,
        id: row.id,
        label: row.label,
        checksum: row.checksum,
        ciphertext: row.ciphertext,
        createdAt: row.created_at,
      }
    },
  }
}
