import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MUNICIPAL_LAUNCH_END,
  MUNICIPAL_LAUNCH_START,
  isMunicipalLaunchNewsVisible,
} from '../src/fellestall/launchNews.js'

test('kommunenyheten vises i nøyaktig én måned', () => {
  assert.equal(isMunicipalLaunchNewsVisible('2026-09-22T21:59:59Z'), false)
  assert.equal(isMunicipalLaunchNewsVisible(MUNICIPAL_LAUNCH_START), true)
  assert.equal(isMunicipalLaunchNewsVisible('2026-10-22T21:59:59Z'), true)
  assert.equal(isMunicipalLaunchNewsVisible(MUNICIPAL_LAUNCH_END), false)
})

test('kommunenyheten skjules når tidspunktet er ugyldig', () => {
  assert.equal(isMunicipalLaunchNewsVisible('ikke-en-dato'), false)
})
