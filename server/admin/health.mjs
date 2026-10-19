import { randomUUID } from 'node:crypto'
import { adminEmail } from './auth.mjs'

const labels = { website: 'Fellestall.no', database: 'Database og innlogging', sven: 'Svens arbeidsgrunnlag' }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export function createHealthMonitor({ sql, github, origin, fetcher = fetch, alertsEnabled = process.env.FELLESTALL_STATUS_ALERTS_ENABLED === 'true' }) {
  let running
  async function probe(id, callback) {
    const start = performance.now()
    try {
      const detail = await callback()
      const latency_ms = Math.round(performance.now() - start)
      const status = detail?.degraded || latency_ms > 2500 ? 'degraded' : 'operational'
      return { id, name: labels[id], status, latency_ms, message: detail?.message || (status === 'degraded' ? 'Tjenesten svarer langsomt.' : 'Tjenesten svarer normalt.') }
    } catch {
      return { id, name: labels[id], status: 'outage', latency_ms: Math.round(performance.now() - start), message: 'Kontrollen kunne ikke fullføres.' }
    }
  }
  async function checkOnce() {
    await sql.query('INSERT INTO ft_admin_health_state(id) VALUES (1) ON CONFLICT DO NOTHING')
    const [existing] = await sql.query('SELECT report, checked_at FROM ft_admin_health_state WHERE id = 1')
    if (existing?.report && Date.now() - new Date(existing.checked_at).getTime() < 45000) return existing.report
    const owner = randomUUID()
    const lease = await sql.query(`UPDATE ft_admin_health_state SET lease_owner = $1, lease_until = now() + interval '15 seconds'
      WHERE id = 1 AND (lease_until IS NULL OR lease_until < now())
      AND (checked_at IS NULL OR checked_at < now() - interval '45 seconds') RETURNING report`, [owner])
    if (!lease.length) {
      if (existing?.report) return existing.report
      for (let i = 0; i < 20; i++) {
        await wait(250)
        const [finished] = await sql.query('SELECT report FROM ft_admin_health_state WHERE id = 1')
        if (finished?.report) return finished.report
      }
      throw Error('Statuskontrollen starter. Prøv igjen om et øyeblikk.')
    }
    const components = await Promise.all([
      probe('website', async () => {
        const response = await fetcher(origin + '/', { signal: AbortSignal.timeout(4000), cache: 'no-store' })
        if (!response.ok || !(await response.text()).includes('Fellestall')) throw Error('Ugyldig nettsvar')
      }),
      probe('database', () => sql.query('SELECT 1')),
      probe('sven', async () => {
        const result = await github.checkHealth()
        if (!result.writable) return { degraded: true, message: 'Arbeidsfilene kan leses, men lagring er ikke tilgjengelig.' }
      }),
    ])
    const status = components.some(c => c.status === 'outage') ? 'outage' : components.some(c => c.status === 'degraded') ? 'degraded' : 'operational'
    const report = { status, checkedAt: new Date().toISOString(), components, signature: components.map(c => c.id + ':' + c.status).join('|') }
    const old = lease[0].report
    const eventStatus = status === 'operational' ? 'resolved' : old && old.status !== 'operational' ? 'updated' : 'detected'
    const summary = status === 'operational' ? 'Alle tjenester er tilbake i normal drift.' : components.filter(c => c.status !== 'operational').map(c => c.name).join(' og ') + (status === 'degraded' ? ' har nedsatt ytelse.' : ' har et driftsavvik.')
    const [stored] = await sql.query(`WITH previous AS (
      SELECT report FROM ft_admin_health_state WHERE id = 1 AND lease_owner = $1 FOR UPDATE
    ), updated AS (
      UPDATE ft_admin_health_state SET report = $2::jsonb, checked_at = now(), lease_owner = NULL, lease_until = NULL
      WHERE id = 1 AND lease_owner = $1 AND EXISTS (SELECT 1 FROM previous) RETURNING report
    ), event AS (
      INSERT INTO ft_admin_health_events(id, status, summary, components)
      SELECT $3, $4, $5, $2::jsonb->'components' FROM previous
      WHERE (report IS NOT NULL AND report->>'signature' IS DISTINCT FROM $2::jsonb->>'signature')
        OR (report IS NULL AND $2::jsonb->>'status' <> 'operational') RETURNING id
    ), samples AS (
      INSERT INTO ft_admin_health_samples(minute, service, checks, operational)
      SELECT date_trunc('minute', now()), c.id, 1, CASE WHEN c.status = 'operational' THEN 1 ELSE 0 END
      FROM updated, jsonb_to_recordset($2::jsonb->'components') AS c(id text, status text)
      ON CONFLICT (minute, service) DO UPDATE SET checks = ft_admin_health_samples.checks + 1,
        operational = ft_admin_health_samples.operational + EXCLUDED.operational RETURNING service
    ) SELECT report FROM updated`, [owner, JSON.stringify(report), randomUUID(), eventStatus, summary])
    await sql.query("DELETE FROM ft_admin_health_samples WHERE minute < now() - interval '90 days'")
    await sql.query("DELETE FROM ft_admin_health_events WHERE created_at < now() - interval '90 days'")
    return stored?.report || (await sql.query('SELECT report FROM ft_admin_health_state WHERE id = 1'))[0].report
  }
  function check() {
    running ||= checkOnce().finally(() => { running = null })
    return running
  }
  return {
    check,
    async dashboard() {
      const report = await check()
      const [history, incidents] = await Promise.all([
        sql.query(`SELECT (minute AT TIME ZONE 'Europe/Oslo')::date::text AS day,
          sum(checks)::int AS checks, sum(operational)::int AS operational
          FROM ft_admin_health_samples WHERE minute >= now() - interval '30 days' GROUP BY day ORDER BY day`),
        sql.query('SELECT id, created_at, status, summary, components FROM ft_admin_health_events ORDER BY created_at DESC LIMIT 30'),
      ])
      return { ...report, history, incidents, notifications: { enabled: alertsEnabled, recipient: adminEmail }, externalMonitoring: alertsEnabled }
    },
  }
}
