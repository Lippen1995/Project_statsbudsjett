import test from 'node:test'
import assert from 'node:assert/strict'

import {
  choroplethColor,
  comparisonEntityIds,
  countyGroupName,
  displayEntityName,
  drillHistory,
  findKostraEntities,
  mapValue,
  materialBoundaryHistory,
  overviewComparisonRows,
  parseKostraRoute,
  populationForEntity,
  summarizeMunicipalities,
  summarizeKostraEntities,
  stateFlowSummary,
} from '../src/kostra/model.js'
import { SEKSJONER } from '../src/fellestall/design.js'
import { explorerDrillRows, explorerHistory, sortExplorerRows } from '../src/kostra/explorer.js'

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

test('utforsk-tabellen kan sorteres etter per innbygger og andel', () => {
  const rows = [
    { code: 'a', perCapita: 10, share: 80 },
    { code: 'b', perCapita: 30, share: 20 },
  ]
  assert.deepEqual(sortExplorerRows(rows, 'perCapita').map((row) => row.code), ['b', 'a'])
  assert.deepEqual(sortExplorerRows(rows, 'perCapita', 'asc').map((row) => row.code), ['a', 'b'])
  assert.deepEqual(sortExplorerRows(rows, 'share').map((row) => row.code), ['a', 'b'])
})

test('innebygd kommuneutforsker driller til dypeste tilgjengelige KOSTRA-nivå', () => {
  const detail = {
    latestYear: 2025,
    overview: {
      revenues: { 2025: { amount: 100, perCapita: 1_000 } },
      expenses: { 2025: { amount: 90, perCapita: 900 } },
      investments: { 2025: { amount: 20, perCapita: 200 } },
      debt: { 2025: { amount: 70, perCapita: 700 } },
    },
    services: [{ code: 'FG1', name: 'Tjeneste', metrics: {
      gross_expenses: { 2025: { amount: 40, perCapita: 400 } },
      investments: { 2025: { amount: 5, perCapita: 50 } },
    } }],
    functions: [{ code: '100', name: 'Funksjon', serviceCodes: ['FG1'], metrics: {
      gross_expenses: { 2025: { amount: 30, perCapita: 300 } },
      investments: { 2025: { amount: 4, perCapita: 40 } },
    } }],
    accountingArts: { 100: [{ code: 'A1', name: 'Art', amount: 10 }] },
    revenueBreakdown: [{ code: 'R1', name: 'Inntektsart', amount: 25 }],
  }

  assert.deepEqual(explorerDrillRows(detail, 2025, {}).map((row) => row.code), [
    'revenues', 'expenses', 'investments', 'debt',
  ])
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'expenses' })[0].code, 'FG1')
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'expenses', serviceCode: 'FG1' })[0].code, '100')
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'expenses', serviceCode: 'FG1', functionCode: '100' })[0].code, 'A1')
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'revenues' })[0].code, 'R1')
  assert.deepEqual(explorerDrillRows(detail, 2025, {
    metricId: 'investments', serviceCode: 'FG1', functionCode: '100',
  }), [])
  assert.deepEqual(explorerDrillRows(detail, 2025, { metricId: 'debt' }), [])

  assert.deepEqual(explorerHistory(detail, [2024, 2025], {
    metricId: 'expenses', serviceCode: 'FG1',
  }), {
    name: 'Tjeneste', points: [{ v: null }, { v: 40 }], fromZero: true,
  })
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

test('fylkesoversikten skiller fylkeskommunens regnskap fra summen av kommunene', () => {
  const index = {
    entities: [
      { id: 'county:46', kind: 'county' },
      { id: 'municipality:4601', kind: 'municipality', parent_id: 'county:46' },
      { id: 'municipality:4629', kind: 'municipality', parent_id: 'county:46' },
      { id: 'municipality:0301', kind: 'municipality', parent_id: 'county:03' },
    ],
    values: { revenues: { 2025: {
      'municipality:4601': { amount: 100, perCapita: 1_000 },
      'municipality:4629': { amount: 50, perCapita: 2_500 },
      'municipality:0301': { amount: 999, perCapita: 9_999 },
    } } },
  }

  assert.deepEqual(summarizeMunicipalities(index, 'revenues', 2025, ['county:46']), {
    amount: 150,
    perCapita: 1_250,
    population: 120,
    entities: 2,
    availableEntities: 2,
    complete: true,
    entityIds: ['municipality:4601', 'municipality:4629'],
  })
})

test('navn i fylkes- og kommunesøk er korte og entydige', () => {
  const entities = [
    { id: 'county:03', code: '0300', kind: 'county', active: true, name: 'Oslo kommune - Osloven tjïelte - Oslo suohkan - Oslo gielda' },
    { id: 'municipality:0301', code: '0301', kind: 'municipality', active: true, name: 'Oslo - Oslove', parent_id: 'county:03' },
    { id: 'county:46', code: '4600', kind: 'county', active: true, name: 'Vestland fylkeskommune' },
    { id: 'municipality:4601', code: '4601', kind: 'municipality', active: true, name: 'Bergen' },
    { id: 'municipality:1201', code: '1201', kind: 'municipality', active: 0, name: 'Bergen (-2019)' },
  ]

  assert.equal(displayEntityName(entities[0]), 'Oslo kommune')
  assert.equal(displayEntityName(entities[1]), 'Oslo kommune')
  assert.equal(countyGroupName(entities[2]), 'Vestland fylke')
  assert.equal(countyGroupName(entities[0]), 'Oslo kommune')
  assert.deepEqual(findKostraEntities(entities, 'bergen').map((entity) => entity.id), ['municipality:4601'])
  assert.deepEqual(findKostraEntities(entities, 'oslo').map((entity) => entity.id), ['county:03', 'municipality:0301'])
})

test('toppoversikten sammenligner fylkeskommunen med kommunesummen for alle hovedposter', () => {
  const index = {
    entities: [
      { id: 'county:46', kind: 'county' },
      { id: 'municipality:4601', kind: 'municipality', parent_id: 'county:46' },
      { id: 'municipality:4629', kind: 'municipality', parent_id: 'county:46' },
    ],
    values: Object.fromEntries([
      ['revenues', 1_000, 600],
      ['expenses', 900, 550],
      ['net_result', 100, 50],
      ['investments', 40, 30],
      ['debt', 500, 300],
      ['net_expenses', 700, 400],
    ].map(([metric, countyAmount, municipalityAmount]) => [metric, { 2025: {
      'county:46': { amount: countyAmount, perCapita: countyAmount },
      'municipality:4601': { amount: municipalityAmount * 0.75, perCapita: municipalityAmount * 1.5 },
      'municipality:4629': { amount: municipalityAmount * 0.25, perCapita: municipalityAmount * 0.5 },
    } }])),
  }

  const rows = overviewComparisonRows(index, 2025, ['county:46'])
  assert.deepEqual(rows.map((row) => row.id), [
    'revenues', 'expenses', 'net_result', 'investments', 'result_after_investments', 'debt', 'net_expenses',
  ])
  const derived = rows.find((row) => row.id === 'result_after_investments')
  assert.equal(derived.county.amount, 60)
  assert.equal(derived.municipalities.amount, 20)
  assert.equal(derived.county.perCapita, 60)
  assert.equal(derived.municipalities.perCapita, 20)
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

test('stat-kommune-oppsummering summerer bare komplette, adskilte pengestrommer', () => {
  const flows = {
    incoming: [{ code: 'state_block_grant', label: 'Rammetilskudd', values: {
      2025: { amount: 200, perCapita: 2_000 },
    } }],
    outgoing: [
      { code: 'member', label: 'Medlemsavgift', values: { 2025: { amount: 1_000, perCapita: 10_000 } } },
      { code: 'employer', label: 'Arbeidsgiveravgift', values: { 2025: { amount: 2_000, perCapita: 20_000 } } },
    ],
  }

  assert.deepEqual(stateFlowSummary(flows, 'incoming', 2025, 'amount'), {
    rows: [{ code: 'state_block_grant', label: 'Rammetilskudd', value: 200 }],
    total: 200,
    complete: true,
  })
  assert.equal(stateFlowSummary(flows, 'outgoing', 2025, 'perCapita').total, 30_000)
  assert.deepEqual(stateFlowSummary({ outgoing: [
    ...flows.outgoing,
    { code: 'missing', label: 'Mangler', values: {} },
  ] }, 'outgoing', 2025, 'amount'), {
    rows: [
      { code: 'member', label: 'Medlemsavgift', value: 1_000 },
      { code: 'employer', label: 'Arbeidsgiveravgift', value: 2_000 },
      { code: 'missing', label: 'Mangler', value: null },
    ],
    total: null,
    complete: false,
  })
})
