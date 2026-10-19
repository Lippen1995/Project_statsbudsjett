import { adminEmail } from './auth.mjs'
import { svenFiles } from './sven.mjs'
import { telemetryEvent, ingest, metrics } from './telemetry.mjs'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }
const json = (data, status = 200) => Response.json(data, { status, headers })
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(Error('Forventet JSON.'), { status: 415 })
  const text = await request.text()
  if (Buffer.byteLength(text) > 110000) throw Object.assign(Error('Innholdet er for stort.'), { status: 413 })
  try { return JSON.parse(text) } catch { throw Object.assign(Error('Ugyldig JSON.'), { status: 400 }) }
}

export function createHandler({ auth, sql, github, origin = 'https://fellestall.no', secret = process.env.BETTER_AUTH_SECRET }) {
  return async request => {
    try {
      const url = new URL(request.url)
      if (!['GET', 'POST', 'PUT'].includes(request.method)) return json({ error: 'Metoden støttes ikke.' }, 405)
      if (request.method !== 'GET' && request.headers.get('origin') !== origin) return json({ error: 'Ugyldig opprinnelse.' }, 403)
      if (url.pathname.startsWith('/api/auth/')) {
        const response = await auth.handler(request)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
        return response
      }
      if (url.pathname === '/api/telemetry' && request.method === 'POST') {
        const event = telemetryEvent(await body(request))
        if (!event) return json({ error: 'Ugyldig måling.' }, 400)
        const accepted = await ingest(sql, event, request.headers.get('x-vercel-forwarded-for') ?? 'local', secret)
        return new Response(null, { status: accepted ? 204 : 429, headers })
      }
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session || session.user.email.toLowerCase() !== adminEmail) return json({ error: 'Du må logge inn.' }, 401)
      if (url.pathname === '/api/admin/session' && request.method === 'GET') return json({ email: session.user.email })
      if (url.pathname === '/api/admin/pipeline' && request.method === 'GET') return json(await github.readPipeline())
      if (url.pathname === '/api/admin/pipeline' && request.method === 'PUT') return json(await github.changePipeline(await body(request)))
      if (url.pathname === '/api/admin/metrics' && request.method === 'GET') {
        const days = Number(url.searchParams.get('days') ?? 7)
        if (![7, 30, 90].includes(days)) return json({ error: 'Ugyldig periode.' }, 400)
        return json(await metrics(sql, days))
      }
      if (url.pathname === '/api/admin/sven/files' && request.method === 'GET') return json({ files: svenFiles, writable: github.writable })
      if (url.pathname === '/api/admin/sven/file' && request.method === 'GET') return json(await github.read(url.searchParams.get('id')))
      if (url.pathname === '/api/admin/sven/file' && request.method === 'PUT') return json(await github.save(await body(request)))
      if (url.pathname === '/api/admin/sven/history' && request.method === 'GET') return json(await github.history(url.searchParams.get('id')))
      if (url.pathname === '/api/admin/log' && request.method === 'GET') return json(await github.log())
      if (url.pathname === '/api/admin/status' && request.method === 'GET') {
        await sql.query('SELECT 1')
        return json({ database: true, githubWrite: github.writable, checkedAt: new Date().toISOString() })
      }
      return json({ error: 'Fant ikke endepunktet.' }, 404)
    } catch (error) {
      const status = error.status >= 400 && error.status <= 599 ? error.status : 503
      return json({ error: error.status ? error.message : 'Administrasjonstjenesten er utilgjengelig. Kontroller serveroppsettet eller prøv igjen.' }, status)
    }
  }
}
