import test from 'node:test'
import assert from 'node:assert/strict'
import { bridgeRows, bridgeSteps } from '../src/analyser/budget-bridge.js'
import { graphPlan } from '../src/analyser/chart-plan.js'
import { nextBudgetReport } from '../../scripts/analyser/budget-report.mjs'
const row = (id, department, before, after, name = 'Kapittel – Post') => ({ id, department, before, after, change: after - before, name, departmentName: department })
const report = { kind: 'budget-comparison', rows: [row('0100-01', '01', 10, 30), row('0100-70', '01', 20, 5), row('0101-01', '01', 0, 8), row('0200-01', '02', 50, 45)] }
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
test('main and nested bridges conserve the selected amounts without double counting', () => {
  for (const scope of [{}, { department: '01' }, { chapter: '0100' }]) {
    const { entries, total } = bridgeRows(report, scope)
    const bars = bridgeSteps(entries, total)
    near(entries.reduce((s, r) => s + r.change, 0), total)
    near(bars.at(-1).end, total)
    assert.equal(new Set(bars.map((b) => b.id)).size, bars.length)
  }
  assert.equal(bridgeRows(report).total, 8)
  assert.equal(bridgeRows(report, { department: '01' }).total, 13)
  assert.equal(bridgeRows(report, { chapter: '0100' }).total, 5)
})
test('explicit financing groups preserve the remainder and reject overlaps or wrong-scope posts', () => {
  const scope = { department: '01', groups: [{ label: 'Finansiering', recordKeys: ['0100-01', '0100-70'] }] }
  assert.deepEqual(bridgeRows(report, scope).entries.map((r) => r.change), [8, 5])
  assert.throws(() => bridgeRows(report, { groups: [{ label: 'A', recordKeys: ['0100-01'] }, { label: 'B', recordKeys: ['0100-01'] }] }), /dobbelt/)
  assert.throws(() => bridgeRows(report, { department: '01', groups: [{ label: 'Feil', recordKeys: ['0200-01'] }] }), /mangler/)
  assert.throws(() => bridgeRows(report, { chapter: '9999' }), /mangler/)
  assert.throws(() => graphPlan({ sections: [{}], graphs: [{ kind: 'budget-bridge', afterSection: 0, department: 'missing' }] }, report), /ukjent/)
})
test('small, all-negative and zero-net bridges retain the correct sum', () => {
  for (const changes of [[-1, -2, -3], [2, -2], [1], [0], Array.from({length: 20}, (_, i) => i - 10)]) {
    const entries = changes.map((change, i) => ({ id: String(i), label: 'Post', change })).sort((a, b) => b.change - a.change)
    const total = changes.reduce((s, v) => s + v, 0)
    const bars = bridgeSteps(entries, total)
    near(bars.reduce((s, r) => s + r.change, 0), total)
    assert.equal(new Set(bars.map((b) => b.id)).size, bars.length)
  }
})
test('actual 2027 bridges reconcile at department and chapter level to the frozen report', () => {
  const r = nextBudgetReport(new URL('../public/data/', import.meta.url).pathname, [], { baselineSeries: 'revidert' })
  near(bridgeRows(r).total, r.facts.absoluteChange.value)
  for (const department of new Set(r.rows.map((r) => r.department))) {
    const { entries, total } = bridgeRows(r, { department })
    near(bridgeSteps(entries, total).at(-1)?.end ?? 0, total)
    for (const chapter of new Set(r.rows.filter((r) => r.department === department).map((r) => r.id.slice(0, 4)))) {
      const scoped = bridgeRows(r, { department, chapter })
      near(bridgeSteps(scoped.entries, scoped.total).at(-1)?.end ?? 0, scoped.total)
    }
  }
})
