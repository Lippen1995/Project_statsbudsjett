import test from 'node:test'
import assert from 'node:assert/strict'

import {
  choroplethColor,
  comparisonEntityIds,
  drillHistory,
  mapValue,
  materialBoundaryHistory,
  parseKostraRoute,
  populationForEntity,
  summarizeKostraEntities,
} from '../src/kostra/model.js'
import { SEKSJONER } from '../src/fellestall/design.js'

test('KOSTRA-kartet ligger på hovedsiden rett under Utforsk staten', () => {
  const utforsk = SEKSJONER.findIndex((section) => section.id === 'utforsk')
  assert.equal(SEKSJONER[utforsk].navn, 'Utforsk staten')
  assert.equal(SEKSJONER[utforsk + 1].id, 'kommuner')
})

test('KOSTRA-ruter skiller fylkesdrill fra detaljsider', () => {
  assert.deepEqual(parseKostraRoute('#kostra'), { page: 'map', countyCode: null })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03'), { page: 'map', countyCode: '03' })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03/detaljer'), { page: 'detail', kind: 'county', code: '0300' })
  assert.deepEqual(parseKostraRoute('#kostra/kommune/0301'), { page: 'detail', kind: 'municipality', code: '0301' })
})

test('sammenligningsgrunnlag brukes bare for per-innbyggerverdier', () => {
  const comparisons = { peerGroupEntityId: 'peer:12', norwayEntityId: 'country:no' }
  assert.deepEqual(comparisonEntityIds('municipality:4601', comparisons, 'perCapita'), [
    'municipality:4601', 'peer:12', 'country:no',
  ])
  assert.deepEqual(comparisonEntityIds('municipality:4601', comparisons, 'amount'), ['municipality:4601'])
})

test('sammenligningsgrunnlag kan vise utledet innbyggertall', () => {
  const index = { values: { revenues: { 2025: {
    'municipality:4601': { amount: 31_632_251, perCapita: 107_279 },
  } } } }
  assert.equal(populationForEntity(index, 2025, 'municipality:4601'), 294_860)
})

test('drilldown-historikk følger total, tjenesteområde og KOSTRA-funksjon', () => {
  const detail = {
    overview: { net_expenses: { 2024: { amount: 100 }, 2025: { amount: 120 } } },
    services: [{
      code: 'FGK8b', name: 'Grunnskole',
      metrics: { net_expenses: { 2024: { amount: 40 }, 2025: { amount: 50 } } },
    }],
    functions: [{
      code: '202', name: 'Grunnskole',
      metrics: { net_expenses: { 2024: { amount: -30 }, 2025: { amount: 35 } } },
    }],
  }

  assert.deepEqual(drillHistory(detail, [2024, 2025, 2026], null, null), {
    name: 'Netto driftsutgifter totalt',
    points: [{ v: 100 }, { v: 120 }, { v: null }],
    latestValue: 120,
    fromZero: true,
  })
  assert.deepEqual(drillHistory(detail, [2024, 2025], 'FGK8b', null), {
    name: 'Grunnskole', points: [{ v: 40 }, { v: 50 }], latestValue: 50, fromZero: true,
  })
  assert.deepEqual(drillHistory(detail, [2024, 2025], 'FGK8b', '202'), {
    name: 'Grunnskole', points: [{ v: -30 }, { v: 35 }], latestValue: 35, fromZero: false,
  })
})

test('bare faktiske grenseendringer varsles som brudd i tidsserien', () => {
  const changes = [
    { relationType: 'exact_successor', sourceCode: '1201', targetCode: '4601' },
    { relationType: 'boundary_change', sourceCode: '0104', targetCode: '3002' },
  ]
  assert.deepEqual(materialBoundaryHistory(changes), [changes[1]])
})

test('kartverdi velger beløp eller per innbygger uten å tolke null som null kroner', () => {
  const index = { values: { expenses: { 2025: { 'municipality:0301': { amount: 12.5, perCapita: 44 } } } } }
  assert.equal(mapValue(index, 'expenses', 2025, 'municipality:0301', 'amount'), 12.5)
  assert.equal(mapValue(index, 'expenses', 2025, 'municipality:0301', 'perCapita'), 44)
  assert.equal(mapValue(index, 'expenses', 2024, 'municipality:0301', 'amount'), null)
})

test('kartsammendrag summerer beløp og vekter per innbygger med folketallet', () => {
  const index = { values: {
    revenues: { 2025: {
      a: { amount: 100_000, perCapita: 1_000 },
      b: { amount: 300_000, perCapita: 1_500 },
    } },
    expenses: { 2025: {
      a: { amount: 120_000, perCapita: 1_200 },
      b: { amount: 360_000, perCapita: 1_800 },
    } },
  } }

  assert.deepEqual(summarizeKostraEntities(index, 'expenses', 2025, ['a', 'b']), {
    amount: 480_000,
    perCapita: 1_600,
    population: 300_000,
    entities: 2,
    availableEntities: 2,
    complete: true,
  })
  assert.deepEqual(summarizeKostraEntities(index, 'expenses', 2025, ['a']), {
    amount: 120_000,
    perCapita: 1_200,
    population: 100_000,
    entities: 1,
    availableEntities: 1,
    complete: true,
  })
  assert.deepEqual(summarizeKostraEntities(index, 'expenses', 2025, ['a', 'missing']), {
    amount: null,
    perCapita: null,
    population: null,
    entities: 2,
    availableEntities: 1,
    complete: false,
  })
})

test('kartsammendrag beholder innbyggertall selv om valgt nøkkeltall mangler', () => {
  const index = { values: {
    revenues: { 2025: { a: { amount: 100_000, perCapita: 1_000 } } },
    service_health: { 2025: {} },
  } }

  assert.deepEqual(summarizeKostraEntities(index, 'service_health', 2025, ['a']), {
    amount: null,
    perCapita: null,
    population: 100_000,
    entities: 1,
    availableEntities: 0,
    complete: false,
  })
})

test('koropletfarge har egen mangler-data-farge og fem lesbare trinn', () => {
  const values = [10, 20, 30, 40, 50]
  assert.equal(choroplethColor(null, values), '#E3DED4')
  assert.notEqual(choroplethColor(10, values), choroplethColor(50, values))
})
