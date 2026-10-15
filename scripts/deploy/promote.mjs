import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

export async function promoteDeployment({ token, teamId, projectId, url, fetchFn = fetch }) {
  assert.ok(token && teamId && projectId, 'Vercel-token, team og prosjekt kreves')
  const target = new URL(url)
  assert.ok(target.protocol === 'https:' && target.hostname.endsWith('.vercel.app') && target.origin === url, 'Ugyldig utrullingsadresse')
  async function api(path, method = 'GET') {
    const response = await fetchFn(`https://api.vercel.com${path}?teamId=${encodeURIComponent(teamId)}`, {
      method, headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000), redirect: 'error',
    })
    if (!response.ok) throw new Error(`Vercel ${method} feilet med HTTP ${response.status}`)
    const body = await response.text()
    return body ? JSON.parse(body) : null
  }
  // Ingen bruker-/teamsøk: prosjektavgrensede tokens skal bare treffe det
  // kjente prosjektet, og en utrulling fra et annet prosjekt må avvises.
  const deployment = await api(`/v13/deployments/${encodeURIComponent(target.hostname)}`)
  assert.equal(deployment.projectId ?? deployment.project?.id, projectId, 'Utrullingen tilhører feil prosjekt')
  assert.equal(deployment.target, 'production', 'Forventet et produksjonsbygg')
  assert.equal(deployment.readyState ?? deployment.state, 'READY', 'Utrullingen er ikke klar')
  assert.match(deployment.id, /^dpl_[A-Za-z0-9]+$/)
  await api(`/v10/projects/${encodeURIComponent(projectId)}/promote/${deployment.id}`, 'POST')
  return deployment.id
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const id = await promoteDeployment({ token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_ORG_ID, projectId: process.env.VERCEL_PROJECT_ID, url: process.env.DEPLOYMENT_URL })
    console.log(`Kontrollert produksjonsutrulling aktivert: ${id}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
