import { metrics } from './telemetry.mjs'
import { fail } from './core.mjs'

export async function insightReport(sql, days = 30, filters = {}) {
  if (![7, 30, 90].includes(days)) fail('Velg 7, 30 eller 90 dager.')
  const path =
      typeof filters.path === 'string' ? filters.path.slice(0, 180) : '',
    device = ['mobile', 'desktop'].includes(filters.device)
      ? filters.device
      : ''
  const [
    current,
    previous,
    pages,
    devices,
    histograms,
    features,
    errors,
    releases,
  ] = await Promise.all([
    metrics(sql, days),
    sql.query(
      'SELECT sum(views)::int AS views,sum(lcp_sum)/NULLIF(sum(lcp_count),0) AS lcp,sum(inp_sum)/NULLIF(sum(inp_count),0) AS inp,sum(cls_sum)/NULLIF(sum(cls_count),0) AS cls FROM ft_admin_daily WHERE day>=CURRENT_DATE-($1::int*2-1) AND day<CURRENT_DATE-($1::int-1)',
      [days],
    ),
    sql.query(
      `SELECT path,sum(views)::int AS views,sum(lcp_sum)/NULLIF(sum(lcp_count),0) AS lcp,sum(lcp_count)::int AS lcp_count,
      sum(inp_sum)/NULLIF(sum(inp_count),0) AS inp,sum(inp_count)::int AS inp_count,sum(cls_sum)/NULLIF(sum(cls_count),0) AS cls,sum(cls_count)::int AS cls_count
      FROM ft_admin_daily WHERE day>=CURRENT_DATE-($1::int-1) AND ($2='' OR path=$2) AND ($3='' OR device=$3) GROUP BY path ORDER BY views DESC LIMIT 60`,
      [days, path, device],
    ),
    sql.query(
      `SELECT device,sum(views)::int AS views,sum(lcp_sum)/NULLIF(sum(lcp_count),0) AS lcp,sum(inp_sum)/NULLIF(sum(inp_count),0) AS inp,sum(cls_sum)/NULLIF(sum(cls_count),0) AS cls FROM ft_admin_daily WHERE day>=CURRENT_DATE-($1::int-1) AND ($2='' OR path=$2) GROUP BY device`,
      [days, path],
    ),
    sql.query(
      `SELECT metric,bucket,sum(samples)::int AS samples FROM ft_admin_metric_buckets WHERE day>=CURRENT_DATE-($1::int-1) AND ($2='' OR path=$2) AND ($3='' OR device=$3) GROUP BY metric,bucket ORDER BY metric,bucket`,
      [days, path, device],
    ),
    sql.query(
      `SELECT path,feature,source,sum(counts)::int AS counts FROM ft_admin_feature_daily WHERE day>=CURRENT_DATE-($1::int-1) GROUP BY path,feature,source ORDER BY counts DESC LIMIT 100`,
      [days],
    ),
    sql.query(
      `SELECT path,kind,detail,sum(counts)::int AS counts,max(last_seen_at) AS last_seen_at FROM ft_admin_errors WHERE day>=CURRENT_DATE-($1::int-1) GROUP BY path,kind,detail ORDER BY counts DESC LIMIT 100`,
      [days],
    ),
    sql.query(
      `SELECT release,metric,bucket,sum(samples)::int AS samples FROM ft_admin_metric_buckets WHERE day>=CURRENT_DATE-($1::int-1) GROUP BY release,metric,bucket ORDER BY release,metric,bucket`,
      [days],
    ),
  ])
  function percentiles(rows) {
    return ['lcp', 'inp', 'cls'].map((metric) => {
      const bins = rows.filter((r) => r.metric === metric),
        count = bins.reduce((n, b) => n + b.samples, 0),
        resolution = metric === 'cls' ? 0.005 : metric === 'inp' ? 10 : 50
      let n = 0,
        bin = null
      for (const b of bins) {
        n += b.samples
        if (n >= count * 0.75) {
          bin = b
          break
        }
      }
      return {
        metric,
        samples: count,
        p75: bin ? (bin.bucket + 1) * resolution : null,
        lower: bin ? bin.bucket * resolution : null,
        resolution,
        approximate: true,
      }
    })
  }
  const percentilesByRelease = [...new Set(releases.map((r) => r.release))].map(
    (release) => ({
      release,
      metrics: percentiles(releases.filter((r) => r.release === release)),
    }),
  )
  const before = previous[0] || {},
    viewsChange = before.views
      ? (((current.totals.views || 0) - before.views) / before.views) * 100
      : null
  const deteriorated = ['lcp', 'inp', 'cls'].filter(
    (metric) =>
      current.totals[metric] != null &&
      before[metric] > 0 &&
      current.totals[metric] > before[metric] * 1.2 &&
      current.totals[metric + '_count'] >= 20,
  )
  return {
    ...current,
    previous: before,
    viewsChange,
    pages,
    devices,
    percentiles: percentiles(histograms),
    features,
    errors,
    releases: percentilesByRelease,
    deteriorated,
    filters: { path, device },
    method:
      'P75 er et intervall beregnet fra anonyme målebøtter. Historiske gjennomsnitt brukes ikke som erstatning for manglende fordelinger.',
  }
}
