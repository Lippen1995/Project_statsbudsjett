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
  incomeSystemTableColumns,
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
import {
  statementDrill,
  statementView,
} from '../src/kostra/statements.js'

test('resultatoppstillingen bruker gjensidig utelukkende KOSTRA-linjer og avstemmer subtotalene', () => {
  const values = Object.fromEntries([
    ['AGD75', 100], ['A800', 80], ['AG10', 20], ['AGD76', 5],
    ['AGD77', 15], ['AGD78', 10], ['A600', 30], ['AGD96', 40], ['AGD45', 300],
    ['AG15', 90], ['AG35', 20], ['AG17', 50], ['AGD51', 30], ['AGD80', 10],
    ['A590', 10], ['AGD46', 210], ['AGD65', 90], ['AGD79', 5], ['AGD81', 2],
    ['AGD83', -1], ['AGD82', 8], ['AG5', 4], ['AGD85', 6], ['AGD87', 10],
    ['AGD84', 0], ['AGD89', 94],
  ].map(([code, amount]) => [code, {
    code, name: code, sourceTable: '13551', values: { 2025: { amount, perCapita: amount * 10 } },
  }]))
  const detail = { statementData: { result: values, investment: {}, balance: {} } }

  const view = statementView(detail, 'result', 2025, 'amount')

  assert.equal(view.id, 'result')
  assert.equal(view.sections[0].rows.at(-1).id, 'total_operating_revenue')
  assert.equal(view.sections[0].rows.at(-1).value, 300)
  assert.deepEqual(view.reconciliations.operating_revenue, {
    componentTotal: 300, reportedTotal: 300, difference: 0, status: 'reconciled',
  })
  assert.deepEqual(view.reconciliations.operating_expense, {
    componentTotal: 210, reportedTotal: 210, difference: 0, status: 'reconciled',
  })
  assert.equal(view.sections[2].rows.at(-1).id, 'net_operating_result')
  assert.equal(view.sections[2].rows.at(-1).value, 94)
})

test('resultatoppstillingen starter overordnet og holder avdrag utenfor resultatet', () => {
  const values = Object.fromEntries([
    ['AGD45', 300], ['AGD46', 210], ['AGD65', 90], ['AGD79', 5], ['AGD81', 2],
    ['AGD83', -1], ['AGD82', 8], ['AGD85', 6], ['AGD89', 94], ['AG5', 4],
  ].map(([code, amount]) => [code, {
    code, name: code, sourceTable: '13551', values: { 2025: { amount, perCapita: amount * 10 } },
  }]))
  const detail = { statementData: { result: values, investment: {}, balance: {} } }

  const view = statementView(detail, 'result', 2025, 'amount')

  assert.deepEqual(view.overviewRows.map((row) => [row.id, row.label, row.value]), [
    ['operating_revenue', 'Inntekter', 300],
    ['operating_expense', 'Driftskostnader', 210],
    ['gross_operating_result', 'Bruttoresultat', 90],
    ['net_finance_expense', 'Netto finans', -2],
    ['net_operating_result', 'Nettoresultat', 88],
  ])
  assert.deepEqual(view.overviewRows[1].availableDimensions, ['line', 'service', 'function', 'art'])
  assert.equal(view.sections.flatMap((section) => section.rows).some((row) => row.id === 'loan_repayments'), false)
})

test('balansen bruker balansekapitler og tilbyr ikke en sektor som SSB-tabellen mangler', () => {
  const values = Object.fromEntries([
    ['KG43', 400], ['KG44', 100], ['KG46', 50], ['KG48', 20], ['KG50', 30],
    ['KG52', 80], ['KG53', 10], ['KG58', 60], ['KG62', 750],
    ['KG65', 40], ['KG66', 20], ['KG69', 10], ['KG73', 180], ['KG82', 200],
    ['KG78', 180], ['KG79', 40], ['KG81', 20], ['KG85', 30], ['KG88', 30], ['KG90', 750],
  ].map(([code, amount]) => [code, {
    code, name: code, sourceTable: '13202', values: { 2025: { amount, perCapita: amount * 10 } },
  }]))
  const detail = { statementData: { result: {}, investment: {}, balance: values } }

  const view = statementView(detail, 'balance', 2025, 'amount')
  const longTermDebt = view.sections.flatMap((section) => section.rows)
    .find((row) => row.id === 'long_term_debt')

  assert.equal(view.sections[0].rows.at(-1).id, 'total_assets')
  assert.deepEqual(longTermDebt.availableDimensions, ['balance_chapter'])
  assert.equal(longTermDebt.availableDimensions.includes('sector'), false)
  assert.deepEqual(view.reconciliations.balance, {
    componentTotal: 750, reportedTotal: 750, difference: 0, status: 'reconciled',
  })
})

test('balansen kan drilles fra hovedlinje via regnskapslinje eller balansekapittel', () => {
  const item = (code, amount) => ({ code, name: code, sourceTable: '13202', values: { 2025: { amount } } })
  const detail = { statementData: { result: {}, investment: {}, balance: {
    KG43: item('KG43', 70), KG44: item('KG44', 30), KG62: item('KG62', 105),
    KG41: item('KG41', 105), KG51: item('KG51', 0), KG47: item('KG47', 0),
    KG49: item('KG49', 5),
  } } }
  const view = statementView(detail, 'balance', 2025, 'amount')

  assert.deepEqual(view.overviewRows.map((row) => row.label), ['Eiendeler', 'Egenkapital og gjeld'])
  assert.deepEqual(view.overviewRows[0].availableDimensions, ['line', 'balance_chapter'])

  const linesFirst = statementDrill(detail, {
    statementId: 'balance', lineId: 'assets', dimensions: ['line', 'balance_chapter'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.deepEqual(linesFirst.rows.map((row) => [row.code, row.value]), [
    ['fixed_property', 70], ['equipment', 30], ['other_noncurrent_assets', 5],
  ])

  const chaptersFirst = statementDrill(detail, {
    statementId: 'balance', lineId: 'assets', dimensions: ['balance_chapter', 'line'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.deepEqual(chaptersFirst.rows.map((row) => [row.code, row.value]), [
    ['KG43', 70], ['KG44', 30], ['KG49', 5], ['KG47', 0],
  ])
  assert.equal(linesFirst.activeTotal, chaptersFirst.activeTotal)

  const incompleteComposite = statementDrill(detail, {
    statementId: 'balance', lineId: 'assets', dimensions: ['line', 'balance_chapter'],
    selections: { line: 'other_noncurrent_assets' }, year: 2025, mode: 'amount',
  })
  assert.equal(incompleteComposite.reconciliation.status, 'incomplete')
  assert.match(incompleteComposite.coverageNote, /mangler/i)
})

test('kontantstrømmen er beregnet og avstemmes uten å skjule forskjellen mot bankbevegelsen', () => {
  const series = (sourceTable, points) => Object.fromEntries(
    Object.entries(points).map(([code, years]) => [code, { code, name: code, sourceTable, values: years }]),
  )
  const detail = {
    overview: { revenues: { 2025: { amount: 300, perCapita: 3000 } } },
    statementData: {
      result: series('13551', {
        AGD75: { 2025: { amount: 100 } }, A800: { 2025: { amount: 80 } },
        AG10: { 2025: { amount: 20 } }, AGD76: { 2025: { amount: 5 } },
        A600: { 2025: { amount: 30 } }, AGD96: { 2025: { amount: 40 } },
        AGD77: { 2025: { amount: 15 } }, AGD78: { 2025: { amount: 10 } },
        AG15: { 2025: { amount: 90 } }, AG35: { 2025: { amount: 20 } },
        AG17: { 2025: { amount: 50 } }, AGD51: { 2025: { amount: 30 } },
        AGD80: { 2025: { amount: 10 } }, AGD79: { 2025: { amount: 5 } },
        AGD82: { 2025: { amount: 8 } },
      }),
      investment: series('13552', {
        AGI39: { 2025: { amount: 50 } }, AGI44: { 2025: { amount: 10 } },
        AGI40: { 2025: { amount: 0 } }, AGI41: { 2025: { amount: 0 } },
        AGI42: { 2025: { amount: 0 } }, 929: { 2025: { amount: 0 } },
        AGI45: { 2025: { amount: 0 } }, AGI46: { 2025: { amount: 0 } },
        AGI17: { 2025: { amount: 20 } }, AG5: { 2025: { amount: 10 } },
      }),
      balance: series('13202', {
        KG52: { 2024: { amount: 100 }, 2025: { amount: 140 } },
      }),
    },
  }

  const view = statementView(detail, 'cashflow', 2025, 'amount')

  assert.equal(view.calculated, true)
  assert.equal(view.sections[0].rows.at(-1).id, 'operating_cashflow')
  assert.equal(view.sections[0].rows.at(-1).value, 97)
  assert.equal(view.sections[3].rows.find((row) => row.id === 'net_cashflow').value, 67)
  assert.deepEqual(view.reconciliations.cash, {
    componentTotal: 67, reportedTotal: 40, difference: 27, status: 'difference',
  })
  assert.match(view.note, /beregnet fra rapportert KOSTRA-regnskap/i)

  delete detail.statementData.investment.AGI40
  const incomplete = statementView(detail, 'cashflow', 2025, 'amount')
  assert.equal(incomplete.sections[1].rows.at(-1).value, null)
  assert.equal(incomplete.sections[3].rows.find((row) => row.id === 'net_cashflow').value, null)
})

test('kontantstrømmen kan drilles via regnskapslinje og tilgjengelige KOSTRA-dimensjoner', () => {
  const series = (sourceTable, points) => Object.fromEntries(
    Object.entries(points).map(([code, amount]) => [code, { code, name: code, sourceTable, values: { 2025: { amount } } }]),
  )
  const detail = {
    overview: { expenses: { 2025: { amount: 100, perCapita: 1_000 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }],
    functions: [{ code: '202', name: 'Grunnskole', serviceCodes: ['FG1'], metrics: { investments: { 2025: { amount: 50 } } } }],
    accountingArts: { 202: [
      { code: 'A600', name: 'Brukerbetalinger', values: { 2025: { amount: 10 } } },
      { code: 'AGD34', name: 'Salgsinntekter', values: { 2025: { amount: 5 } } },
      { code: 'AG16', name: 'Lønn', values: { 2025: { amount: 20 } } },
      { code: 'A710', name: 'Sykelønnsrefusjon', values: { 2025: { amount: 2 } } },
    ] },
    statementData: {
      result: series('13551', {
        AGD75: 100, A800: 80, AG10: 20, AGD76: 5, A600: 10, AGD96: 5,
        AGD77: 15, AGD78: 10, AG15: 22, AG35: 0, AG17: 0, AGD51: 0,
        AGD80: 0, AGD79: 5, AGD82: 8,
      }),
      investment: series('13552', {
        AGI39: 50, AGI40: 0, AGI41: 0, AGI42: 0, AGI44: 0, 929: 0,
        AGI45: 0, AGI46: 0, AGI17: 20, AG5: 10,
      }),
      balance: { KG52: { code: 'KG52', name: 'Bank', sourceTable: '13202', values: { 2024: { amount: 100 }, 2025: { amount: 140 } } } },
    },
  }

  const view = statementView(detail, 'cashflow', 2025, 'amount')
  assert.deepEqual(view.overviewRows.map((row) => row.label), [
    'Kontantstrøm fra drift', 'Kontantstrøm fra investeringer', 'Kontantstrøm fra finansiering', 'Netto kontantstrøm',
  ])
  assert.equal(view.sections.flatMap((section) => section.rows).some((row) => row.id === 'loan_repayments'), true)

  const operatingLines = statementDrill(detail, {
    statementId: 'cashflow', lineId: 'operating', dimensions: ['line', 'service', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(operatingLines.nextDimension, 'line')
  assert.equal(operatingLines.rows.some((row) => row.code === 'wages_and_social_costs' && row.value === -22), true)

  const wagesByService = statementDrill(detail, {
    statementId: 'cashflow', lineId: 'operating', dimensions: ['line', 'service', 'function', 'art'], selections: { line: 'wages_and_social_costs' }, year: 2025, mode: 'amount',
  })
  assert.deepEqual(wagesByService.rows.map((row) => [row.code, row.value]), [['FG1', -22]])

  const investmentsByService = statementDrill(detail, {
    statementId: 'cashflow', lineId: 'investing', dimensions: ['service', 'line', 'function'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.deepEqual(investmentsByService.rows.map((row) => [row.code, row.value]), [['FG1', -50]])
})

test('samme resultatlinje kan brytes ned i valgfri dimensjonsrekkefølge uten dobbelttelling', () => {
  const detail = {
    latestYear: 2025,
    overview: { expenses: { 2025: { amount: 30, perCapita: 300 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }, { code: 'FG2', name: 'Helse' }],
    functions: [
      { code: '202', name: 'Grunnskole', serviceCodes: ['FG1'] },
      { code: '253', name: 'Helse', serviceCodes: ['FG2'] },
    ],
    accountingArts: {
      202: [{ code: 'AGD50', name: 'Varer og tjenester', values: { 2025: { amount: 20 } } }],
      253: [{ code: 'AGD50', name: 'Varer og tjenester', values: { 2025: { amount: 10 } } }],
    },
    statementData: { result: {
      AG17: { code: 'AG17', name: 'Varer og tjenester', sourceTable: '13551', values: { 2025: { amount: 30, perCapita: 300 } } },
    } },
  }

  const byService = statementDrill(detail, {
    statementId: 'result', lineId: 'goods_services', dimensions: ['service', 'function', 'art'], year: 2025, mode: 'amount', selections: {},
  })
  const byArt = statementDrill(detail, {
    statementId: 'result', lineId: 'goods_services', dimensions: ['art', 'function', 'service'], year: 2025, mode: 'amount', selections: {},
  })

  assert.deepEqual(byService.rows.map((row) => [row.code, row.value]), [['FG1', 20], ['FG2', 10]])
  assert.deepEqual(byArt.rows.map((row) => [row.code, row.value]), [['AGD50', 30]])
  assert.equal(byService.activeTotal, 30)
  assert.equal(byArt.activeTotal, 30)
  assert.equal(byService.reconciliation.status, 'reconciled')
})

test('regnskapslinje kan flyttes foran eller etter tjenesteområde i resultatdrillen', () => {
  const statementItem = (code, amount) => ({
    code, name: code, sourceTable: '13551', values: { 2025: { amount, perCapita: amount * 10 } },
  })
  const detail = {
    overview: { expenses: { 2025: { amount: 30, perCapita: 300 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }, { code: 'FG2', name: 'Helse' }],
    functions: [
      { code: '202', name: 'Grunnskole', serviceCodes: ['FG1'] },
      { code: '253', name: 'Helse', serviceCodes: ['FG2'] },
    ],
    accountingArts: {
      202: [
        { code: 'AG16', name: 'Lønn', values: { 2025: { amount: 10 } } },
        { code: 'AGD50', name: 'Varer og tjenester', values: { 2025: { amount: 5 } } },
      ],
      253: [
        { code: 'AG16', name: 'Lønn', values: { 2025: { amount: 8 } } },
        { code: 'AGD50', name: 'Varer og tjenester', values: { 2025: { amount: 7 } } },
      ],
    },
    statementData: { result: {
      AGD46: statementItem('AGD46', 30), AG15: statementItem('AG15', 18),
      AG35: statementItem('AG35', 0), AG17: statementItem('AG17', 12),
    } },
  }

  const linesFirst = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_expense', dimensions: ['line', 'service', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(linesFirst.nextDimension, 'line')
  assert.deepEqual(linesFirst.rows.map((row) => [row.code, row.value]), [
    ['wages', 18], ['goods_services', 12],
  ])

  const servicesFirst = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_expense', dimensions: ['service', 'line', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(servicesFirst.nextDimension, 'service')
  assert.deepEqual(servicesFirst.rows.map((row) => [row.code, row.value]), [['FG1', 15], ['FG2', 15]])

  const lineWithinService = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_expense', dimensions: ['service', 'line', 'function', 'art'], selections: { service: 'FG1' }, year: 2025, mode: 'amount',
  })
  assert.equal(lineWithinService.nextDimension, 'line')
  assert.deepEqual(lineWithinService.rows.map((row) => [row.code, row.value]), [
    ['wages', 10], ['goods_services', 5],
  ])
})

test('inntekter åpner regnskapslinjene og videre KOSTRA-drill der kilden har fordeling', () => {
  const item = (code, amount) => ({ code, name: code, sourceTable: '13551', values: { 2025: { amount } } })
  const detail = {
    overview: { revenues: { 2025: { amount: 100, perCapita: 1_000 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }],
    functions: [{ code: '202', name: 'Grunnskole', serviceCodes: ['FG1'] }],
    accountingArts: { 202: [{ code: 'A600', name: 'Brukerbetalinger', values: { 2025: { amount: 12 } } }] },
    statementData: { result: {
      AGD45: item('AGD45', 100), AGD75: item('AGD75', 30), A800: item('A800', 20),
      AG10: item('AG10', 5), AGD76: item('AGD76', 3), A600: item('A600', 12),
      AGD96: item('AGD96', 10), AGD77: item('AGD77', 15), AGD78: item('AGD78', 5),
    } },
  }

  const lines = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_revenue', dimensions: ['line', 'service', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(lines.rows.length, 8)
  assert.equal(lines.rows.find((row) => row.code === 'user_payments').value, 12)
  assert.deepEqual(statementView(detail, 'result', 2025, 'amount').overviewRows[0].partialDimensions, ['service', 'function', 'art'])

  const userPayments = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_revenue', dimensions: ['line', 'service', 'function', 'art'], selections: { line: 'user_payments' }, year: 2025, mode: 'amount',
  })
  assert.deepEqual(userPayments.rows.map((row) => [row.code, row.value]), [['FG1', 12]])

  const missingTaxDetail = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_revenue', dimensions: ['line', 'service'], selections: { line: 'tax_income' }, year: 2025, mode: 'amount',
  })
  assert.equal(missingTaxDetail.activeTotal, null)
  assert.equal(missingTaxDetail.reconciliation.status, 'incomplete')
})

test('lønn åpner funksjon/art-drill og tomt detaljgrunnlag blir ikke null kroner', () => {
  const art = (code, name, amount) => ({ code, name, values: { 2025: { amount } } })
  const detail = {
    latestYear: 2025,
    overview: { expenses: { 2025: { amount: 100, perCapita: 1_000 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }],
    functions: [{ code: '202', name: 'Grunnskole', serviceCodes: ['FG1'] }],
    accountingArts: { 202: [
      art('AG16', 'Lønnsutgifter fratrukket sykelønnsrefusjon', 80),
      art('A710', 'Sykelønnsrefusjon', 10),
    ] },
    statementData: { result: {
      AG15: { code: 'AG15', name: 'Lønnsutgifter', sourceTable: '13551', values: { 2025: { amount: 70, perCapita: 700 } } },
      AG35: { code: 'AG35', name: 'Sosiale kostnader', sourceTable: '13551', values: { 2025: { amount: 20, perCapita: 200 } } },
    } },
  }

  const populated = statementDrill(detail, {
    statementId: 'result', lineId: 'wages', dimensions: ['service', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(populated.nextDimension, 'service')
  assert.deepEqual(populated.rows.map((row) => [row.code, row.value]), [['FG1', 90]])
  assert.equal(populated.reconciliation.status, 'reconciled')

  detail.accountingArts = {}
  const missing = statementDrill(detail, {
    statementId: 'result', lineId: 'wages', dimensions: ['service', 'function', 'art'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.equal(missing.activeTotal, null)
  assert.equal(missing.reconciliation.status, 'incomplete')
})

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
  assert.deepEqual(parseKostraRoute('#kostra/kommune/1103/detaljer?oppstilling=balance&aar=2025'), {
    page: 'detail', kind: 'municipality', code: '1103',
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
    overview: {
      net_expenses: { 2024: { amount: 100, perCapita: 1_000 }, 2025: { amount: 120, perCapita: 1_100 } },
      revenues: { 2024: { amount: 180, perCapita: 1_800 }, 2025: { amount: 210, perCapita: 1_950 } },
      investments: { 2024: { amount: 30, perCapita: 300 }, 2025: { amount: 45, perCapita: 410 } },
    },
    services: [{
      code: 'FGK8b', name: 'Grunnskole',
      metrics: {
        net_expenses: { 2024: { amount: 40, perCapita: 400 }, 2025: { amount: 50, perCapita: 450 } },
        investments: { 2024: { amount: 8, perCapita: 80 }, 2025: { amount: 12, perCapita: 110 } },
      },
    }],
    functions: [{
      code: '202', name: 'Grunnskole',
      metrics: {
        net_expenses: { 2024: { amount: -30, perCapita: -300 }, 2025: { amount: 35, perCapita: 320 } },
        investments: { 2024: { amount: 5, perCapita: 50 }, 2025: { amount: 9, perCapita: 82 } },
      },
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
  assert.deepEqual(drillHistory(detail, [2024, 2025], null, null, 'perCapita', 'revenues'), {
    name: 'Driftsinntekter totalt', points: [{ v: 1_800 }, { v: 1_950 }], latestValue: 1_950, fromZero: true,
  })
  assert.deepEqual(drillHistory(detail, [2024, 2025], 'FGK8b', '202', 'amount', 'investments'), {
    name: 'Grunnskole', points: [{ v: 5 }, { v: 9 }], latestValue: 9, fromZero: true,
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
      ['interest_income', 45, 25],
      ['interest_expenses', 60, 35],
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
    'revenues', 'expenses', 'interest_income', 'interest_expenses', 'net_result',
    'investments', 'result_after_investments', 'debt', 'net_expenses',
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
      ['interest_income', 50, 9_999],
      ['interest_expenses', 70, 9_999],
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
    'revenues', 'expenses', 'interest_income', 'interest_expenses', 'net_result',
    'investments', 'result_after_investments', 'debt', 'net_expenses',
  ])
  assert.equal(rows.find((row) => row.id === 'expenses').summary.amount, 900)
  assert.equal(rows.find((row) => row.id === 'interest_income').summary.perCapita, 500)
  assert.equal(rows.find((row) => row.id === 'interest_expenses').summary.amount, 70)
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

test('skatt og rammetilskudd samles i én sammenlignbar oppstilling', () => {
  const summary = {
    taxBefore: 53_807,
    blockGrantBeforeEqualization: 30_994,
    equalization: -7_532,
    blockGrant: 23_462,
    taxAndBlockGrant: 77_269,
  }
  const comparisons = [
    {
      id: 'municipality:1103', label: 'Stavanger', taxBeforePerCapita: 53_807,
      blockGrantBeforeEqualizationPerCapita: 30_994, equalizationPerCapita: -7_532,
      blockGrantPerCapita: 23_462,
    },
    {
      id: 'peer_group:12', label: 'KOSTRA-gruppe 12', taxBeforePerCapita: 42_000,
      blockGrantBeforeEqualizationPerCapita: 31_527, equalizationPerCapita: -2_072,
      blockGrantPerCapita: 29_455,
    },
    {
      id: 'country:EAK', label: 'Landet', taxBeforePerCapita: 42_250,
      blockGrantBeforeEqualizationPerCapita: 35_970, equalizationPerCapita: 0,
      blockGrantPerCapita: 35_970,
    },
  ]

  assert.deepEqual(incomeSystemTableColumns(summary, comparisons, 'Stavanger', 'perCapita'), [
    { id: 'municipality:1103', label: 'Stavanger', tax: 53_807, before: 30_994, equalization: -7_532, booked: 23_462, total: 77_269 },
    { id: 'peer_group:12', label: 'KOSTRA-gruppe 12', tax: 42_000, before: 31_527, equalization: -2_072, booked: 29_455, total: 71_455 },
    { id: 'country:EAK', label: 'Norge', tax: 42_250, before: 35_970, equalization: 0, booked: 35_970, total: 78_220 },
  ])
  assert.deepEqual(incomeSystemTableColumns(summary, comparisons, 'Stavanger', 'amount'), [
    { id: 'selected', label: 'Stavanger', tax: 53_807, before: 30_994, equalization: -7_532, booked: 23_462, total: 77_269 },
  ])
})

test('rammetilskuddet avstemmes fra Grønt hefte til faktisk bokført beløp uten dobbel utjevning', () => {
  const calculation = { values: { 2025: {
    basis: 'budget', sourceUrl: 'https://www.regjeringen.no/gront-hefte/', sourcePeriod: '2025', components: [
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
    sourcePeriod: '2025',
    basis: 'budget',
  })
  assert.deepEqual(blockGrantCalculationSummary(calculation, {
    equalization: -7_532, blockGrant: 23_462,
  }, 2025, 'perCapita'), {
    components: [
      { code: 'base_per_resident', amount: 4_703_088, value: 31_328 },
      { code: 'expense_equalization', amount: -551_306, value: -3_672 },
    ],
    budgetedBeforeEqualization: 28_881,
    equalization: -7_532,
    budgetedAfterEqualization: 21_349,
    reportedBlockGrant: 23_462,
    reconciliation: 2_113,
    sourceUrl: 'https://www.regjeringen.no/gront-hefte/',
    sourcePeriod: '2025',
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
