import test from 'node:test'
import assert from 'node:assert/strict'
import { scenario } from './scenarios.mjs'

const assumptions = { fte: 100, timeSaving: .1, realization: .5, cashShare: .4,
  annualEmployerCost: 1e6, nonStaffSavings: 0, upfrontCost: 3e6,
  ongoingCost: 0, rampYears: 1, years: 3, discountRate: 0 }

test('freed time is split between capacity and cash, never counted twice', () => {
  const output = scenario(assumptions)
  assert.equal(output.rows[1].releasedFte, 5)
  assert.equal(output.rows[1].cashFte, 2)
  assert.equal(output.rows[1].capacityFte, 3)
  assert.equal(output.rows[1].netCash, 2e6)
  assert.equal(output.breakEvenYear, 2)
  assert.equal(output.npv, 3e6)
})
test('fully reinvested time does not fund a transition bill', () => {
  const output = scenario({ ...assumptions, cashShare: 0, ongoingCost: 1e6 })
  assert.equal(output.rows[1].capacityFte, 5)
  assert.equal(output.rows[1].netCash, -1e6)
  assert.equal(output.breakEvenYear, null)
  assert.equal(output.npv, -6e6)
})
test('ramp and discounting apply to annual cash flows, not to upfront cost', () => {
  const output = scenario({ ...assumptions, rampYears: 2, years: 2, discountRate: .1 })
  assert.equal(output.rows[1].staffCashSaving, 1e6)
  assert.equal(output.rows[2].staffCashSaving, 2e6)
  assert.ok(Math.abs(output.npv - (-3e6 + 1e6/1.1 + 2e6/1.1**2)) < 1e-8)
})
test('missing assumptions, impossible allocation and NaN are rejected', () => {
  assert.throws(() => scenario({ ...assumptions, cashShare: 1.1 }))
  assert.throws(() => scenario({ ...assumptions, years: 0 }))
  assert.throws(() => scenario({ ...assumptions, realization: NaN }))
  const missing = { ...assumptions }; delete missing.annualEmployerCost
  assert.throws(() => scenario(missing))
})
