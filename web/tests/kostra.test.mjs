import test from 'node:test'
import assert from 'node:assert/strict'

import {
  choroplethColor,
  blockGrantCalculationSummary,
  comparisonEntityIds,
  countyGroupName,
  displayEntityName,
  drillHistory,
  findKostraEntities,
  incomeEqualizationSummary,
  incomeEqualizationMapSummary,
  incomeEqualizationPoint,
  incomeEqualizationColor,
  municipalityCodeStatus,
  mapValue,
  materialBoundaryHistory,
  municipalityOverviewRows,
  overviewComparisonRows,
  parseKostraRoute,
  populationForEntity,
  summarizeMunicipalities,
  summarizeKostraEntities,
  shouldScrollToKostra,
  stateFlowSummary,
  yearlyGrowth,
} from '../src/kostra/model.js'
import { SEKSJONER } from '../src/fellestall/design.js'
import {
  accountingArtFunctionBreakdown,
  accountingArtBreakdown,
  explorerDrillRows,
  explorerHistory,
  explorerRowsWithShares,
  sortExplorerRows,
} from '../src/kostra/explorer.js'

test('KOSTRA-kartet ligger på hovedsiden rett under Utforsk staten', () => {
  const utforsk = SEKSJONER.findIndex((section) => section.id === 'utforsk')
  assert.equal(SEKSJONER[utforsk].navn, 'Utforsk staten')
  assert.equal(SEKSJONER[utforsk + 1].id, 'kommuner')
})

test('KOSTRA-ruter skiller fylkesdrill fra detaljsider', () => {
  assert.deepEqual(parseKostraRoute('#kostra'), { page: 'map', countyCode: null })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03'), { page: 'map', countyCode: '03' })
  assert.deepEqual(parseKostraRoute('#kostra/fylke/03/detaljer'), { page: 'detail', kind: 'county', code: '0300' })
  assert.deepEqual(parseKostraRoute('#kostra/kommune/0301'), {
    page: 'map', countyCode: '03', municipalityCode: '0301',
  })
  assert.deepEqual(parseKostraRoute('#kostra/kommune/0104/detaljer'), {
    page: 'detail', kind: 'municipality', code: '0104',
  })
})

test('historiske kommunekoder beholder detaljsiden mens aktive kommuner bruker kartet', () => {
  const index = {
    entities: [{ id: 'municipality:1103' }],
    historicalEntities: [{ id: 'municipality:0104' }],
  }
  assert.equal(municipalityCodeStatus(index, '0104'), 'historical')
  assert.equal(municipalityCodeStatus(index, '1103'), 'active')
  assert.equal(municipalityCodeStatus(index, '9999'), 'unknown')
})

test('intern navigasjon i KOSTRA beholder skjermposisjonen', () => {
  assert.equal(shouldScrollToKostra(null, '#kostra/fylke/46'), true)
  assert.equal(shouldScrollToKostra('#utforsk', '#kostra/fylke/46'), true)
  assert.equal(shouldScrollToKostra('#kommuner', '#kostra/fylke/46'), false)
  assert.equal(shouldScrollToKostra('#kostra/fylke/46', '#kostra/kommune/4601'), false)
  assert.equal(shouldScrollToKostra('#kostra/kommune/4601', '#kostra'), false)
  assert.equal(shouldScrollToKostra('', '#kostra/fylke/46', true), false)
  assert.equal(shouldScrollToKostra('', '#kostra/fylke/46', false), true)
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

test('årlig vekst er annualisert sammensatt vekst, mens Y/Y bruker foregående år', () => {
  const years = [2022, 2023, 2024, 2025]
  const points = [{ v: 80 }, { v: null }, { v: 100 }, { v: 112 }]

  const latest = yearlyGrowth(points, years, 2025)
  assert.equal(Math.round(latest.annual * 1000) / 1000, 11.869)
  assert.equal(latest.yoy, 12)
  const before = yearlyGrowth(points, years, 2024)
  assert.equal(Math.round(before.annual * 1000) / 1000, 11.803)
  assert.equal(before.yoy, null)
  assert.deepEqual(yearlyGrowth([{ v: 0 }, { v: 10 }], [2024, 2025], 2025), {
    annual: null, yoy: null,
  })
  assert.deepEqual(yearlyGrowth([{ v: -100 }, { v: -50 }], [2024, 2025], 2025), {
    annual: null, yoy: null,
  })
})

test('eksplisitt manglende artsandel blir ikke beregnet fra et ufullstendig grunnlag', () => {
  const rows = explorerRowsWithShares([
    { code: 'art', amount: 10, share: null },
    { code: 'service', amount: 30 },
  ])
  assert.equal(rows[0].share, null)
  assert.equal(rows[1].share, 75)
})

test('inntekts- og utgiftsarter kan drilles til avstembare KOSTRA-funksjoner', () => {
  const detail = {
    latestYear: 2025,
    overview: { expenses: { 2025: { amount: 100, perCapita: 1_000 } } },
    expenseBreakdown: [{ code: 'AG16', name: 'Lønn', amount: 28 }],
    functions: [
      { code: '202', name: 'Grunnskole', serviceCodes: ['FGK8b'] },
      { code: '120', name: 'Administrasjon', serviceCodes: ['FGK1b'] },
      { code: '999', name: 'Ikke rapportert', serviceCodes: [] },
      { code: '000', name: 'Rapportert null', serviceCodes: [] },
    ],
    accountingArts: {
      202: [{ code: 'AG16', name: 'Lønn', values: { 2025: { amount: 30 } } }],
      120: [{ code: 'AG16', name: 'Lønn', values: { 2025: { amount: -2 } } }],
      999: [{ code: 'AG16', name: 'Lønn', values: { 2024: { amount: 8 } } }],
      '000': [{ code: 'AG16', name: 'Lønn', values: { 2025: { amount: 0 } } }],
    },
  }

  const result = accountingArtFunctionBreakdown(detail, 2025, 'AG16')
  assert.deepEqual(result.rows.map((row) => row.code), ['202', '120', '000'])
  assert.equal(result.rows[0].perCapita, 300)
  assert.equal(result.rows[0].share, 30 / 28 * 100)
  assert.equal(result.rows[1].share, -2 / 28 * 100)
  assert.deepEqual(result.summation, {
    functionTotal: 28,
    breakdownTotal: 28,
    difference: 0,
    status: 'matches',
  })

  const incomplete = accountingArtFunctionBreakdown({
    ...detail,
    expenseBreakdown: [{ code: 'AG16', name: 'Lønn', amount: 30 }],
  }, 2025, 'AG16')
  assert.equal(incomplete.summation.status, 'difference')
  assert.equal(incomplete.summation.difference, -2)
  assert.deepEqual(accountingArtFunctionBreakdown(detail, 2024, 'AG16').summation, {
    functionTotal: 8,
    breakdownTotal: null,
    difference: null,
    status: 'no-summary',
  })
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
    accountingArts: { 100: [
      { code: 'AG16', name: 'Lønn', values: { 2024: { amount: 8 }, 2025: { amount: 10 } } },
      { code: 'AGD50', name: 'Varer og tjenester', values: { 2025: { amount: 20 } } },
      { code: 'AGD51', name: 'Tjenester som erstatter egen produksjon', values: { 2025: { amount: -2 } } },
      { code: 'AG34', name: 'Overføringsutgifter', values: { 2024: { amount: 0 }, 2025: { amount: 0 } } },
      { code: 'A590', name: 'Avskrivninger', values: { 2024: { amount: 0 }, 2025: { amount: 0 } } },
      { code: 'AGD10', name: 'Brutto driftsutgifter', values: { 2024: { amount: 8 }, 2025: { amount: 28 } } },
      { code: 'A260', name: 'Renhold', values: { 2025: { amount: 5 } } },
    ] },
    revenueBreakdown: [{ code: 'R1', name: 'Inntektsart', amount: 25 }],
  }

  assert.deepEqual(explorerDrillRows(detail, 2025, {}).map((row) => row.code), [
    'revenues', 'expenses', 'investments', 'debt',
  ])
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'expenses' })[0].code, 'FG1')
  assert.equal(explorerDrillRows(detail, 2025, { metricId: 'expenses', serviceCode: 'FG1' })[0].code, '100')
  const artRows = explorerDrillRows(detail, 2025, {
    metricId: 'expenses', serviceCode: 'FG1', functionCode: '100',
  })
  assert.deepEqual(artRows.map((row) => row.code), ['AG16', 'AGD50', 'AGD51', 'AG34', 'A590'])
  assert.equal(artRows[0].perCapita, 100)
  assert.equal(artRows[0].clickable, false)
  assert.equal(artRows[2].share, -2 / 28 * 100)
  assert.deepEqual(explorerDrillRows(detail, 2024, {
    metricId: 'expenses', serviceCode: 'FG1', functionCode: '100',
  }).map((row) => row.code), ['AG16', 'AG34', 'A590'])
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

  assert.deepEqual(accountingArtBreakdown(detail, 2025, '100').reconciliation, {
    componentTotal: 28,
    functionTotal: 28,
    difference: 0,
    status: 'reconciled',
  })
  assert.deepEqual(accountingArtBreakdown({
    latestYear: 2025,
    accountingArts: { 100: [{ code: 'AGD10', name: 'Total', values: { 2025: { amount: 30 } } }] },
  }, 2025, '100').reconciliation, {
    componentTotal: null,
    functionTotal: 30,
    difference: null,
    status: 'incomplete-components',
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
    overview: { net_expenses: { 2024: { amount: 100, perCapita: 1_000 }, 2025: { amount: 120, perCapita: 1_100 } } },
    services: [{
      code: 'FGK8b', name: 'Grunnskole',
      metrics: { net_expenses: { 2024: { amount: 40, perCapita: 400 }, 2025: { amount: 50, perCapita: 450 } } },
    }],
    functions: [{
      code: '202', name: 'Grunnskole',
      metrics: { net_expenses: { 2024: { amount: -30, perCapita: -300 }, 2025: { amount: 35, perCapita: 320 } } },
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
  assert.deepEqual(drillHistory(detail, [2024, 2025], 'FGK8b', '202', 'perCapita'), {
    name: 'Grunnskole', points: [{ v: -300 }, { v: 320 }], latestValue: 320, fromZero: false,
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

test('kommuneoversikten viser bare den valgte kommunens hovedposter', () => {
  const index = {
    values: Object.fromEntries([
      ['revenues', 1_000, 9_999],
      ['expenses', 900, 9_999],
      ['net_result', 100, 9_999],
      ['investments', 40, 9_999],
      ['debt', 500, 9_999],
      ['net_expenses', 700, 9_999],
    ].map(([metric, stavangerAmount, otherAmount]) => [metric, { 2025: {
      'municipality:1103': { amount: stavangerAmount, perCapita: stavangerAmount * 10 },
      'municipality:1101': { amount: otherAmount, perCapita: otherAmount },
    } }])),
  }

  const rows = municipalityOverviewRows(index, 2025, 'municipality:1103')
  assert.deepEqual(rows.map((row) => row.id), [
    'revenues', 'expenses', 'net_result', 'investments', 'result_after_investments', 'debt', 'net_expenses',
  ])
  assert.equal(rows.find((row) => row.id === 'expenses').summary.amount, 900)
  assert.equal(rows.find((row) => row.id === 'result_after_investments').summary.amount, 60)
  assert.equal(rows.find((row) => row.id === 'result_after_investments').summary.perCapita, 600)
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

test('inntektsutjevning skiller bidragsyter fra mottaker og sammenligner frie inntekter', () => {
  const incomeEqualization = { values: { 2025: {
    population: 150_123,
    taxBefore: { amount: 8_077_728, perCapita: 53_807, nationalRatio: 1.273 },
    equalization: { amount: -1_130_664, perCapita: -7_532 },
    taxAfter: { amount: 6_947_063, perCapita: 46_276, nationalRatio: 1.095 },
    sourceUrl: 'https://www.regjeringen.no/', sourcePeriod: '2025',
  } } }
  const stateFlows = { incoming: [{ code: 'state_block_grant', values: {
    2025: { amount: 3_522_177, perCapita: 23_223 },
  } }] }
  const normalizedBlockGrant = 3_522_177 * 1000 / 150_123

  assert.deepEqual(incomeEqualizationSummary(incomeEqualization, stateFlows, 2025, 'perCapita'), {
    year: 2025,
    population: 150_123,
    taxBefore: 53_807,
    equalization: -7_532,
    taxAfter: 46_276,
    blockGrant: normalizedBlockGrant,
    blockGrantBeforeEqualization: normalizedBlockGrant + 7_532,
    taxAndBlockGrant: 53_807 + normalizedBlockGrant,
    taxBeforeNationalRatio: 1.273,
    taxAfterNationalRatio: 1.095,
    equalizationStatus: 'contributor',
    freeIncomeSource: 'own_tax',
    sourceUrl: 'https://www.regjeringen.no/',
    sourcePeriod: '2025',
  })
  assert.equal(
    incomeEqualizationSummary({ values: { 2025: {
      taxBefore: { amount: 100 }, equalization: { amount: 20 }, taxAfter: { amount: 120 },
    } } }, stateFlows, 2025, 'amount').equalizationStatus,
    'recipient',
  )
  assert.equal(incomeEqualizationSummary(incomeEqualization, stateFlows, 2024, 'amount'), null)
  assert.equal(incomeEqualizationSummary({ values: { 2025: {
    taxBefore: { amount: 90, perCapita: 900 },
    equalization: { amount: 10, perCapita: 100 },
    taxAfter: { amount: 100, perCapita: 1_000 },
  } } }, { incoming: [{ code: 'state_block_grant', values: {
    2025: { amount: 110, perCapita: 800 },
  } }] }, 2025, 'perCapita').freeIncomeSource, 'block_grant')
})

test('rammetilskuddet avstemmes fra Grønt hefte til faktisk bokført beløp uten dobbel utjevning', () => {
  const calculation = { values: { 2025: {
    basis: 'budget', sourceUrl: 'https://www.regjeringen.no/gront-hefte/', components: [
      { code: 'base_per_resident', amount: 4_703_088, perCapita: 31_328 },
      { code: 'expense_equalization', amount: -551_306, perCapita: -3_672 },
      { code: 'budgeted_block_grant_before_income_equalization', amount: 4_335_570, perCapita: 28_881 },
    ],
  } } }
  const incomeSummary = { equalization: -1_130_664, blockGrant: 3_522_177 }

  assert.deepEqual(blockGrantCalculationSummary(calculation, incomeSummary, 2025, 'amount'), {
    components: [
      { code: 'base_per_resident', amount: 4_703_088, value: 4_703_088 },
      { code: 'expense_equalization', amount: -551_306, value: -551_306 },
    ],
    budgetedBeforeEqualization: 4_335_570,
    equalization: -1_130_664,
    budgetedAfterEqualization: 3_204_906,
    reportedBlockGrant: 3_522_177,
    reconciliation: 317_271,
    sourceUrl: 'https://www.regjeringen.no/gront-hefte/',
    basis: 'budget',
  })
})

test('nasjonal inntektsutjevning skiller mottak, trekk og avvik uten å nettosummere bort omfordelingen', () => {
  const index = { incomeEqualization: { 2025: {
    'municipality:1': {
      population: 100,
      taxBefore: { amount: 1_000, perCapita: 10_000, nationalRatio: 1.2 },
      equalization: { amount: -200, perCapita: -2_000 },
      taxAfter: { amount: 800, perCapita: 8_000, nationalRatio: .96 },
    },
    'municipality:2': {
      population: 200,
      taxBefore: { amount: 1_000, perCapita: 5_000, nationalRatio: .6 },
      equalization: { amount: 190, perCapita: 950 },
      taxAfter: { amount: 1_190, perCapita: 5_950, nationalRatio: .714 },
    },
    'municipality:3': {
      population: 50,
      taxBefore: { amount: 400, perCapita: 8_000, nationalRatio: .96 },
      equalization: { amount: 0, perCapita: 0 },
      taxAfter: { amount: 400, perCapita: 8_000, nationalRatio: .96 },
    },
  } } }
  const ids = ['municipality:1', 'municipality:2', 'municipality:3', 'municipality:4']

  assert.equal(incomeEqualizationPoint(index, 2025, 'municipality:1').status, 'contributor')
  assert.deepEqual(incomeEqualizationMapSummary(index, 2025, ids), {
    receivedAmount: null,
    contributedAmount: null,
    differenceAmount: null,
    recipients: 1,
    contributors: 1,
    neutral: 1,
    availableEntities: 3,
    entities: 4,
    population: 350,
    complete: false,
  })
  assert.equal(
    incomeEqualizationMapSummary(index, 2024, ['municipality:1']).population,
    null,
  )
  assert.deepEqual(
    incomeEqualizationMapSummary(index, 2025, ids.slice(0, 3)),
    {
      receivedAmount: 190,
      contributedAmount: 200,
      differenceAmount: -10,
      recipients: 1,
      contributors: 1,
      neutral: 1,
      availableEntities: 3,
      entities: 3,
      population: 350,
      complete: true,
    },
  )
})

test('inntektsutjevningskartet bruker to sider av null og egen farge for manglende data', () => {
  const values = [-100, -20, 0, 30, 200]
  assert.equal(incomeEqualizationColor(null, values), '#E3DED4')
  assert.notEqual(incomeEqualizationColor(-100, values), incomeEqualizationColor(100, values))
  assert.notEqual(incomeEqualizationColor(0, values), incomeEqualizationColor(30, values))
})
