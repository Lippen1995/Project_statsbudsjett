import { createHmac } from 'node:crypto'

export function telemetryEvent(value) {
  if (!value || typeof value.path !== 'string' || value.path.length > 180 ||
      !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*\/?$/.test(value.path) || /^\/(admin|api)(\/|$)/.test(value.path) ||
      !['mobile', 'desktop'].includes(value.device) || !['view', 'lcp', 'inp', 'cls'].includes(value.type)) return null
  const source = typeof value.source === 'string' && /^[a-z0-9.-]{1,100}$/.test(value.source) ? value.source : 'direkte'
  if (value.type !== 'view' && (!Number.isFinite(value.value) || value.value < 0 || value.value > (value.type === 'cls' ? 10 : 120000))) return null
  return { path: value.path, device: value.device, source, type: value.type, value: value.value ?? 0 }
}

export async function ingest(sql, event, ip, secret, now = Date.now()) {
  // Kortlivet HMAC brukes bare til misbruksbegrensning, aldri besøksstatistikk.
  const key = createHmac('sha256', secret).update(`${Math.floor(now / 60000)}:${ip}`).digest('hex')
  const limit = await sql.query(`INSERT INTO ft_admin_ingest_limit(key, expires_at) VALUES ($1, now() + interval '2 minutes')
    ON CONFLICT (key) DO UPDATE SET count = ft_admin_ingest_limit.count + 1 RETURNING count`, [key])
  if (limit[0].count > 60) return false
  const metric = event.type === 'view' ? 'views' : `${event.type}_sum`
  const countColumn = event.type === 'view' ? '' : `, ${event.type}_count`
  await sql.query(`INSERT INTO ft_admin_daily(day, path, source, device, ${metric}${countColumn})
    VALUES (CURRENT_DATE, $1, $2, $3, $4${event.type === 'view' ? '' : ', 1'})
    ON CONFLICT (day, path, source, device) DO UPDATE SET ${metric} = ft_admin_daily.${metric} + EXCLUDED.${metric}
    ${event.type === 'view' ? '' : `, ${event.type}_count = ft_admin_daily.${event.type}_count + 1`}`,
  [event.path, event.source, event.device, event.type === 'view' ? 1 : event.value])
  await sql.query(`DELETE FROM ft_admin_ingest_limit WHERE expires_at < now()`)
  await sql.query(`DELETE FROM ft_admin_daily WHERE day < CURRENT_DATE - 90`)
  return true
}

export async function metrics(sql, days) {
  const rows = await sql.query(`SELECT day::text, sum(views)::int AS views,
    sum(lcp_sum) / NULLIF(sum(lcp_count), 0) AS lcp, sum(lcp_count)::int AS lcp_count,
    sum(inp_sum) / NULLIF(sum(inp_count), 0) AS inp, sum(inp_count)::int AS inp_count,
    sum(cls_sum) / NULLIF(sum(cls_count), 0) AS cls, sum(cls_count)::int AS cls_count
    FROM ft_admin_daily WHERE day >= CURRENT_DATE - ($1::int - 1) GROUP BY day ORDER BY day`, [days])
  const totals = await sql.query(`SELECT sum(views)::int AS views, sum(lcp_sum) / NULLIF(sum(lcp_count), 0) AS lcp,
    sum(lcp_count)::int AS lcp_count, sum(inp_sum) / NULLIF(sum(inp_count), 0) AS inp, sum(inp_count)::int AS inp_count,
    sum(cls_sum) / NULLIF(sum(cls_count), 0) AS cls, sum(cls_count)::int AS cls_count
    FROM ft_admin_daily WHERE day >= CURRENT_DATE - ($1::int - 1)`, [days])
  const breakdown = async column => sql.query(`SELECT ${column} AS label, sum(views)::int AS views FROM ft_admin_daily
    WHERE day >= CURRENT_DATE - ($1::int - 1) GROUP BY ${column} HAVING sum(views) > 0 ORDER BY views DESC LIMIT 20`, [days])
  const [pages, sources, devices] = await Promise.all(['path', 'source', 'device'].map(breakdown))
  return { days, daily: rows, totals: totals[0], pages, sources, devices }
}
