import { audit, requireRole, roleOf } from './core.mjs'
import { svenFiles } from './sven.mjs'
import { telemetryEvent, ingest, metrics, liveMetrics } from './telemetry.mjs'

const headers = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
}
const json = (data, status = 200) => Response.json(data, { status, headers })
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw Object.assign(Error('Forventet JSON.'), { status: 415 })
  const text = await request.text()
  if (
    Buffer.byteLength(text) >
    (new URL(request.url).pathname === '/api/admin/backups/import'
      ? 3000000
      : 110000)
  )
    throw Object.assign(Error('Innholdet er for stort.'), { status: 413 })
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(Error('Ugyldig JSON.'), { status: 400 })
  }
}

export function createHandler({
  auth,
  sql,
  github,
  health,
  origin = 'https://fellestall.no',
  secret = process.env.BETTER_AUTH_SECRET,
  platform,
  background = () => {},
  cronSecret = process.env.CRON_SECRET,
}) {
  return async (request) => {
    try {
      const url = new URL(request.url)
      if (!['GET', 'POST', 'PUT'].includes(request.method))
        return json({ error: 'Metoden støttes ikke.' }, 405)
      if (request.method !== 'GET' && request.headers.get('origin') !== origin)
        return json({ error: 'Ugyldig opprinnelse.' }, 403)
      if (url.pathname === '/api/admin/cron' && request.method === 'GET') {
        if (
          !cronSecret ||
          request.headers.get('authorization') !== 'Bearer ' + cronSecret
        )
          return json({ error: 'Ugyldig tilgang.' }, 401)
        return json(await platform.maintain())
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        const report = await health.check()
        if (platform) background(platform.maintain().catch(() => {}))
        return json(
          {
            status: report.status,
            checkedAt: report.checkedAt,
            components: report.components,
          },
          report.status === 'operational' ? 200 : 503,
        )
      }
      if (url.pathname === '/api/auth/config' && request.method === 'GET')
        return json({ recoveryEmailReady: Boolean(platform?.mail?.ready) })
      if (url.pathname.startsWith('/api/auth/admin/'))
        return json({ error: 'Bruk kontoadministrasjonen.' }, 403)
      if (url.pathname.startsWith('/api/auth/')) {
        const previousSession =
          request.method === 'POST' && /two-factor|sign-out/.test(url.pathname)
            ? await auth.api.getSession({ headers: request.headers })
            : null
        const response = await auth.handler(request)
        if (response.ok && previousSession)
          await audit(
            sql,
            previousSession.user,
            'auth-' + url.pathname.split('/').at(-1),
            'security',
          )
        for (const [key, value] of Object.entries(headers))
          response.headers.set(key, value)
        return response
      }
      if (url.pathname === '/api/telemetry' && request.method === 'POST') {
        let event = telemetryEvent(await body(request))
        if (!event) return json({ error: 'Ugyldig måling.' }, 400)
        if (
          /bot|crawler|spider|headless|lighthouse|checkly/i.test(
            request.headers.get('user-agent') || '',
          )
        )
          event = { ...event, type: 'feature', feature: 'bot' }
        const accepted = await ingest(
          sql,
          event,
          request.headers.get('x-vercel-forwarded-for') ?? 'local',
          secret,
        )
        return new Response(null, { status: accepted ? 204 : 429, headers })
      }
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session || session.user.banned)
        return json({ error: 'Du må logge inn.' }, 401)
      if (url.pathname === '/api/admin/session' && request.method === 'GET')
        return json({
          id: session.user.id,
          email: session.user.email,
          role: roleOf(session.user),
          twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
        })
      if (platform) {
        const result = await platform.route(
          url.pathname.replace(/^\/api\/admin\//, ''),
          request,
          url,
          session,
          body,
        )
        if (result)
          return result.csv !== undefined
            ? new Response(result.csv, {
                headers: {
                  ...headers,
                  'Content-Type': 'text/csv; charset=utf-8',
                  'Content-Disposition':
                    'attachment; filename="' + result.filename + '"',
                },
              })
            : json(result.data)
      }
      if (request.method !== 'GET')
        requireRole(session.user, ['admin', 'editor'])
      if (url.pathname === '/api/admin/live' && request.method === 'GET')
        return json(await liveMetrics(sql))
      if (
        url.pathname === '/api/admin/live-status' &&
        request.method === 'GET'
      ) {
        const report = await health.dashboard()
        if (platform) {
          background(platform.maintain().catch(() => {}))
          const external = await platform.monitoring.peek?.()
          const active =
            external?.available &&
            !external.stale &&
            external.checks?.some(
              (c) => c.activated && !c.stopped && !c.muted && c.alertsConfirmed,
            )
          report.notifications = {
            ...report.notifications,
            enabled: Boolean(active),
            state:
              !external || !external.available || external.stale
                ? 'unknown'
                : active
                  ? 'active'
                  : 'attention',
            message:
              !external || !external.available || external.stale
                ? 'Den eksterne kontrollen kan ikke bekreftes akkurat nå. Se Overvåking og forbruk.'
                : active
                  ? 'Checkly har ferske resultater og aktiv e-postkanal for feil, nedsatt ytelse og normal drift.'
                  : 'Kontroller pauser, demping og e-postabonnement i Checkly.',
          }
          report.externalMonitoring = Boolean(active)
        }
        return json(report)
      }
      if (url.pathname === '/api/admin/pipeline' && request.method === 'GET')
        return json({
          ...(await github.readPipeline()),
          writable: github.writable && roleOf(session.user) !== 'viewer',
        })
      if (
        url.pathname === '/api/admin/pipeline/suggest' &&
        request.method === 'POST'
      )
        return json(await github.suggestTopic(await body(request)))
      if (url.pathname === '/api/admin/pipeline' && request.method === 'PUT') {
        const input = await body(request),
          result = await github.changePipeline(input)
        await audit(
          sql,
          session.user,
          'pipeline-' + input.action,
          'pipeline',
          { sha: input.sha },
          { sha: result.sha, id: input.id || null },
        )
        return json(result)
      }
      if (url.pathname === '/api/admin/metrics' && request.method === 'GET') {
        const days = Number(url.searchParams.get('days') ?? 7)
        if (![7, 30, 90].includes(days))
          return json({ error: 'Ugyldig periode.' }, 400)
        return json(await metrics(sql, days))
      }
      if (url.pathname === '/api/admin/sven/files' && request.method === 'GET')
        return json({
          files: svenFiles,
          writable: github.writable && roleOf(session.user) === 'admin',
        })
      if (url.pathname === '/api/admin/sven/file' && request.method === 'GET')
        return json(await github.read(url.searchParams.get('id')))
      if (url.pathname === '/api/admin/sven/file' && request.method === 'PUT') {
        requireRole(session.user)
        const input = await body(request),
          before = await github.read(input.id),
          result = await github.save(input)
        await audit(
          sql,
          session.user,
          'instructions-update',
          'sven/' + input.id,
          { sha: before.sha, content: before.content },
          { sha: result.sha, content: input.content, reason: input.reason },
        )
        return json(result)
      }
      if (
        url.pathname === '/api/admin/sven/history' &&
        request.method === 'GET'
      )
        return json(await github.history(url.searchParams.get('id')))
      if (url.pathname === '/api/admin/log' && request.method === 'GET')
        return json(await github.log())
      if (url.pathname === '/api/admin/status' && request.method === 'GET') {
        await sql.query('SELECT 1')
        return json({
          database: true,
          githubWrite: github.writable,
          checkedAt: new Date().toISOString(),
        })
      }
      return json({ error: 'Fant ikke endepunktet.' }, 404)
    } catch (error) {
      const status =
        error.status >= 400 && error.status <= 599 ? error.status : 503
      if (status >= 500) {
        try {
          const path = new URL(request.url).pathname
            .replace(/[^a-zA-Z0-9/_-]/g, '')
            .slice(0, 180)
          await sql.query(
            `INSERT INTO ft_admin_errors(day,path,kind,detail) VALUES(CURRENT_DATE,$1,'server',$2) ON CONFLICT(day,path,kind,detail) DO UPDATE SET counts=ft_admin_errors.counts+1,last_seen_at=now()`,
            [path, 'HTTP ' + status],
          )
        } catch {}
      }
      return json(
        {
          error: error.status
            ? error.message
            : 'Administrasjonstjenesten er utilgjengelig. Kontroller serveroppsettet eller prøv igjen.',
        },
        status,
      )
    }
  }
}
