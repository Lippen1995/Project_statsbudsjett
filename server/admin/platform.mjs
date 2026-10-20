import { randomUUID } from 'node:crypto'
import {
  recordStore,
  audit,
  collections,
  csv,
  fail,
  requireRole,
  roleOf,
  text,
} from './core.mjs'
import { accountService } from './accounts.mjs'
import { notificationService } from './notifications.mjs'
import { backupService } from './backups.mjs'
import { dataService } from './data.mjs'
import { editorialService } from './editorial.mjs'
import { learningService } from './learning.mjs'
import { monitoringService } from './monitoring.mjs'
import { jobService } from './jobs.mjs'
import { insightReport } from './insights.mjs'
import { infrastructureService, checkLinks } from './infrastructure.mjs'

const privateCollections = new Set([
  'recipients',
  'preferences',
  'integrationPolicies',
])
const sensitive = new Set([
  'data/restore',
  'backups/import',
  'backups/restore',
  'editorial/approve',
  'editorial/withdraw',
  'accounts/update',
  'learning/restore',
])
const reply = (data) => ({ data })
export function createPlatform({
  sql,
  pool,
  auth,
  github,
  health,
  mail,
  secret,
  origin,
  providers = {},
}) {
  const records = recordStore(sql),
    notifications = notificationService(sql)
  const accounts = accountService({ sql, auth, mail }),
    backups = backupService({ sql, pool, secret })
  const data = dataService({ sql, github }),
    editorial = editorialService({ sql, github }),
    learning = learningService({ sql, github })
  const infrastructure =
    providers.infrastructure || infrastructureService({ sql, notifications })
  const monitoring =
      providers.monitoring || monitoringService({ sql, notifications }),
    jobs = jobService({ sql, github, notifications })
  let maintaining
  async function maintain() {
    const owner = randomUUID()
    const lease = await sql.query(
      `INSERT INTO ft_admin_tasks(name,owner,lease_until) VALUES('maintenance',$1,now()+interval '5 minutes')
      ON CONFLICT(name) DO UPDATE SET owner=EXCLUDED.owner,lease_until=EXCLUDED.lease_until
      WHERE ft_admin_tasks.lease_until<now() AND (ft_admin_tasks.last_finished_at IS NULL OR ft_admin_tasks.last_finished_at<now()-interval '4 minutes') RETURNING name`,
      [owner],
    )
    if (!lease.length)
      return { skipped: true, checkedAt: new Date().toISOString() }
    try {
      const results = await Promise.allSettled([
        monitoring.get(),
        jobs.get(),
        health.dashboard(),
        infrastructure.get(),
      ])
      const report = results[2].status === 'fulfilled' ? results[2].value : null
      if (report)
        await notifications.publish({
          key: 'health:services',
          type: 'operations',
          severity: report.status === 'outage' ? 'critical' : 'warning',
          title: 'Tjenestestatus: ' + report.status,
          detail:
            report.components
              .filter((c) => c.status !== 'operational')
              .map((c) => c.name + ': ' + c.message)
              .join('\n') || 'Alle tjenester svarer normalt.',
          resource: 'drift',
          resolved: report.status === 'operational',
        })
      const [quality, insights] = await Promise.all([
        data.overview(),
        insightReport(sql, 7),
      ])
      for (const policy of quality.policies) {
        const dataset = quality.datasets.find(
            (d) =>
              d.id === policy.data.source || d.label === policy.data.source,
          ),
          updated = Date.parse(
            dataset?.updated ||
              (policy.data.source === 'all' ? quality.updated : ''),
          ),
          expected = policy.data.nextExpected
            ? Date.parse(policy.data.nextExpected)
            : Number.isFinite(updated)
              ? updated + policy.data.expectedDays * 86400000
              : null
        if (expected)
          await notifications.publish({
            key: 'data:late:' + policy.id,
            type: 'data',
            severity: 'warning',
            title: 'En forventet kildeoppdatering mangler.',
            detail:
              policy.data.source +
              ' · forventet innen ' +
              new Date(expected).toISOString(),
            resource: 'data',
            resolved:
              Date.now() < expected ||
              (Number.isFinite(updated) && updated > expected),
          })
      }
      for (const metric of ['lcp', 'inp', 'cls'])
        await notifications.publish({
          key: 'performance:' + metric,
          type: 'operations',
          severity: 'warning',
          title:
            metric.toUpperCase() + ' har svakere målinger enn forrige periode.',
          detail:
            'Mer enn 20 prosent økning i gjennomsnitt, med minst 20 målinger. Undersøk periode, side og enhet i Ytelse.',
          resource: 'ytelse',
          resolved: !insights.deteriorated.includes(metric),
        })
      const [recentBackup] = await sql.query(
        "SELECT id FROM ft_admin_backups WHERE created_at>now()-interval '24 hours' LIMIT 1",
      )
      const [count] = await sql.query(
        'SELECT count(*)::int AS n FROM ft_admin_records',
      )
      if (!recentBackup && count.n) {
        await backups.create(
          {
            id: 'system:maintenance',
            email: 'Fellestall (automatikk)',
            role: 'admin',
          },
          {
            label:
              'Automatisk døgnkopi ' + new Date().toISOString().slice(0, 10),
          },
        )
        await sql.query(
          'DELETE FROM ft_admin_backups WHERE id IN (SELECT id FROM ft_admin_backups ORDER BY created_at DESC OFFSET 40)',
        )
      }
      if (mail?.ready) await mail.flush(notifications)
      await Promise.all(
        [
          'ft_admin_feature_daily',
          'ft_admin_errors',
          'ft_admin_metric_buckets',
        ].map((table) =>
          sql.query(`DELETE FROM ${table} WHERE day<CURRENT_DATE-90`),
        ),
      )
      await sql.query(
        'DELETE FROM ft_admin_ingest_limit WHERE expires_at<now()',
      )
      return {
        checkedAt: new Date().toISOString(),
        providers: results.map((r, i) => ({
          name: ['checkly', 'jobs', 'health', 'infrastructure'][i],
          available: r.status === 'fulfilled' && r.value?.available !== false,
        })),
      }
    } finally {
      await sql.query(
        "UPDATE ft_admin_tasks SET lease_until=now(),last_finished_at=now() WHERE name='maintenance' AND owner=$1",
        [owner],
      )
    }
  }
  async function report(month) {
    if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month || ''))
      fail('Velg en gyldig måned.')
    const start = month + '-01',
      end = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
      )
        .toISOString()
        .slice(0, 10)
    const [
      traffic,
      pages,
      sources,
      features,
      incidents,
      changes,
      quality,
      notes,
    ] = await Promise.all([
      sql.query(
        'SELECT day::text,sum(views)::int AS views,sum(lcp_sum)/NULLIF(sum(lcp_count),0) AS lcp,sum(lcp_count)::int AS samples FROM ft_admin_daily WHERE day>=$1 AND day<$2 GROUP BY day ORDER BY day',
        [start, end],
      ),
      sql.query(
        'SELECT path,sum(views)::int AS views FROM ft_admin_daily WHERE day>=$1 AND day<$2 GROUP BY path ORDER BY views DESC',
        [start, end],
      ),
      sql.query(
        'SELECT source,sum(views)::int AS views FROM ft_admin_daily WHERE day>=$1 AND day<$2 GROUP BY source ORDER BY views DESC',
        [start, end],
      ),
      sql.query(
        'SELECT feature,sum(counts)::int AS counts FROM ft_admin_feature_daily WHERE day>=$1 AND day<$2 GROUP BY feature ORDER BY counts DESC',
        [start, end],
      ),
      sql.query(
        'SELECT created_at,status,summary FROM ft_admin_health_events WHERE created_at>=$1::date AND created_at<$2::date ORDER BY created_at',
        [start, end],
      ),
      sql.query(
        'SELECT action,count(*)::int AS count FROM ft_admin_audit WHERE created_at>=$1::date AND created_at<$2::date GROUP BY action',
        [start, end],
      ),
      data.overview(),
      sql.query(
        "SELECT data->>'title' AS title,data->>'note' AS note FROM ft_admin_records WHERE collection='reports' AND data->>'month'=$1 ORDER BY created_at",
        [month],
      ),
    ])
    return {
      month,
      start,
      end,
      generatedAt: new Date().toISOString(),
      traffic,
      pages,
      sources,
      features,
      incidents,
      changes,
      notes,
      quality: {
        generatedAt: quality.builtAt,
        checks: quality.checks,
        datasets: quality.datasets,
      },
      views: traffic.reduce((n, r) => n + (r.views || 0), 0),
      retentionDays: 90,
      partial: Date.parse(start) < Date.now() - 90 * 86400000,
      note: 'Sidevisninger er anonyme sideinnlastinger. Månedstall kan være ufullstendige før innsamlingen startet og etter lagringstiden på 90 dager. Datakvalitet viser gjeldende kontroll, ikke en historisk måling.',
    }
  }
  return {
    notifications,
    monitoring,
    jobs,
    mail,
    maintain() {
      maintaining ||= maintain().finally(() => {
        maintaining = null
      })
      return maintaining
    },
    async route(path, request, url, session, readBody) {
      const user = session.user,
        method = request.method
      if (method !== 'GET' && path !== 'accounts/revoke') {
        requireRole(user, ['admin', 'editor'])
        const bucket =
          'action:' + user.id + ':' + Math.floor(Date.now() / 60000)
        const [limit] = await sql.query(
          `INSERT INTO ft_admin_ingest_limit(key,expires_at) VALUES($1,now()+interval '2 minutes') ON CONFLICT(key) DO UPDATE SET count=ft_admin_ingest_limit.count+1 RETURNING count`,
          [bucket],
        )
        if (limit.count > 30)
          fail('For mange handlinger på kort tid. Vent ett minutt.', 429)
      }
      let value
      const body = async () => (value ??= await readBody(request))
      if (method === 'POST' && sensitive.has(path)) {
        requireRole(user)
        const input = await body()
        if (!input.password)
          fail('Bekreft handlingen med ditt nåværende passord.', 403)
        try {
          await auth.api.verifyPassword({
            headers: request.headers,
            body: { password: input.password },
          })
        } catch {
          fail('Passordet kunne ikke bekreftes.', 403)
        }
        delete input.password
      }
      const param = (key) => url.searchParams.get(key)
      if (path === 'overview' && method === 'GET') {
        const parts = await Promise.allSettled([
          health.dashboard(),
          github.readPipeline(),
          editorial.list(),
          data.overview(),
          jobs.get(),
          notifications.list(),
        ])
        const keys = [
          'health',
          'pipeline',
          'reviews',
          'data',
          'jobs',
          'notifications',
        ]
        return reply(
          Object.fromEntries(
            parts.map((p, i) => [
              keys[i],
              p.status === 'fulfilled'
                ? i === 5
                  ? { items: p.value.items }
                  : p.value
                : { unavailable: true, message: 'Kan ikke hentes akkurat nå.' },
            ]),
          ),
        )
      }
      if (path === 'insights' && method === 'GET')
        return reply(
          await insightReport(sql, Number(param('days') || 30), {
            path: param('path'),
            device: param('device'),
          }),
        )
      if (path === 'infrastructure' && method === 'GET')
        return reply(await infrastructure.get())
      if (path === 'editorial/image' && method === 'POST') {
        requireRole(user, ['admin', 'editor'])
        const result = await github.uploadImage((await body()).content)
        await audit(sql, user, 'upload-image', 'content/' + result.path)
        return reply(result)
      }
      if (path === 'editorial/links' && method === 'POST') {
        const v = await body(),
          article = v.number
            ? (await editorial.review(v.number)).article
            : (await editorial.published()).articles.find(
                (a) => a.slug === v.slug,
              )
        if (!article) fail('Analysen finnes ikke.', 404)
        return reply(
          await checkLinks(
            [
              ...new Set([
                ...(article.report.sources || []).map((s) => s.url),
                article.presentation?.image || '/delingsbilde.png',
              ]),
            ].slice(0, 24),
          ),
        )
      }
      if (path === 'distribution/reconcile' && method === 'POST')
        return reply(await editorial.reconcileDistribution(user, await body()))
      if (path === 'monitoring' && method === 'GET')
        return reply(await monitoring.get())
      if (path === 'integrations' && method === 'GET') {
        requireRole(user)
        return reply(await monitoring.integrations())
      }
      if (path === 'jobs' && method === 'GET') return reply(await jobs.get())
      if (path === 'jobs/retry' && method === 'POST')
        return reply(await jobs.retry(user, await body()))
      if (path === 'data' && method === 'GET')
        return reply(await data.overview())
      if (path === 'data/compare' && method === 'GET')
        return reply(await data.compare(param('id')))
      if (path === 'data/hold' && method === 'POST')
        return reply(await data.hold(user, await body()))
      if (path === 'data/restore' && method === 'POST')
        return reply(await data.restore(user, await body()))
      if (path === 'learning' && method === 'GET')
        return reply(await learning.get())
      if (path === 'learning/apply' && method === 'POST')
        return reply(await learning.apply(user, await body()))
      if (path === 'learning/version' && method === 'GET')
        return reply(await learning.version(param('id'), param('commit')))
      if (path === 'learning/restore' && method === 'POST')
        return reply(await learning.restore(user, await body()))
      if (path === 'editorial/reviews' && method === 'GET')
        return reply(await editorial.list())
      if (path === 'editorial/review' && method === 'GET')
        return reply(await editorial.review(Number(param('number'))))
      if (path === 'editorial/previous' && method === 'GET')
        return reply(
          await editorial.previous(Number(param('number')), param('sha')),
        )
      if (path === 'editorial/published' && method === 'GET')
        return reply(await editorial.published())
      for (const [route, handler] of Object.entries({
        'editorial/save': 'save',
        'editorial/comment': 'comment',
        'editorial/approve': 'approve',
        'editorial/revise': 'revisePublished',
        'editorial/withdraw': 'withdraw',
        'distribution/retry': 'retryDistribution',
      }))
        if (path === route && method === 'POST')
          return reply(await editorial[handler](user, await body()))
      if (path === 'distribution' && method === 'GET')
        return reply(await editorial.distribution())
      if (path === 'notifications' && method === 'GET') {
        const state = await notifications.list({
          type: param('type') || '',
          severity: param('severity') || '',
        })
        if (roleOf(user) !== 'admin') {
          delete state.recipients
          delete state.deliveries
        }
        return reply({ ...state, emailReady: Boolean(mail?.ready) })
      }
      if (path === 'notifications/test' && method === 'POST') {
        requireRole(user)
        if (!mail?.ready) fail('E-posttjenesten er ikke konfigurert.', 503)
        await mail.send({
          key: 'test:' + randomUUID(),
          recipient: user.email,
          type: 'security',
          subject: 'Test fra Fellestall-admin',
          text: 'Dette er en test av e-postvarslingen du ba om i Fellestall-admin.',
        })
        await audit(sql, user, 'test-email', 'notifications', null, {
          recipient: user.email,
        })
        return reply({ sent: true })
      }
      if (path === 'accounts' && method === 'GET')
        return reply(await accounts.list(user))
      if (path === 'accounts/profile' && method === 'GET')
        return reply(await accounts.profile(session))
      if (path === 'accounts/invite' && method === 'POST')
        return reply(await accounts.invite(user, await body(), request.headers))
      if (path === 'accounts/update' && method === 'POST')
        return reply(await accounts.update(user, await body(), request.headers))
      if (path === 'accounts/revoke' && method === 'POST')
        return reply(await accounts.revoke(session, await body()))
      if (path === 'audit' && method === 'GET')
        return reply(
          await accounts.log(user, {
            q: param('q') || '',
            action: param('action') || '',
          }),
        )
      if (path === 'backups' && method === 'GET')
        return reply({
          items: await backups.list(user),
          version: await backups.version(),
        })
      if (path === 'backups/import' && method === 'POST')
        return reply(await backups.import(user, await body()))
      if (path === 'backups/create' && method === 'POST')
        return reply(await backups.create(user, await body()))
      if (path === 'backups/test' && method === 'POST')
        return reply(await backups.test(user, (await body()).id))
      if (path === 'backups/preview' && method === 'GET')
        return reply({
          ...(await backups.preview(user, param('id'))),
          expectedVersion: await backups.version(),
        })
      if (path === 'backups/download' && method === 'GET')
        return reply(await backups.download(user, param('id')))
      if (path === 'backups/restore' && method === 'POST')
        return reply(await backups.restore(user, await body()))
      if (path === 'reports' && method === 'GET')
        return reply(await report(param('month')))
      if (path.startsWith('records/')) {
        const collection = path.slice(8)
        if (!collections[collection]) fail('Ukjent register.', 404)
        if (privateCollections.has(collection)) requireRole(user)
        if (method === 'GET')
          return reply(await records.list(collection, { q: param('q') || '' }))
        const input = await body()
        if (
          collection === 'rules' &&
          input.data?.status !== 'proposed' &&
          input.action !== 'delete'
        )
          fail(
            'Aktivering og arkivering av læringsregler må gjøres i den særskilte godkjenningsflyten.',
          )
        if (
          collection === 'preferences' &&
          input.id &&
          input.id !== 'notifications'
        )
          fail('Bruk den særskilte flyten for denne innstillingen.')
        return reply(
          input.action === 'delete'
            ? await records.remove(user, collection, input.id, input.revision)
            : await records.write(user, collection, input),
        )
      }
      if (path === 'export' && method === 'GET') {
        const kind = param('kind'),
          days = Number(param('days') || 30),
          state = await insightReport(sql, days)
        const allowed = {
          pages: state.pages,
          sources: state.sources,
          features: state.features,
          errors: state.errors,
          daily: state.daily,
        }
        if (!allowed[kind]) fail('Velg en gyldig eksport.')
        const rows = allowed[kind],
          keys = rows.length ? Object.keys(rows[0]) : ['path', 'views']
        return {
          csv: csv(
            keys.map((key) => ({ key, label: key })),
            rows,
          ),
          filename: 'fellestall-' + kind + '.csv',
        }
      }
      return null
    },
  }
}
