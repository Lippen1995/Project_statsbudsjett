import test from 'node:test'
import assert from 'node:assert/strict'
import { promoteDeployment } from './promote.mjs'

const config = { token: 'test-token', teamId: 'team_test', projectId: 'prj_test', url: 'https://test.vercel.app' }
const deployment = { id: 'dpl_test', projectId: 'prj_test', target: 'production', readyState: 'READY' }

test('promotering bruker kjent team/prosjekt uten brukeroppslag', async () => {
  const calls = []
  const id = await promoteDeployment({ ...config, fetchFn: async (url, options) => {
    calls.push({ url, method: options.method })
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return new Response(options.method === 'GET' ? JSON.stringify(deployment) : '', { status: 200 })
  } })
  assert.equal(id, 'dpl_test')
  assert.deepEqual(calls, [
    { url: 'https://api.vercel.com/v13/deployments/test.vercel.app?teamId=team_test', method: 'GET' },
    { url: 'https://api.vercel.com/v10/projects/prj_test/promote/dpl_test?teamId=team_test', method: 'POST' },
  ])
})

test('feil prosjekt eller uferdig bygg promoteres aldri', async () => {
  for (const invalid of [{ ...deployment, projectId: 'prj_other' }, { ...deployment, readyState: 'BUILDING' }, { ...deployment, target: null }]) {
    let requests = 0
    await assert.rejects(promoteDeployment({ ...config, fetchFn: async () => { requests++; return new Response(JSON.stringify(invalid)) } }))
    assert.equal(requests, 1)
  }
})

test('API-feil eksponerer ikke råsvar eller nøkkel', async () => {
  await assert.rejects(promoteDeployment({ ...config, fetchFn: async () => new Response('test-token private body', { status: 403 }) }), error => {
    assert.equal(error.message, 'Vercel GET feilet med HTTP 403')
    return true
  })
})
