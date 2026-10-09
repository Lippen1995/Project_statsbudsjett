import test from 'node:test'
import assert from 'node:assert/strict'
import { vannfallStolper } from '../src/fellestall/grafer/vannfall-data.js'

const rader = (deltas) => deltas.map((delta, i) => ({ node: { i }, navn: `Post ${i}`, delta }))
  .sort((a, b) => b.delta - a.delta)

test('Energi med tre økninger og tre kutt viser hver post én gang', () => {
  const endr = rader([20, 8, 5, -403, -468, -5000])
  const stolper = vannfallStolper(endr)
  assert.equal(stolper.length, 6)
  assert.equal(new Set(stolper.map((r) => r.node.i)).size, 6)
  assert.equal(stolper.reduce((sum, r) => sum + r.v, 0), -5838)
})

test('rene kutt og større utvalg bevarer alle poster og samlet endring', () => {
  for (const deltas of [[], [-1, -2, -3], [-1, -2, -3, -4, -5], [10, 9, 8, 7, 6, 5, 4, -1, -2, -3, -4, -5]]) {
    const endr = rader(deltas)
    const stolper = vannfallStolper(endr)
    const ids = stolper.flatMap((r) => r.node ? [r.node.i] : r.rest.map((n) => n.i))
    assert.equal(ids.length, endr.length)
    assert.equal(new Set(ids).size, endr.length)
    assert.equal(stolper.reduce((sum, r) => sum + r.v, 0), deltas.reduce((sum, v) => sum + v, 0))
  }
})

test('Øvrige kan åpnes også når resterende økninger og kutt utligner hverandre', () => {
  const stolper = vannfallStolper(rader([10, 9, 8, 7, 6, 5, 4, -4, -5, -6, -7, -8]))
  const rest = stolper.find((r) => r.rest)
  assert.equal(rest.v, 0)
  assert.equal(rest.rest.length, 2)
})
