import test from 'node:test'
import assert from 'node:assert/strict'

import {
  choroplethColor,
  blockGrantCalculationSummary,
  comparisonEntityIds,
  countyGroupName,
  displayEntityName,
  drillHistory,
  expenseEqualizationChartRows,
  findKostraEntities,
  formatKostraShare,
  formatKostraValue,
  incomeEqualizationSummary,
  incomeEqualizationChartRows,
  municipalityEqualizationRows,
  municipalityFreeIncomeRankingRows,
  municipalityIncomeRankingRows,
  sortMunicipalityEqualizationRows,
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
  personalTaxAllocation,
  populationForEntity,
  summarizeMunicipalities,
  summarizeKostraEntities,
  shouldScrollToKostra,
  shouldUseStandaloneKostraDetail,
  stateFlowSummary,
  yearlyGrowth,
} from '../src/kostra/model.js'
import {
  formatRobekDuration,
  robekLegalBasisLetters,
  robekCurrentMunicipalities,
  robekStatusForMunicipality,
} from '../src/kostra/robek.js'
import { SEKSJONER } from '../src/fellestall/design.js'
import {
  accountingArtFunctionBreakdown,
  accountingArtsFunctionBreakdown,
  accountingArtBreakdown,
  explorerDrillRows,
  explorerHistory,
  explorerRowsWithShares,
  isFunctionBreakdownDrillable,
  sortExplorerRows,
} from '../src/kostra/explorer.js'
import {
  expenseCompositionRows,
  incomeCompositionRows,
  statementDrill,
  statementDrillScope,
  statementRowInteraction,
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

test('inntektssammendraget inkluderer alle drifts- og finansinntekter', () => {
  const values = Object.fromEntries([
    ['AGD75', 100], ['A800', 80], ['AG10', 20], ['AGD76', 5],
    ['A600', 30], ['AGD96', 40], ['AGD77', 15], ['AGD78', 10], ['AGD45', 300],
    ['AGD79', 5], ['AGD81', 2], ['AGD83', -1],
  ].map(([code, amount]) => [code, {
    code, name: code, sourceTable: '13551', values: { 2025: { amount } },
  }]))
  const detail = { statementData: { result: values } }

  const rows = incomeCompositionRows(detail, 2025)

  assert.deepEqual(new Set(rows.map((row) => row.code)), new Set([
    'tax_income', 'block_grant', 'property_tax', 'other_tax',
    'user_payments', 'sales_rent', 'state_grants', 'other_operating_revenue',
    'interest_income', 'dividends', 'financial_gains',
  ]))
  assert.equal(rows.find((row) => row.code === 'tax_income').amount, 100)
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 306)
  assert.equal(rows.find((row) => row.code === 'tax_income').share, 100 / 306 * 100)
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 100) < 1e-9)

  const incompleteRows = incomeCompositionRows({ statementData: { result: {
    AGD75: values.AGD75,
  } } }, 2025)
  assert.equal(incompleteRows.find((row) => row.code === 'block_grant').amount, null)
  assert.equal(incompleteRows.find((row) => row.code === 'block_grant').sourceStatus, 'incomplete')
  assert.equal(incompleteRows.every((row) => row.share == null), true)
})

test('utgiftssammendraget bruker de samme regnskapslinjene som resultatoppstillingen', () => {
  const values = Object.fromEntries([
    ['AG15', 90], ['AG35', 20], ['AG17', 50], ['AGD51', 30],
    ['AGD80', 10], ['A590', 10], ['AGD46', 210],
  ].map(([code, amount]) => [code, {
    code, name: code, sourceTable: '13551', values: { 2025: { amount } },
  }]))
  const detail = { statementData: { result: values } }

  const rows = expenseCompositionRows(detail, 2025)

  assert.deepEqual(rows.map((row) => [row.code, row.amount]), [
    ['wages', 110],
    ['goods_services', 50],
    ['purchased_services', 30],
    ['transfers', 10],
    ['depreciation', 10],
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 210)
  assert.equal(rows.find((row) => row.code === 'wages').share, 110 / 210 * 100)
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 100) < 1e-9)

  const incompleteRows = expenseCompositionRows({ statementData: { result: {
    AG15: values.AG15,
  } } }, 2025)
  const incompleteWages = incompleteRows.find((row) => row.code === 'wages')
  assert.equal(incompleteWages.amount, null)
  assert.equal(incompleteWages.sourceStatus, 'incomplete')
  assert.equal(incompleteRows.every((row) => row.share == null), true)
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

test('oppstillingsrader skiller mellom drill og grafvisning', () => {
  assert.deepEqual(statementRowInteraction({ availableDimensions: ['line'], value: 10 }), {
    action: 'drill', hint: 'Se detaljer', tone: null,
  })
  assert.deepEqual(statementRowInteraction({ availableDimensions: [], value: 10 }), {
    action: 'graph', hint: 'Vis i grafen', tone: null,
  })
  assert.equal(statementRowInteraction({ canDrill: true, value: 10 }).action, 'drill')
  assert.equal(statementRowInteraction({ canDrill: false, value: 10 }).action, 'graph')
})

test('valgt inntektslinje skiller egne drillnivåer fra alternative innganger til hele inntektsområdet', () => {
  const parent = { availableDimensions: ['line', 'service', 'function', 'art', 'tax'] }
  const taxLine = { availableDimensions: ['tax'] }

  assert.deepEqual(
    statementDrillScope(parent, taxLine, ['line', 'service', 'function', 'art', 'tax']),
    {
      visibleDimensions: ['line', 'tax'],
      alternativeDimensions: ['service', 'function', 'art'],
    },
  )
})

test('nettoresultat er grønt i pluss og rødt bare i minus', () => {
  assert.equal(statementRowInteraction({ id: 'net_operating_result', value: 244 }).tone, 'positive')
  assert.equal(statementRowInteraction({ id: 'net_operating_result', value: -1 }).tone, 'negative')
  assert.equal(statementRowInteraction({ id: 'net_operating_result', value: 0 }).tone, null)
  assert.equal(statementRowInteraction({ id: 'net_cashflow_summary', value: 244 }).tone, null)
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

test('balanseavvik forklares av SSBs kontrollposter for konserninterne mellomværender', () => {
  const item = (code, amount) => ({
    code, name: code, sourceTable: '13202', values: { 2025: { amount, perCapita: amount * 10 } },
  })
  const detail = { statementData: { result: {}, investment: {}, balance: Object.fromEntries([
    ['KG62', 57_380_472], ['KG90', 56_884_895],
    ['KG33', -26_481], ['KG34', -861_269], ['KG35', 21_498], ['KG36', -413_667],
  ].map(([code, amount]) => [code, item(code, amount)])) } }

  const check = statementView(detail, 'balance', 2025, 'amount').reconciliations.balance

  assert.equal(check.difference, 495_577)
  assert.equal(check.internalDifference, 495_581)
  assert.equal(check.unexplainedDifference, -4)
  assert.equal(check.cause, 'unmatched-intercompany-balances')
})

test('balansen viser regnskapslinjer under eiendeler og egenkapital og gjeld som standard', () => {
  const item = (code, amount) => ({ code, name: code, sourceTable: '13202', values: { 2025: { amount } } })
  const detail = { statementData: { result: {}, investment: {}, balance: {
    KG62: item('KG62', 105), KG41: item('KG41', 70), KG51: item('KG51', 35), KG43: item('KG43', 60),
    KG90: item('KG90', 105), KG63: item('KG63', 10), KG76: item('KG76', 80), KG83: item('KG83', 15), KG85: item('KG85', 12),
  } } }

  const view = statementView(detail, 'balance', 2025, 'amount')

  assert.deepEqual(view.defaultRows.map((row) => [row.id, row.kind ?? 'line', row.overviewLevel]), [
    ['assets', 'subtotal', 0],
    ['noncurrent_assets', 'line', 1],
    ['current_assets', 'line', 1],
    ['equity_debt', 'subtotal', 0],
    ['equity', 'line', 1],
    ['long_term_debt', 'line', 1],
    ['short_term_debt', 'line', 1],
  ])
  assert.deepEqual(view.defaultRows.filter((row) => row.overviewLevel === 1).map((row) => row.overviewParentLabel), [
    'Eiendeler', 'Eiendeler', 'Egenkapital og gjeld', 'Egenkapital og gjeld', 'Egenkapital og gjeld',
  ])
  assert.equal(view.defaultRows.some((row) => ['fixed_property', 'bank_debt', 'supplier_debt'].includes(row.id)), false)
  assert.deepEqual(view.defaultRows.filter((row) => row.overviewLevel === 0).map((row) => [
    row.availableDimensions,
    statementRowInteraction(row).action,
  ]), [
    [[], 'graph'],
    [[], 'graph'],
  ])
  assert.deepEqual(view.defaultRows.filter((row) => row.overviewLevel === 1).map((row) => statementRowInteraction(row).action), [
    'drill', 'drill', 'drill', 'drill', 'drill',
  ])

  const incomplete = statementView({ statementData: { result: {}, investment: {}, balance: {
    KG62: item('KG62', 105), KG41: item('KG41', 70), KG90: item('KG90', 105), KG76: item('KG76', 80), KG83: item('KG83', 15),
  } } }, 'balance', 2025, 'amount')
  const missingCurrentAssets = incomplete.defaultRows.find((row) => row.id === 'current_assets')
  const missingEquity = incomplete.defaultRows.find((row) => row.id === 'equity')
  assert.deepEqual([missingCurrentAssets.value, missingCurrentAssets.clickable], [null, false])
  assert.deepEqual([missingEquity.value, missingEquity.clickable], [null, false])
})

test('balansens synlige regnskapslinjer kan drilles videre til balansekapittel', () => {
  const item = (code, amount) => ({ code, name: code, sourceTable: '13202', values: { 2025: { amount } } })
  const detail = { statementData: { result: {}, investment: {}, balance: {
    KG43: item('KG43', 70), KG44: item('KG44', 30), KG62: item('KG62', 105),
    KG41: item('KG41', 105), KG51: item('KG51', 0), KG47: item('KG47', 0),
    KG49: item('KG49', 5),
  } } }
  const noncurrentAssets = statementDrill(detail, {
    statementId: 'balance', lineId: 'noncurrent_assets', dimensions: ['balance_chapter'], selections: {}, year: 2025, mode: 'amount',
  })
  assert.deepEqual(noncurrentAssets.rows.map((row) => [row.code, row.value]), [
    ['KG43', 70], ['KG44', 30], ['KG49', 5], ['KG47', 0],
  ])

  const incompleteComposite = statementDrill(detail, {
    statementId: 'balance', lineId: 'other_noncurrent_assets', dimensions: ['balance_chapter'],
    selections: {}, year: 2025, mode: 'amount',
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
  const revenueView = statementView(detail, 'result', 2025, 'amount')
  assert.deepEqual(revenueView.overviewRows[0].partialDimensions, ['service', 'function', 'art'])
  assert.deepEqual(
    revenueView.sections.flatMap((section) => section.rows).find((row) => row.id === 'tax_income').availableDimensions,
    [],
  )

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

test('inntekter kan fordeles på tjeneste, funksjon og art uten at ufordelbare regnskapslinjer forsvinner', () => {
  const item = (code, amount) => ({ code, name: code, sourceTable: '13551', values: { 2025: { amount } } })
  const art = (code, name, amount) => ({ code, name, values: { 2025: { amount } } })
  const detail = {
    overview: { revenues: { 2025: { amount: 450, perCapita: 4_500 } } },
    services: [{ code: 'FG1', name: 'Oppvekst' }],
    functions: [{ code: '202', name: 'Grunnskole', serviceCodes: ['FG1'] }],
    accountingArts: { 202: [
      art('A600', 'Brukerbetalinger', 10),
      art('AGD34', 'Andre salgs- og leieinntekter', 20),
      art('AG48', 'Overføringsinntekter med krav til motytelse', 30),
      art('AGD49', 'Overføringsinntekter uten krav til motytelse', 40),
      art('AGD28', 'Finansinntekter og finanstransaksjoner', 50),
    ] },
    statementData: { result: {
      AGD45: item('AGD45', 450), AGD75: item('AGD75', 200), A800: item('A800', 100),
      A600: item('A600', 10), AGD96: item('AGD96', 20),
      AGD77: item('AGD77', 30), AGD78: item('AGD78', 90),
    } },
  }

  const revenueView = statementView(detail, 'result', 2025, 'amount')
  const stateGrants = revenueView.sections.flatMap((section) => section.rows)
    .find((row) => row.id === 'state_grants')
  assert.deepEqual(stateGrants.availableDimensions, ['service', 'function', 'art'])

  const byService = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_revenue',
    dimensions: ['service', 'function', 'art', 'line', 'tax'], selections: {},
    year: 2025, mode: 'amount', years: [2025],
  })
  assert.equal(byService.nextDimension, 'service')
  assert.deepEqual(byService.rows.map((row) => [row.dimension, row.code, row.value]), [
    ['line', 'tax_income', 200],
    ['service', 'FG1', 100],
    ['line', 'block_grant', 100],
  ])
  assert.match(byService.coverageNote, /vises uendret som regnskapslinjer/)
})

test('skatteinntekter bruker en egen skattedimensjon og avstemmer naturressursskatten', () => {
  const item = (code, amount, sourceTable = '13551') => ({
    code, name: code, sourceTable, values: { 2025: { amount, perCapita: amount * 10 } },
  })
  const detail = {
    overview: { revenues: { 2025: { amount: 1_000, perCapita: 10_000 } } },
    statementData: {
      result: { AGD75: item('AGD75', 800) },
      tax: { AG12: item('AG12', 800, '13553'), AG44: item('AG44', 50, '13553') },
    },
  }

  const taxLine = statementView(detail, 'result', 2025, 'amount').sections
    .flatMap((section) => section.rows).find((row) => row.id === 'tax_income')
  assert.deepEqual(taxLine.availableDimensions, ['tax'])

  const drill = statementDrill(detail, {
    statementId: 'result', lineId: 'tax_income', dimensions: ['tax'], selections: {},
    year: 2025, mode: 'amount', years: [2025],
  })
  assert.equal(drill.nextDimension, 'tax')
  assert.deepEqual(drill.rows.map((row) => [row.code, row.name, row.value, row.share]), [
    ['AG12–AG44', 'Inntekts- og formuesskatt uten naturressursskatt', 750, 93.75],
    ['AG44', 'Naturressursskatt', 50, 6.25],
  ])
  assert.deepEqual(drill.rows.map((row) => row.canDrill), [false, false])
  assert.equal(drill.reconciliation.status, 'reconciled')

  const fromIncome = statementDrill(detail, {
    statementId: 'result', lineId: 'operating_revenue',
    dimensions: ['line', 'service', 'function', 'art', 'tax'],
    selections: { line: 'tax_income' }, year: 2025, mode: 'amount', years: [2025],
  })
  assert.equal(fromIncome.nextDimension, 'tax')
  assert.deepEqual(fromIncome.rows.map((row) => row.code), ['AG12–AG44', 'AG44'])
  assert.equal(fromIncome.coverageNote, null)
})

test('eiendomsskatt fordeles på bolig og annen eiendom uten dobbelttelling', () => {
  const item = (code, amount, sourceTable = '13551') => ({
    code, name: code, sourceTable, values: { 2025: { amount, perCapita: amount * 10 } },
  })
  const detail = {
    overview: { revenues: { 2025: { amount: 1_000, perCapita: 10_000 } } },
    statementData: {
      result: { AG10: item('AG10', 50) },
      tax: { AG47: item('AG47', 30, '13553'), AG46: item('AG46', 20, '13553') },
    },
  }

  const drill = statementDrill(detail, {
    statementId: 'result', lineId: 'property_tax', dimensions: ['tax'], selections: {},
    year: 2025, mode: 'perCapita', years: [2025],
  })
  assert.deepEqual(drill.rows.map((row) => [row.code, row.name, row.value, row.share]), [
    ['AG47', 'Eiendomsskatt på boliger og fritidsboliger', 300, 60],
    ['AG46', 'Eiendomsskatt på annen eiendom', 200, 40],
  ])
  assert.equal(drill.reconciliation.status, 'reconciled')
  assert.equal(formatKostraValue(-8, 'amount'), '−8\u00a0000 kr')
  assert.equal(formatKostraShare(-8 / 80_924 * 100), '−0,01 %')
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
  assert.equal(populated.rows[0].canDrill, true)
  assert.equal(populated.reconciliation.status, 'reconciled')

  const arts = statementDrill(detail, {
    statementId: 'result', lineId: 'wages', dimensions: ['service', 'function', 'art'],
    selections: { service: 'FG1', function: '202' }, year: 2025, mode: 'amount',
  })
  assert.equal(arts.nextDimension, 'art')
  assert.deepEqual(arts.rows.map((row) => row.canDrill), [false, false])

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

  const activeRoute = parseKostraRoute('#kostra/kommune/1103/detaljer?oppstilling=result')
  const historicalRoute = parseKostraRoute('#kostra/kommune/0104/detaljer')
  const countyRoute = parseKostraRoute('#kostra/fylke/11/detaljer')
  assert.equal(shouldUseStandaloneKostraDetail(activeRoute, 'active'), false)
  assert.equal(shouldUseStandaloneKostraDetail(historicalRoute, 'historical'), true)
  assert.equal(shouldUseStandaloneKostraDetail(countyRoute, null), true)
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

test('flere inntektsarter kan samles i én funksjonsfordeling', () => {
  const detail = {
    latestYear: 2025,
    overview: { revenues: { 2025: { amount: 100, perCapita: 1_000 } } },
    functions: [
      { code: '202', name: 'Grunnskole', serviceCodes: ['FGK8b'] },
      { code: '120', name: 'Administrasjon', serviceCodes: ['FGK1b'] },
    ],
    accountingArts: {
      202: [
        { code: 'AGD49', name: 'Andre overføringer', values: { 2025: { amount: 10 } } },
        { code: 'AGD28', name: 'Finansinntekter', values: { 2025: { amount: 5 } } },
      ],
      120: [{ code: 'AGD49', name: 'Andre overføringer', values: { 2025: { amount: 20 } } }],
    },
  }

  const breakdown = accountingArtsFunctionBreakdown(detail, 2025, ['AGD49', 'AGD28'], 35)

  assert.deepEqual(breakdown.rows.map((row) => [row.code, row.amount]), [
    ['120', 20], ['202', 15],
  ])
  assert.equal(breakdown.summation.status, 'matches')
  assert.equal(isFunctionBreakdownDrillable(breakdown), true)
  assert.equal(isFunctionBreakdownDrillable(
    accountingArtsFunctionBreakdown(detail, 2025, ['AGD49', 'AGD28'], 40),
  ), false)
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

test('personskatt viser kommunens inntekts- og formuesskatt for siste fulle år', () => {
  assert.deepEqual(personalTaxAllocation(2025, '1103'), {
    year: 2025,
    municipalIncomeRate: 12.75,
    municipalWealthRate: 0.525,
    stateWealthRate: 0.475,
    stateWealthTopRate: 0.575,
    wealthAllowance: 1_760_000,
    wealthTopThreshold: 20_700_000,
    reducedWealthRate: false,
    sourceUrl: 'https://lovdata.no/dokument/STV/forskrift/2024-12-13-3203',
  })
  assert.equal(personalTaxAllocation(2025, '1867').municipalWealthRate, 0.2)
  assert.equal(personalTaxAllocation(2025, '1514').reducedWealthRate, true)
  assert.equal(personalTaxAllocation(2024, '1103'), null)
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

test('utjevningsgrafen viser kommuner før og etter og markerer valgt kommune', () => {
  const index = {
    entities: [
      { id: 'municipality:1103', code: '1103', name: 'Stavanger', kind: 'municipality' },
      { id: 'municipality:0301', code: '0301', name: 'Oslo kommune - Oslo suohkan', kind: 'municipality' },
      { id: 'county:11', code: '1100', name: 'Rogaland fylkeskommune', kind: 'county' },
    ],
    incomeEqualization: { 2025: {
      'municipality:1103': { taxBefore: { perCapita: 53_807 }, taxAfter: { perCapita: 46_276 }, equalization: { perCapita: -7_531 } },
      'municipality:0301': { taxBefore: { perCapita: 55_309 }, taxAfter: { perCapita: 46_846 }, equalization: { perCapita: -8_463 } },
      'county:11': { taxBefore: { perCapita: 60_000 }, taxAfter: { perCapita: 50_000 }, equalization: { perCapita: -10_000 } },
      'municipality:9999': { taxBefore: { perCapita: null }, taxAfter: { perCapita: 40_000 }, equalization: { perCapita: null } },
    } },
  }

  assert.deepEqual(incomeEqualizationChartRows(index, 2025, 'municipality:1103'), [
    { id: 'municipality:1103', name: 'Stavanger', before: 53_807, after: 46_276, equalization: -7_531, selected: true },
    { id: 'municipality:0301', name: 'Oslo kommune', before: 55_309, after: 46_846, equalization: -8_463, selected: false },
  ])
  assert.deepEqual(incomeEqualizationChartRows(index, 2024, 'municipality:1103'), [])
})

test('utgiftsgrafen illustrerer finansieringsbehov før og etter utgiftsutjevning', () => {
  const index = {
    entities: [
      { id: 'municipality:1103', name: 'Stavanger', kind: 'municipality' },
      { id: 'municipality:0301', name: 'Oslo kommune - Oslo suohkan', kind: 'municipality' },
      { id: 'county:11', name: 'Rogaland fylkeskommune', kind: 'county' },
    ],
    values: { net_expenses: { 2025: {
      'municipality:1103': { perCapita: 80_000 },
      'municipality:0301': { perCapita: 90_000 },
      'county:11': { perCapita: 100_000 },
      'municipality:9999': { perCapita: null },
    } } },
    incomeEqualization: { 2025: {
      'municipality:1103': { expenseEqualization: { perCapita: -3_000 } },
      'municipality:0301': { expenseEqualization: { perCapita: 2_000 } },
      'county:11': { expenseEqualization: { perCapita: 1_000 } },
      'municipality:9999': { expenseEqualization: { perCapita: 500 } },
    } },
  }

  assert.deepEqual(expenseEqualizationChartRows(index, 2025, 'municipality:1103'), [
    { id: 'municipality:1103', name: 'Stavanger', before: 80_000, after: 83_000, equalization: -3_000, selected: true },
    { id: 'municipality:0301', name: 'Oslo kommune', before: 90_000, after: 88_000, equalization: 2_000, selected: false },
  ])
  assert.deepEqual(expenseEqualizationChartRows(index, 2024, 'municipality:1103'), [])
})

test('ROBEK-grunnlag leser bare bokstavledd og ikke g-en i ordet og', () => {
  assert.deepEqual(robekLegalBasisLetters('a, b, c og d'), ['a', 'b', 'c', 'd'])
  assert.deepEqual(robekLegalBasisLetters('c og d'), ['c', 'd'])
  assert.deepEqual(robekLegalBasisLetters(null), [])
})

test('kommuneoppsummeringen lager en komplett rangering av skatteinntekt per innbygger', () => {
  const index = {
    entities: [
      { id: 'municipality:1103', name: 'Stavanger', kind: 'municipality' },
      { id: 'municipality:0301', name: 'Oslo', kind: 'municipality' },
      { id: 'municipality:1124', name: 'Sola', kind: 'municipality' },
      { id: 'county:11', name: 'Rogaland', kind: 'county' },
    ],
    incomeEqualization: { 2025: {
      'municipality:1103': { taxBefore: { perCapita: 53_807 } },
      'municipality:0301': { taxBefore: { perCapita: 55_309 } },
      'municipality:1124': { taxBefore: { perCapita: 53_807 } },
      'county:11': { taxBefore: { perCapita: 80_000 } },
      'municipality:9999': { taxBefore: { perCapita: 70_000 } },
    } },
  }

  assert.deepEqual(municipalityIncomeRankingRows(index, 2025, 'municipality:1103'), [
    { id: 'municipality:0301', name: 'Oslo kommune', rank: 1, taxPerCapita: 55_309, selected: false },
    { id: 'municipality:1124', name: 'Sola', rank: 2, taxPerCapita: 53_807, selected: false },
    { id: 'municipality:1103', name: 'Stavanger', rank: 2, taxPerCapita: 53_807, selected: true },
  ])
  assert.deepEqual(municipalityIncomeRankingRows(index, 2024, 'municipality:1103'), [])
})

test('frie inntekter rangerer bare skatteinntekter og bokført rammetilskudd med samme folketall', () => {
  const index = {
    entities: [
      { id: 'municipality:1103', name: 'Stavanger', kind: 'municipality' },
      { id: 'municipality:0301', name: 'Oslo', kind: 'municipality' },
      { id: 'municipality:1124', name: 'Sola', kind: 'municipality' },
      { id: 'county:11', name: 'Rogaland', kind: 'county' },
    ],
    incomeEqualization: { 2025: {
      'municipality:1103': { population: 1_000, taxBefore: { perCapita: 53_000 }, blockGrant: { amount: 23_000 } },
      'municipality:0301': { population: 1_000, taxBefore: { perCapita: 60_000 }, blockGrant: { amount: 10_000 } },
      'municipality:1124': { population: 1_000, taxBefore: { perCapita: 50_000 }, blockGrant: { amount: 30_000 } },
      'county:11': { population: 1_000, taxBefore: { perCapita: 100_000 }, blockGrant: { amount: 100_000 } },
    } },
  }

  assert.deepEqual(municipalityFreeIncomeRankingRows(index, 2025, 'municipality:1103'), [
    { id: 'municipality:1124', name: 'Sola', rank: 1, taxPerCapita: 50_000, blockGrantPerCapita: 30_000, totalPerCapita: 80_000, selected: false },
    { id: 'municipality:1103', name: 'Stavanger', rank: 2, taxPerCapita: 53_000, blockGrantPerCapita: 23_000, totalPerCapita: 76_000, selected: true },
    { id: 'municipality:0301', name: 'Oslo kommune', rank: 3, taxPerCapita: 60_000, blockGrantPerCapita: 10_000, totalPerCapita: 70_000, selected: false },
  ])
  assert.deepEqual(municipalityFreeIncomeRankingRows(index, 2024, 'municipality:1103'), [])
})

test('samlet utjevning summerer inntekts- og utgiftsutjevning og kan sorteres', () => {
  const index = {
    entities: [
      { id: 'municipality:1103', name: 'Stavanger', kind: 'municipality' },
      { id: 'municipality:0301', name: 'Oslo', kind: 'municipality' },
      { id: 'municipality:1124', name: 'Sola', kind: 'municipality' },
      { id: 'county:11', name: 'Rogaland', kind: 'county' },
    ],
    incomeEqualization: { 2025: {
      'municipality:1103': {
        equalization: { perCapita: -7_532 },
        expenseEqualization: { perCapita: -3_635 },
      },
      'municipality:0301': {
        equalization: { perCapita: -8_463 },
        expenseEqualization: { perCapita: 2_000 },
      },
      'municipality:1124': {
        equalization: { perCapita: -4_000 },
        expenseEqualization: { perCapita: -1_000 },
      },
      'county:11': {
        equalization: { perCapita: -20_000 },
        expenseEqualization: { perCapita: -20_000 },
      },
    } },
  }

  const rows = municipalityEqualizationRows(index, 2025, 'municipality:1103')
  assert.deepEqual(rows, [
    { id: 'municipality:1103', name: 'Stavanger', incomePerCapita: -7_532, expensePerCapita: -3_635, totalPerCapita: -11_167, selected: true },
    { id: 'municipality:0301', name: 'Oslo kommune', incomePerCapita: -8_463, expensePerCapita: 2_000, totalPerCapita: -6_463, selected: false },
    { id: 'municipality:1124', name: 'Sola', incomePerCapita: -4_000, expensePerCapita: -1_000, totalPerCapita: -5_000, selected: false },
  ])
  assert.deepEqual(
    sortMunicipalityEqualizationRows(rows, 'name', 'asc').map((row) => row.name),
    ['Oslo kommune', 'Sola', 'Stavanger'],
  )
  assert.deepEqual(
    sortMunicipalityEqualizationRows(rows, 'incomePerCapita', 'desc').map((row) => row.incomePerCapita),
    [-4_000, -7_532, -8_463],
  )
  assert.deepEqual(municipalityEqualizationRows(index, 2024, 'municipality:1103'), [])
})

test('ROBEK-status bruker departementets løpende register med kilde og dato', () => {
  const tromso = robekStatusForMunicipality('5501')
  assert.equal(tromso.registered, true)
  assert.equal(tromso.legalBasis, 'd')
  assert.equal(tromso.updated, '2026-09-03')
  assert.equal(tromso.currentPeriod.entered, '2026-08-26')
  assert.equal(formatRobekDuration(tromso.currentPeriod, tromso.updated), '8 dager')

  const stavanger = robekStatusForMunicipality('1103')
  assert.equal(stavanger.registered, false)
  assert.equal(stavanger.legalBasis, null)
  assert.deepEqual(stavanger.periods, [])

  const kragero = robekStatusForMunicipality('4014')
  assert.deepEqual(kragero.periods, [
    { entered: '2001-01-01', exited: '2006-07-11' },
    { entered: '2024-06-05', exited: null },
  ])
  assert.equal(formatRobekDuration(kragero.periods[0]), '5 år og 6 måneder')

  const current = robekCurrentMunicipalities()
  assert.equal(current.length, 35)
  assert.equal(current[0].name, 'Andøy')
  assert.ok(current.every((row) => row.currentPeriod))
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
      expenseEqualizationPerCapita: -3_635,
      blockGrantPerCapita: 23_462,
    },
    {
      id: 'peer_group:12', label: 'KOSTRA-gruppe 12', taxBeforePerCapita: 42_000,
      blockGrantBeforeEqualizationPerCapita: 31_527, equalizationPerCapita: -2_072,
      expenseEqualizationPerCapita: -1_100,
      blockGrantPerCapita: 29_455,
    },
    {
      id: 'country:EAK', label: 'Landet', taxBeforePerCapita: 42_250,
      blockGrantBeforeEqualizationPerCapita: 35_970, equalizationPerCapita: 0,
      expenseEqualizationPerCapita: 0,
      blockGrantPerCapita: 35_970,
    },
  ]

  assert.deepEqual(incomeSystemTableColumns(summary, comparisons, 'Stavanger', 'perCapita', -3_635), [
    { id: 'municipality:1103', label: 'Stavanger', tax: 53_807, before: 34_629, expenseEqualization: -3_635, incomeEqualization: -7_532, booked: 23_462, total: 77_269 },
    { id: 'peer_group:12', label: 'KOSTRA-gruppe 12', tax: 42_000, before: 32_627, expenseEqualization: -1_100, incomeEqualization: -2_072, booked: 29_455, total: 71_455 },
    { id: 'country:EAK', label: 'Norge', tax: 42_250, before: 35_970, expenseEqualization: 0, incomeEqualization: 0, booked: 35_970, total: 78_220 },
  ])
  assert.deepEqual(incomeSystemTableColumns(summary, comparisons, 'Stavanger', 'amount', -3_635), [
    { id: 'selected', label: 'Stavanger', tax: 53_807, before: 34_629, expenseEqualization: -3_635, incomeEqualization: -7_532, booked: 23_462, total: 77_269 },
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
