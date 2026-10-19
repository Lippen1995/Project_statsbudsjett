import test from 'node:test'
import assert from 'node:assert/strict'
import { provisionAdmin, projectId, teamId } from './provision.mjs'

const connection = 'postgresql://preview:fixture@ep-fixture.eu-central-1.aws.neon.tech/fellestall?sslmode=require'
const env = key => ({ key, target: ['production'], type: 'sensitive' })
const configured = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FELLESTALL_GITHUB_TOKEN'].map(env)

test('produksjonsoppsett sender eksisterende Neon-forbindelse direkte til riktig Vercel Secret og bevarer den ved gjenkjøring', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    return options.method === 'POST' ? Response.json({ created: true }) : Response.json({ envs: configured })
  }
  assert.deepEqual(await provisionAdmin({ connection, token: 'test-only', fetcher }), { created: true })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-only')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    key: 'DATABASE_URL', value: connection, type: 'sensitive', target: ['production'],
    comment: 'Existing Fellestall Neon production database; provisioned by the protected publishing workflow.',
  })
  let requests = 0
  assert.deepEqual(await provisionAdmin({ connection, token: 'test-only', fetcher: async () => { requests++; return Response.json({ envs: [...configured, env('DATABASE_URL')] }) } }), { created: false })
  assert.equal(requests, 1)
})

test('produksjonsoppsett stopper ved manglende nøkler, usikkert mål og API-feil uten å gjengi hemmeligheter', async () => {
  for (const invalid of ['', 'https://example.com', 'postgresql://u:p@localhost/fellestall', connection.replace('sslmode=require', 'sslmode=disable')]) {
    await assert.rejects(provisionAdmin({ connection: invalid, token: 'test-only' }))
  }
  await assert.rejects(provisionAdmin({ connection, token: 'test-only', fetcher: async () => Response.json({ envs: configured.slice(0, 2) }) }), /FELLESTALL_GITHUB_TOKEN må konfigureres/)
  await assert.rejects(provisionAdmin({ connection, token: 'test-only', fetcher: async () => Response.json({ envs: configured, hiddenProductionEnvCount: 1 }) }), /skjuler produksjonsvariabler/)
  for (const failureAt of ['GET', 'POST']) {
    await assert.rejects(provisionAdmin({ connection, token: 'test-only', fetcher: async (_url, options) => {
      return (options.method || 'GET') === failureAt ? Response.json({ detail: connection + 'test-only' }, { status: 403 }) : Response.json({ envs: configured })
    } }), error => /HTTP 403/.test(error.message) && !error.message.includes('preview:fixture') && !error.message.includes('test-only'))
  }
})
