import { createHmac } from 'node:crypto'

export function telemetryEvent(value) {
  if (
    !value ||
    typeof value.path !== 'string' ||
    value.path.length > 180 ||
    !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*\/?$/.test(value.path) ||
    /^\/(admin|api)(\/|$)/.test(value.path) ||
    !['mobile', 'desktop'].includes(value.device) ||
    !['view', 'lcp', 'inp', 'cls', 'feature', 'error'].includes(value.type)
  )
    return null
  const source =
    typeof value.source === 'string' && /^[a-z0-9.-]{1,100}$/.test(value.source)
      ? value.source
      : 'direkte'
  if (
    ['lcp', 'inp', 'cls'].includes(value.type) &&
    (!Number.isFinite(value.value) ||
      value.value < 0 ||
      value.value > (value.type === 'cls' ? 10 : 120000))
  )
    return null
  if (
    value.type === 'feature' &&
    ![
      'filter',
      'compare',
      'share',
      'download',
      'search',
      'chart',
      '404',
    ].includes(value.feature)
  )
    return null
  if (
    value.type === 'error' &&
    ![
      'TypeError',
      'ReferenceError',
      'SyntaxError',
      'RangeError',
      'Error',
      'unhandled-rejection',
      'api-error',
    ].includes(value.errorCode)
  )
    return null
  const release = /^[a-f0-9]{7,64}$/.test(value.release || '')
    ? value.release
    : 'ukjent'
  return {
    path: value.path,
    device: value.device,
    source,
    type: value.type,
    value: value.value ?? 0,
    ...(value.type === 'feature' ? { feature: value.feature } : {}),
    ...(value.type === 'error' ? { errorCode: value.errorCode } : {}),
    release,
  }
}

export async function ingest(sql, event, ip, secret, now = Date.now()) {
  // Kortlivet HMAC brukes bare til misbruksbegrensning, aldri besøksstatistikk.
  const key = createHmac('sha256', secret)
    .update(`${Math.floor(now / 60000)}:${ip}`)
    .digest('hex')
  const limit = await sql.query(
    `INSERT INTO ft_admin_ingest_limit(key, expires_at) VALUES ($1, now() + interval '2 minutes')
    ON CONFLICT (key) DO UPDATE SET count = ft_admin_ingest_limit.count + 1 RETURNING count`,
    [key],
  )
  if (limit[0].count > 60) return false
  if (event.type === 'feature') {
    await sql.query(
      `INSERT INTO ft_admin_feature_daily(day,path,feature,device,source) VALUES(CURRENT_DATE,$1,$2,$3,$4)
      ON CONFLICT(day,path,feature,device,source) DO UPDATE SET counts=ft_admin_feature_daily.counts+1`,
      [event.path, event.feature, event.device, event.source],
    )
    return true
  }
  if (event.type === 'error') {
    await sql.query(
      `INSERT INTO ft_admin_errors(day,path,kind,detail) VALUES(CURRENT_DATE,$1,'browser',$2)
      ON CONFLICT(day,path,kind,detail) DO UPDATE SET counts=ft_admin_errors.counts+1,last_seen_at=now()`,
      [event.path, event.errorCode],
    )
    return true
  }
  const metric = event.type === 'view' ? 'views' : `${event.type}_sum`
  const countColumn = event.type === 'view' ? '' : `, ${event.type}_count`
  await sql.query(
    `INSERT INTO ft_admin_daily(day, path, source, device, ${metric}${countColumn})
    VALUES (CURRENT_DATE, $1, $2, $3, $4${event.type === 'view' ? '' : ', 1'})
    ON CONFLICT (day, path, source, device) DO UPDATE SET ${metric} = ft_admin_daily.${metric} + EXCLUDED.${metric}
    ${event.type === 'view' ? '' : `, ${event.type}_count = ft_admin_daily.${event.type}_count + 1`}`,
    [
      event.path,
      event.source,
      event.device,
      event.type === 'view' ? 1 : event.value,
    ],
  )
  await sql.query(
    `INSERT INTO ft_admin_minute(minute, device, ${metric}${countColumn})
    VALUES (date_trunc('minute', now()), $1, $2${event.type === 'view' ? '' : ', 1'})
    ON CONFLICT (minute, device) DO UPDATE SET ${metric} = ft_admin_minute.${metric} + EXCLUDED.${metric},
    last_seen_at = now() ${event.type === 'view' ? '' : `, ${event.type}_count = ft_admin_minute.${event.type}_count + 1`}`,
    [event.device, event.type === 'view' ? 1 : event.value],
  )
  if (event.type !== 'view') {
    const resolution =
      event.type === 'cls' ? 0.005 : event.type === 'inp' ? 10 : 50
    const bucket = Math.floor(event.value / resolution)
    await sql.query(
      `INSERT INTO ft_admin_metric_buckets(day,path,device,metric,bucket,release)
      VALUES(CURRENT_DATE,$1,$2,$3,$4,$5) ON CONFLICT(day,path,device,metric,bucket,release)
      DO UPDATE SET samples=ft_admin_metric_buckets.samples+1`,
      [event.path, event.device, event.type, bucket, event.release || 'ukjent'],
    )
  }
  await sql.query(`DELETE FROM ft_admin_ingest_limit WHERE expires_at < now()`)
  await sql.query(`DELETE FROM ft_admin_daily WHERE day < CURRENT_DATE - 90`)
  await sql.query(
    `DELETE FROM ft_admin_minute WHERE minute < now() - interval '24 hours'`,
  )
  await sql.query(
    `DELETE FROM ft_admin_metric_buckets WHERE day < CURRENT_DATE - 90`,
  )
  await sql.query(
    `DELETE FROM ft_admin_feature_daily WHERE day < CURRENT_DATE - 90`,
  )
  await sql.query(`DELETE FROM ft_admin_errors WHERE day < CURRENT_DATE - 90`)
  return true
}

export async function liveMetrics(sql) {
  const [totals] =
    await sql.query(`SELECT COALESCE(sum(views), 0)::int AS views,
    sum(lcp_sum) / NULLIF(sum(lcp_count), 0) AS lcp, COALESCE(sum(lcp_count), 0)::int AS lcp_count,
    sum(inp_sum) / NULLIF(sum(inp_count), 0) AS inp, COALESCE(sum(inp_count), 0)::int AS inp_count,
    sum(cls_sum) / NULLIF(sum(cls_count), 0) AS cls, COALESCE(sum(cls_count), 0)::int AS cls_count,
    max(last_seen_at) AS latest_sample_at
    FROM ft_admin_minute WHERE minute >= date_trunc('minute', now()) - interval '14 minutes'`)
  const series =
    await sql.query(`SELECT minute, sum(views)::int AS views FROM ft_admin_minute
    WHERE minute >= date_trunc('minute', now()) - interval '14 minutes' GROUP BY minute ORDER BY minute`)
  return {
    checkedAt: new Date().toISOString(),
    windowMinutes: 15,
    totals,
    series,
  }
}

export async function metrics(sql, days) {
  const rows = await sql.query(
    `SELECT day::text, sum(views)::int AS views,
    sum(lcp_sum) / NULLIF(sum(lcp_count), 0) AS lcp, sum(lcp_count)::int AS lcp_count,
    sum(inp_sum) / NULLIF(sum(inp_count), 0) AS inp, sum(inp_count)::int AS inp_count,
    sum(cls_sum) / NULLIF(sum(cls_count), 0) AS cls, sum(cls_count)::int AS cls_count
    FROM ft_admin_daily WHERE day >= CURRENT_DATE - ($1::int - 1) GROUP BY day ORDER BY day`,
    [days],
  )
  const totals = await sql.query(
    `SELECT sum(views)::int AS views, sum(lcp_sum) / NULLIF(sum(lcp_count), 0) AS lcp,
    sum(lcp_count)::int AS lcp_count, sum(inp_sum) / NULLIF(sum(inp_count), 0) AS inp, sum(inp_count)::int AS inp_count,
    sum(cls_sum) / NULLIF(sum(cls_count), 0) AS cls, sum(cls_count)::int AS cls_count
    FROM ft_admin_daily WHERE day >= CURRENT_DATE - ($1::int - 1)`,
    [days],
  )
  const breakdown = async (column) =>
    sql.query(
      `SELECT ${column} AS label, sum(views)::int AS views FROM ft_admin_daily
    WHERE day >= CURRENT_DATE - ($1::int - 1) GROUP BY ${column} HAVING sum(views) > 0 ORDER BY views DESC LIMIT 20`,
      [days],
    )
  const [pages, sources, devices] = await Promise.all(
    ['path', 'source', 'device'].map(breakdown),
  )
  return { days, daily: rows, totals: totals[0], pages, sources, devices }
}
