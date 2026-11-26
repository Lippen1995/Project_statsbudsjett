import assert from 'node:assert/strict'
import test from 'node:test'
import { previewRequests } from '../../server/sven/preview-requests.mjs'

const id = 'b'.repeat(64)
const brief = { question: 'Privat spørsmål', history: [], asOf: '2026-11-22' }

function fixture() {
  const data = new Map()
  const cache = { get: async key => data.get(key), set: async (key, value) => data.set(key, value) }
  let time = 0
  return { data, open: () => previewRequests(cache, { now: () => time }), expire: () => { time += 180_000 } }
}

test('a new preview instance continues after completed steps without changing the brief', async () => {
  const { data, open, expire } = fixture()
  const call = { input: 'opprinnelig kildepakke' }
  const interrupted = await open().run(id, brief, async (_brief, memo) => {
    await memo('answer-0', call, async () => ({ draft: 'Privat svar' }), { billable: true })
    throw new Error('Avbrutt mellom svar og faktakontroll')
  })
  assert.equal(interrupted.body.recoverable, true)
  assert.equal((await open().resume(id, () => assert.fail('Arbeidet kan fortsatt kjøre'))).status, 202)
  expire()
  const finished = await open().resume(id, async (saved, memo) => {
    assert.deepEqual(saved, brief)
    const draft = await memo('answer-0', call, () => assert.fail('Ingen modellgjentakelse'), { billable: true })
    assert.deepEqual(draft, { draft: 'Privat svar' })
    const audit = await memo('review-0', draft, async () => ({ passed: true }), { billable: true })
    return { status: 200, body: audit }
  })
  assert.deepEqual(finished, { status: 200, body: { passed: true } })
  assert.deepEqual(await open().resume(id, () => assert.fail('Hent ferdig resultat')), finished)
  assert.doesNotMatch(JSON.stringify([...data]), /Privat spørsmål|Privat svar/)
})

test('a billable step with an unknown outcome is never repeated', async () => {
  const { open, expire } = fixture()
  await open().run(id, brief, async (_brief, memo) => {
    await memo('review-0', { source: 'A' }, () => { throw new Error('Forbindelsen ble brutt') }, { billable: true })
  })
  expire()
  assert.equal((await open().resume(id, () => assert.fail('Ingen automatisk gjentakelse'))).status, 409)
})
