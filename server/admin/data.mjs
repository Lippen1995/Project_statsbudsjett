import { readFile } from 'node:fs/promises'
import { audit, fail, requireRole, text } from './core.mjs'

let packaged
export async function loadDataCatalog() {
  if (!packaged) {
    try {
      packaged = JSON.parse(
        await readFile(new URL('./data-catalog.json', import.meta.url), 'utf8'),
      )
    } catch (error) {
      if (error.code !== 'ENOENT' || process.env.VERCEL) throw error
      const { buildDataCatalog } = await import(
        '../../scripts/admin/data-catalog.mjs'
      )
      packaged = await buildDataCatalog(
        new URL('../../web/public/data', import.meta.url).pathname,
      )
    }
  }
  return packaged
}
export function dataService({ sql, github, catalog = loadDataCatalog }) {
  async function snapshots() {
    try {
      const rows =
        await sql.query(`SELECT s.id,s.source_commit,s.file_count,s.total_bytes::text,s.state,s.created_at,
        (a.snapshot_id=s.id) IS TRUE AS active FROM fellestall_data.snapshot s
        LEFT JOIN fellestall_data.active_snapshot a ON a.slot='production' ORDER BY s.created_at DESC LIMIT 40`)
      return { available: true, rows }
    } catch (error) {
      if (!['42P01', '3F000'].includes(error.code)) throw error
      return {
        available: false,
        rows: [],
        reason: 'Dataversjonsregisteret er ikke tilgjengelig i dette miljøet.',
      }
    }
  }
  return {
    snapshots,
    async overview() {
      const [data, versions, policies, holds] = await Promise.all([
        catalog(),
        snapshots(),
        sql.query(
          "SELECT id,revision,data FROM ft_admin_records WHERE collection='sourcePolicies'",
        ),
        sql.query(
          "SELECT resource,after_value,created_at FROM ft_admin_audit WHERE action IN ('hold-data','release-data') ORDER BY created_at DESC LIMIT 20",
        ),
      ])
      const [gate] = await sql.query(
        "SELECT data FROM ft_admin_records WHERE collection='preferences' AND id='data-release-gate'",
      )
      return {
        ...data,
        snapshots: versions,
        policies,
        holds,
        gate: gate?.data || null,
      }
    },
    async compare(id) {
      if (!/^[a-f0-9]{64}$/.test(id)) fail('Ugyldig dataversjon.')
      const [old] = await sql.query(
        "SELECT manifest FROM fellestall_data.snapshot WHERE id=$1 AND state='verified'",
        [id],
      )
      if (!old)
        fail('Dataversjonen finnes ikke eller er ikke kontrollert.', 404)
      const current = await catalog(),
        source = new Map(old.manifest.map((f) => [f.path, f]))
      const changes = current.files
        .filter((f) => source.get(f.path)?.sha256 !== f.hash)
        .map((f) => ({
          path: f.path,
          change: source.has(f.path) ? 'changed' : 'added',
          bytes: f.bytes,
        }))
      for (const f of old.manifest)
        if (!current.files.some((n) => n.path === f.path))
          changes.push({ path: f.path, change: 'removed', bytes: f.bytes })
      return { version: id, current: current.manifestHash, changes }
    },
    async hold(user, value) {
      requireRole(user)
      const [current] = await sql.query(
        "SELECT snapshot_id FROM fellestall_data.active_snapshot WHERE slot='production'",
      )
      const held = Boolean(value.held),
        reason = text(value.reason, 5, 1000)
      await sql.query(
        `INSERT INTO ft_admin_records(collection,id,data,created_by,updated_by) VALUES ('preferences','data-release-gate',$1::jsonb,$2,$2)
        ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data,revision=nextval('ft_admin_revision_seq'),updated_at=now(),updated_by=$2`,
        [
          JSON.stringify({
            held,
            reason,
            at: new Date().toISOString(),
            activeSnapshot: current?.snapshot_id,
          }),
          user.id,
        ],
      )
      await audit(
        sql,
        user,
        held ? 'hold-data' : 'release-data',
        'data/production',
        null,
        { held, reason },
      )
      return { held }
    },
    async restore(user, value) {
      requireRole(user)
      if (
        !/^[a-f0-9]{64}$/.test(value.snapshot || '') ||
        !/^[a-f0-9]{64}$/.test(value.expected || '')
      )
        fail('Velg en kontrollert dataversjon og gjeldende versjon.')
      if (value.confirm !== 'GJENOPPRETT')
        fail('Skriv GJENOPPRETT for å bekrefte tilbakeføringen.')
      const [target] = await sql.query(
        'SELECT id,state FROM fellestall_data.snapshot WHERE id=$1',
        [value.snapshot],
      )
      const [active] = await sql.query(
        "SELECT snapshot_id FROM fellestall_data.active_snapshot WHERE slot='production'",
      )
      if (
        target?.state !== 'verified' ||
        active?.snapshot_id !== value.expected
      )
        fail(
          'Dataversjonen er endret eller ikke kontrollert. Hent siste versjon.',
          409,
        )
      const reason = text(value.reason, 5, 1000)
      const result = await github.dispatch('deploy.yml', {
        data_source: 'snapshot',
        data_snapshot: value.snapshot,
        expected_snapshot: value.expected,
      })
      await audit(
        sql,
        user,
        'restore-data-request',
        'data/' + value.snapshot,
        { active: value.expected },
        { reason, ...result },
      )
      return { requested: true, ...result }
    },
  }
}
