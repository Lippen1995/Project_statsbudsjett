import test from 'node:test'
import assert from 'node:assert/strict'
import { graphPlan, seriesGraph } from '../src/analyser/chart-plan.js'

const report = {
  kind: 'oil-funds',
  start: 2025,
  end: 2027,
  rows: [
    { year: 2025, nominal: 507.4, real: 545.7, fundPercent: 2.6 },
    { year: 2026, nominal: 583.4, real: 603.5, fundPercent: 2.7 },
    { year: 2027, nominal: 608.4, real: 608.4, fundPercent: 2.7 },
  ],
}

test('oil chart uses the frozen structural series and a declared price base', () => {
  const [graph] = graphPlan({ sections: [{}] }, report)
  const data = seriesGraph(graph, report)
  assert.deepEqual(data.years, [2025, 2026, 2027])
  assert.deepEqual(data.series[0].values, [507.4, 583.4, 608.4])
  assert.deepEqual(data.series[1].values, [545.7, 603.5, 608.4])
  assert.match(data.series[1].label, /2027-kroner/)
  assert.equal(data.unit, 'mrd. kr')
})

test('fund percentage gets its own axis and cannot mix with monetary values', () => {
  const graph = {
    kind: 'series', afterSection: 0, mode: 'values',
    series: [{ source: 'oil-funds', id: 'fundPercent' }],
  }
  assert.equal(seriesGraph(graph, report).unit, '%')
  assert.deepEqual(seriesGraph(graph, report).series[0].values, [2.6, 2.7, 2.7])
  assert.throws(() => seriesGraph({ ...graph, series: [
    ...graph.series, { source: 'oil-funds', id: 'nominal' },
  ] }, report), /Ulike enheter/)
  assert.throws(() => seriesGraph(graph, { ...report, kind: 'budget-comparison' }), /Ukjent seriehenvisning/)
})

test('oil report cannot silently render legacy per-capita charts or arbitrary data', () => {
  assert.throws(() => graphPlan({ sections: [{}], graphs: [
    { kind: 'growth', afterSection: 0 },
  ] }, report), /Ukjent graf/)
  const [graph] = graphPlan({ sections: [{}] }, report)
  assert.throws(() => graphPlan({ sections: [{}], graphs: [
    { ...graph, values: [1, 2, 3] },
  ] }, report), /egne verdier/)
  assert.throws(() => seriesGraph({ ...graph, series: [
    { source: 'oil-funds', id: 'transfer' },
  ] }, report), /Ukjent seriehenvisning/)
})
