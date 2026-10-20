import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

export const projectId = 'prj_UCZp0PnkkoWMO6EJsLHW3y787ALp'
export const teamId = 'team_zBf9uUPGwDQKfB9fElKD876W'

// Run only in the existing protected main-branch publishing workflow. Neon's
// production URL goes directly to Vercel Secret storage, never to logs/artifacts.
export async function provisionAdmin({ connection = process.env.DATABASE_URL, token = process.env.VERCEL_TOKEN, fetcher = fetch } = {}) {
  if (!connection || !token) throw Error('Databaseforbindelse eller Vercel-tilgang mangler')
  const database = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname.endsWith('.neon.tech') ||
      !['require', 'verify-ca', 'verify-full'].includes(database.searchParams.get('sslmode'))) {
    throw Error('Forventet Neon production-forbindelse med TLS')
  }
  const endpoint = `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const existing = await fetcher(endpoint, { headers, signal: AbortSignal.timeout(30000) })
  if (!existing.ok) throw Error(`Vercel-miljøoppslag feilet (HTTP ${existing.status})`)
  const { envs = [], hiddenProductionEnvCount = 0 } = await existing.json()
  const production = envs.filter(e => e.target?.includes('production'))
  for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FELLESTALL_GITHUB_TOKEN']) {
    if (!production.some(e => e.key === key)) throw Error(`${key} må konfigureres i Vercel Production før publisering`)
  }
  if (hiddenProductionEnvCount && !production.some(e => e.key === 'CRON_SECRET')) throw Error('Vercel skjuler produksjonsvariabler; cron-oppsettet må avklares før endring')
  if (!production.some(e => e.key === 'CRON_SECRET')) {
    const cron = await fetcher(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(30000), body: JSON.stringify({ key: 'CRON_SECRET', value: randomBytes(32).toString('hex'), type: 'sensitive', target: ['production'], comment: 'Authentication for the daily admin maintenance cron; generated without logging the value.' }) })
    if (!cron.ok) throw Error(`Cron-oppsett feilet (HTTP ${cron.status})`)
  }
  if (production.some(e => e.key === 'DATABASE_URL')) return { created: false }
  if (hiddenProductionEnvCount) throw Error('Vercel skjuler produksjonsvariabler; databaseoppsettet må avklares før endring')
  const result = await fetcher(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(30000), body: JSON.stringify({
    key: 'DATABASE_URL', value: connection, type: 'sensitive', target: ['production'],
    comment: 'Existing Fellestall Neon production database; provisioned by the protected publishing workflow.',
  }) })
  if (!result.ok) throw Error(`Vercel-databaseoppsett feilet (HTTP ${result.status})`)
  return { created: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await provisionAdmin()
    console.log(result.created ? 'Neon production-forbindelsen er konfigurert som Vercel Secret.' : 'Eksisterende Vercel production-forbindelse beholdes.')
  } catch (error) {
    // Provider bodies and connection strings deliberately stay out of CI logs.
    console.error(error instanceof TypeError ? 'Ugyldig tilkoblingsoppsett eller nettverksfeil.' : error.message)
    process.exitCode = 1
  }
}
