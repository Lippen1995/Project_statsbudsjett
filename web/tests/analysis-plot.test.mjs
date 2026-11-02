import test from 'node:test'
import assert from 'node:assert/strict'
import { plotScale, periodChange } from '../src/analyser/analysis-plot.js'
import { graphPlan } from '../src/analyser/chart-plan.js'
import { readFileSync } from 'node:fs'

test('focused line axes show small historical movements without changing points', () => {
  const values = [9639, 9775, 10453, 10330, 10390, 10649]
  const frozen = [...values]
  const focused = plotScale(values, false), zero = plotScale(values, true)
  assert.ok(focused.min > 0 && focused.min <= Math.min(...values))
  assert.ok(focused.max >= Math.max(...values))
  assert.equal(zero.min, 0)
  assert.deepEqual(values, frozen)
  for (const values of [[0, 0], [100, 100], [-5, -3], [.1, .2]]) {
    const s = plotScale(values, false)
    assert.ok(s.max > s.min)
    assert.ok(s.ticks.every(Number.isInteger))
    assert.equal(s.ticks.length, new Set(s.ticks).size)
  }
})
test('graph selection accepts deliberate line scales but never cropped bars or supplied bounds', () => {
  const articles = JSON.parse(readFileSync(new URL('../src/analyser/publications.json', import.meta.url)))
  const a = articles.find(a => a.report.kind === 'real-expenditure-per-capita')
  const g = { kind:'series', afterSection:0, mode:'values', series:[{source:'fellestall',id:'realPerCapita'}],chartType:'line',axis:'focused' }
  assert.doesNotThrow(() => graphPlan({...a.copy,graphs:[{...g,annotation:'period-change'}]},a.report))
  assert.throws(() => graphPlan({...a.copy,graphs:[{...g,annotation:'annualized'}]},a.report),/Ukjent grafpil/)
  assert.throws(() => graphPlan({...a.copy,graphs:[{...g,chartType:'bar'}]},a.report),/stolper starter i null/)
  assert.throws(() => graphPlan({...a.copy,graphs:[{...g,min:9999}]},a.report),/egne verdier/)
})

test('period arrows show total growth, and do not invent growth from nonpositive bases', () => {
  assert.ok(Math.abs(periodChange([100, 110, 90, 120]) - 20) < 1e-10)
  assert.equal(periodChange([100, 50]), -50)
  assert.equal(periodChange([100, 100]), 0)
  assert.equal(periodChange([0, 20]), null)
  assert.equal(periodChange([-10, 20]), null)
  assert.equal(periodChange([100]), null)
  assert.equal(periodChange([100, NaN]), null)
})
