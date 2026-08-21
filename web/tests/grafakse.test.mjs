import test from 'node:test'
import assert from 'node:assert/strict'

import { yearTickIndices } from '../src/fellestall/grafer/akse.js'

test('årsaksen fordeler etikettene og unngår to siste år oppå hverandre', () => {
  assert.deepEqual(yearTickIndices(11), [0, 3, 5, 8, 10])
  assert.deepEqual(yearTickIndices(5), [0, 1, 2, 3, 4])
  assert.deepEqual(yearTickIndices(1), [0])
  assert.deepEqual(yearTickIndices(0), [])
})
