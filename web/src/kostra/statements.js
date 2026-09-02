export const STATEMENT_TYPES = [
  { id: 'result', label: 'Resultat' },
  { id: 'balance', label: 'Balanse' },
  { id: 'cashflow', label: 'Kontantstrøm' },
]

export const DIMENSIONS = {
  service: { id: 'service', label: 'Tjenesteområde' },
  function: { id: 'function', label: 'KOSTRA-funksjon' },
  art: { id: 'art', label: 'KOSTRA-art' },
  balance_chapter: { id: 'balance_chapter', label: 'Balansekapittel' },
  sector: { id: 'sector', label: 'Sektor / motpart' },
}

const source = (dataset, code, factor = 1) => ({ dataset, code, factor })
const resultSource = (code, factor = 1) => source('result', code, factor)
const balanceSource = (code, factor = 1) => source('balance', code, factor)
const investmentSource = (code, factor = 1) => source('investment', code, factor)

const RESULT_SECTIONS = [
  {
    id: 'operating_revenue', label: 'Driftsinntekter', totalId: 'total_operating_revenue',
    rows: [
      { id: 'tax_income', label: 'Skatteinntekter', sources: [resultSource('AGD75')] },
      { id: 'block_grant', label: 'Rammetilskudd', sources: [resultSource('A800')] },
      { id: 'property_tax', label: 'Eiendomsskatt', sources: [resultSource('AG10')] },
      { id: 'other_tax', label: 'Andre skatteinntekter', sources: [resultSource('AGD76')] },
      { id: 'user_payments', label: 'Brukerbetalinger', sources: [resultSource('A600')], drillArtCodes: ['A600'] },
      { id: 'sales_rent', label: 'Salgs- og leieinntekter', sources: [resultSource('AGD96')], drillArtCodes: ['AGD34'] },
      { id: 'state_grants', label: 'Statlige tilskudd og refusjoner', sources: [resultSource('AGD77')] },
      { id: 'other_operating_revenue', label: 'Andre driftsinntekter', sources: [resultSource('AGD78')], drillArtCodes: ['AGD49', 'AGD28'] },
      { id: 'total_operating_revenue', label: 'Sum driftsinntekter', sources: [resultSource('AGD45')], kind: 'total' },
    ],
  },
  {
    id: 'operating_expense', label: 'Driftskostnader', totalId: 'total_operating_expense',
    rows: [
      {
        id: 'wages', label: 'Lønn og sosiale kostnader',
        sources: [resultSource('AG15'), resultSource('AG35')],
        drillArtCodes: ['AG16', 'A710'],
        drillNote: 'Oppstillingen summerer AG15 lønnsutgifter og AG35 sosiale kostnader. Funksjonsfordelingen viser AG16 etter sykelønnsrefusjon og A710 sykelønnsrefusjon, slik at bruttobeløpet kan avstemmes.',
      },
      { id: 'goods_services', label: 'Varer og tjenester', sources: [resultSource('AG17')], drillArtCodes: ['AGD50'] },
      { id: 'purchased_services', label: 'Kjøp av tjenester fra andre', sources: [resultSource('AGD51')], drillArtCodes: ['AGD51'] },
      { id: 'transfers', label: 'Overføringer og tilskudd', sources: [resultSource('AGD80')], drillArtCodes: ['AG34'] },
      { id: 'depreciation', label: 'Avskrivninger', sources: [resultSource('A590')], drillArtCodes: ['A590'] },
      { id: 'total_operating_expense', label: 'Sum driftskostnader', sources: [resultSource('AGD46')], kind: 'total' },
    ],
  },
  {
    id: 'operating_result', label: 'Resultat',
    rows: [
      { id: 'gross_operating_result', label: 'Brutto driftsresultat', sources: [resultSource('AGD65')], kind: 'subtotal' },
      { id: 'interest_income', label: 'Renteinntekter', sources: [resultSource('AGD79')] },
      { id: 'dividends', label: 'Utbytte og eierinntekter', sources: [resultSource('AGD81')] },
      { id: 'financial_gains', label: 'Gevinst/tap på finansielle omløpsmidler', sources: [resultSource('AGD83')] },
      { id: 'interest_expense', label: 'Renteutgifter', sources: [resultSource('AGD82')] },
      { id: 'loan_repayments', label: 'Avdrag på lån', sources: [resultSource('AG5')] },
      { id: 'net_finance_expense', label: 'Netto finansutgifter', sources: [resultSource('AGD85')], kind: 'subtotal' },
      { id: 'depreciation_counterentry', label: 'Motpost avskrivninger', sources: [resultSource('AGD87')] },
      { id: 'internal_finance_difference', label: 'Konserninterne renter og avdrag', sources: [resultSource('AGD84')] },
      { id: 'net_operating_result', label: 'Netto driftsresultat', sources: [resultSource('AGD89')], kind: 'result' },
    ],
  },
  {
    id: 'dispositions', label: 'Disponeringer etter ordinær drift',
    rows: [
      { id: 'transfer_to_investment', label: 'Overføring til investering', sources: [resultSource('570')] },
      { id: 'reserve_restricted', label: 'Avsetning til bundne fond', sources: [resultSource('550')] },
      { id: 'use_restricted', label: 'Bruk av bundne fond', sources: [resultSource('950')] },
      { id: 'reserve_unrestricted', label: 'Avsetning til disposisjonsfond', sources: [resultSource('540')] },
      { id: 'use_unrestricted', label: 'Bruk av disposisjonsfond', sources: [resultSource('940')] },
      { id: 'cover_previous_deficit', label: 'Dekning av tidligere års merforbruk', sources: [resultSource('AD530')] },
      { id: 'use_previous_surplus', label: 'Bruk av tidligere års mindreforbruk', sources: [resultSource('AD930')] },
      { id: 'disposition_total', label: 'Sum disponering/dekning', sources: [resultSource('AGD93')], kind: 'total' },
    ],
  },
]

const BALANCE_SECTIONS = [
  {
    id: 'assets', label: 'Eiendeler',
    rows: [
      { id: 'fixed_property', label: 'Fast eiendom og anlegg', sources: [balanceSource('KG43')], drillBalanceCodes: ['KG43'] },
      { id: 'equipment', label: 'Maskiner, utstyr og transportmidler', sources: [balanceSource('KG44')], drillBalanceCodes: ['KG44'] },
      { id: 'shares', label: 'Aksjer og andeler', sources: [balanceSource('KG46')], drillBalanceCodes: ['KG46'] },
      { id: 'loans_receivable', label: 'Utlån', sources: [balanceSource('KG48')], drillBalanceCodes: ['KG48', 'KG109'] },
      { id: 'pension_assets', label: 'Pensjonsmidler', sources: [balanceSource('KG50')], drillBalanceCodes: ['KG50'] },
      { id: 'other_noncurrent_assets', label: 'Andre anleggsmidler', sources: [balanceSource('KG47'), balanceSource('KG49'), balanceSource('KG109')], drillBalanceCodes: ['KG47', 'KG49', 'KG109'] },
      { id: 'cash', label: 'Bankinnskudd og kontanter', sources: [balanceSource('KG52')], drillBalanceCodes: ['KG52'] },
      { id: 'receivables', label: 'Fordringer', sources: [balanceSource('KG58')], drillBalanceCodes: ['KG59', 'KG60', 'KG98', 'KG61'] },
      { id: 'current_financial_assets', label: 'Finansielle omløpsmidler', sources: [balanceSource('KG53')], drillBalanceCodes: ['KG54', 'KG55', 'KG56', 'KG57'] },
      { id: 'other_current_assets', label: 'Andre omløpsmidler', sources: [balanceSource('KG111')], drillBalanceCodes: ['KG111'] },
      { id: 'total_assets', label: 'Sum eiendeler', sources: [balanceSource('KG62')], kind: 'total', drillBalanceCodes: ['KG41', 'KG51'] },
    ],
  },
  {
    id: 'equity_debt', label: 'Egenkapital og gjeld',
    rows: [
      { id: 'discretionary_fund', label: 'Disposisjonsfond', sources: [balanceSource('KG65')], drillBalanceCodes: ['KG65'] },
      { id: 'restricted_operating_fund', label: 'Bundne driftsfond', sources: [balanceSource('KG66')], drillBalanceCodes: ['KG66'] },
      { id: 'investment_funds', label: 'Investeringsfond', sources: [balanceSource('KG69'), balanceSource('KG70')], drillBalanceCodes: ['KG69', 'KG70'] },
      { id: 'other_equity', label: 'Kapitalkonto og øvrig egenkapital', sources: [balanceSource('KG72')], drillBalanceCodes: ['KG73', 'KG74', 'KG75'] },
      { id: 'long_term_debt', label: 'Langsiktig gjeld', sources: [balanceSource('KG76')], kind: 'subtotal', drillBalanceCodes: ['KG78', 'KG112', 'KG79', 'KG80', 'KG81', 'KG113', 'KG82'] },
      { id: 'pension_obligations', label: 'Pensjonsforpliktelser', sources: [balanceSource('KG82')], drillBalanceCodes: ['KG82'] },
      { id: 'bank_debt', label: 'Bank- og kredittinstitusjonslån', sources: [balanceSource('KG78')], drillBalanceCodes: ['KG78'] },
      { id: 'bond_debt', label: 'Obligasjonslån', sources: [balanceSource('KG79'), balanceSource('KG80')], drillBalanceCodes: ['KG79', 'KG80'] },
      { id: 'certificate_debt', label: 'Sertifikatlån', sources: [balanceSource('KG81')], drillBalanceCodes: ['KG81'] },
      { id: 'other_long_term_debt', label: 'Annen langsiktig gjeld', sources: [balanceSource('KG112'), balanceSource('KG113')], drillBalanceCodes: ['KG112', 'KG113'] },
      { id: 'supplier_debt', label: 'Leverandørgjeld', sources: [balanceSource('KG85')], drillBalanceCodes: ['KG85'] },
      { id: 'other_short_term_debt', label: 'Annen kortsiktig gjeld', sources: [balanceSource('KG86'), balanceSource('KG87'), balanceSource('KG88'), balanceSource('KG110'), balanceSource('KG89')], drillBalanceCodes: ['KG86', 'KG87', 'KG88', 'KG110', 'KG89'] },
      { id: 'total_equity_debt', label: 'Sum egenkapital og gjeld', sources: [balanceSource('KG90')], kind: 'total', drillBalanceCodes: ['KG63', 'KG76', 'KG83'] },
    ],
  },
]

function rawPoint(detail, item, year) {
  return detail?.statementData?.[item.dataset]?.[item.code]?.values?.[year] ?? null
}

function sourcesValue(detail, sources, year, mode) {
  const values = sources.map((item) => {
    const point = rawPoint(detail, item, year)
    const value = point?.[mode]
    return Number.isFinite(value) ? value * item.factor : null
  })
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null
}

function materializeLine(detail, definition, year, mode, statementId) {
  const availableDimensions = definition.drillBalanceCodes?.length
    ? ['balance_chapter']
    : definition.drillArtCodes?.length
      ? ['service', 'function', 'art']
      : []
  return {
    ...definition,
    statementId,
    value: sourcesValue(detail, definition.sources, year, mode),
    availableDimensions,
    sourceObservations: definition.sources.map((item) => ({
      ...item,
      name: detail?.statementData?.[item.dataset]?.[item.code]?.name ?? item.code,
      sourceTable: detail?.statementData?.[item.dataset]?.[item.code]?.sourceTable ?? null,
    })),
    clickable: true,
  }
}

function statementLine(detail, statementId, lineId, year, mode) {
  return statementView(detail, statementId, year, mode).sections
    .flatMap((section) => section.rows)
    .find((row) => row.id === lineId) ?? null
}

function detailPopulation(detail, year) {
  for (const id of ['revenues', 'expenses', 'debt', 'investments']) {
    const point = detail?.overview?.[id]?.[year]
    if (Number.isFinite(point?.amount) && Number.isFinite(point?.perCapita) && point.perCapita !== 0) {
      return Math.abs(point.amount * 1000 / point.perCapita)
    }
  }
  return null
}

function observationValue(amount, detail, year, mode) {
  if (!Number.isFinite(amount)) return null
  if (mode === 'amount') return amount
  const population = detailPopulation(detail, year)
  return Number.isFinite(population) && population > 0 ? amount * 1000 / population : null
}

function resultRecords(detail, line, year) {
  const allowedArts = new Set(line?.drillArtCodes ?? [])
  return (detail?.functions ?? []).flatMap((fn) => {
    // Enkelte funksjoner inngår i flere analysegrupper. Én kanonisk gruppe
    // hindrer at samme regnskapsobservasjon telles flere ganger i en sum.
    const serviceCode = fn.serviceCodes?.[0] ?? 'unclassified'
    const service = detail?.services?.find((item) => item.code === serviceCode)
    return (detail?.accountingArts?.[fn.code] ?? [])
      .filter((art) => allowedArts.has(art.code))
      .map((art) => ({
        dimensions: {
          service: { code: serviceCode, name: service?.name ?? 'Ikke gruppert' },
          function: { code: fn.code, name: fn.name },
          art: { code: art.code, name: art.name },
        },
        amount: art.values?.[year]?.amount ?? null,
        values: art.values ?? {},
        sourceTable: art.sourceTable ?? '12367/12368',
      }))
  }).filter((record) => Number.isFinite(record.amount))
}

function balanceRecords(detail, line, year) {
  return (line?.drillBalanceCodes ?? []).map((code) => {
    const item = detail?.statementData?.balance?.[code]
    return {
      dimensions: { balance_chapter: { code, name: item?.name ?? code } },
      amount: item?.values?.[year]?.amount ?? null,
      values: item?.values ?? {},
      sourceTable: item?.sourceTable ?? null,
    }
  }).filter((record) => Number.isFinite(record.amount))
}

function filterRecords(records, selections) {
  return records.filter((record) => Object.entries(selections ?? {}).every(
    ([dimension, code]) => !code || record.dimensions[dimension]?.code === code,
  ))
}

function groupRecords(records, dimension, detail, year, mode) {
  const grouped = new Map()
  for (const record of records) {
    const member = record.dimensions[dimension]
    if (!member) continue
    const current = grouped.get(member.code) ?? { ...member, amount: 0, observations: 0 }
    current.amount += record.amount
    current.observations += 1
    grouped.set(member.code, current)
  }
  const total = records.reduce((sum, record) => sum + record.amount, 0)
  return [...grouped.values()].map((item) => ({
    ...item,
    value: observationValue(item.amount, detail, year, mode),
    share: total !== 0 ? item.amount / total * 100 : null,
  })).sort((a, b) => Math.abs(b.value ?? -Infinity) - Math.abs(a.value ?? -Infinity))
}

/**
 * Generisk drillmotor for regnskapsoppstillingene. Rekkefølgen i dimensions
 * bestemmer neste nivå; de samme atomobservasjonene brukes i alle rekkefølger.
 */
export function statementDrill(detail, options) {
  const {
    statementId = 'result', lineId, dimensions = [], selections = {}, year, mode = 'amount', years = [],
  } = options ?? {}
  const line = statementLine(detail, statementId, lineId, year, mode)
  const records = statementId === 'balance'
    ? balanceRecords(detail, line, year)
    : resultRecords(detail, line, year)
  const filtered = filterRecords(records, selections)
  const nextDimension = dimensions.find((dimension) => !selections?.[dimension]) ?? null
  const rows = nextDimension ? groupRecords(filtered, nextDimension, detail, year, mode) : []
  const amountTotal = filtered.reduce((sum, record) => sum + record.amount, 0)
  const activeTotal = filtered.length ? observationValue(amountTotal, detail, year, mode) : null
  const expected = Object.keys(selections ?? {}).length === 0 ? line?.value : activeTotal
  const difference = Number.isFinite(expected) && Number.isFinite(activeTotal) ? activeTotal - expected : null
  const tolerance = Number.isFinite(expected) ? Math.max(1e-9, Math.abs(expected) * 1e-6) : null
  const history = years.map((historyYear) => {
    const historyRecords = statementId === 'balance'
      ? balanceRecords(detail, statementLine(detail, statementId, lineId, historyYear, mode), historyYear)
      : resultRecords(detail, line, historyYear)
    const selectedHistory = filterRecords(historyRecords, selections)
    const amount = selectedHistory.reduce((sum, record) => sum + record.amount, 0)
    return { v: selectedHistory.length ? observationValue(amount, detail, historyYear, mode) : null }
  })
  return {
    line, rows, nextDimension, activeTotal, history,
    remainingDimensions: dimensions.filter((dimension) => !selections?.[dimension]),
    reconciliation: {
      componentTotal: activeTotal,
      reportedTotal: expected ?? null,
      difference,
      status: difference == null ? 'incomplete' : Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
    },
    note: statementId === 'result'
      ? 'Tjenesteområder er en analysegruppering. Funksjoner som kan høre til flere områder plasseres én gang for å unngå dobbelttelling. SSBs oppstillingstabell og funksjon/art-tabell bruker enkelte ulike regnskapsdefinisjoner; avvik mot oppstillingslinjen vises derfor åpent.'
      : null,
  }
}

function reconciliation(rows, totalId) {
  const total = rows.find((row) => row.id === totalId)?.value
  const components = rows.filter((row) => row.id !== totalId).map((row) => row.value)
  if (!Number.isFinite(total) || components.some((value) => !Number.isFinite(value))) {
    return { componentTotal: null, reportedTotal: total ?? null, difference: null, status: 'incomplete' }
  }
  const componentTotal = components.reduce((sum, value) => sum + value, 0)
  const difference = componentTotal - total
  const tolerance = Math.max(1e-9, Math.abs(total) * 1e-9)
  return {
    componentTotal,
    reportedTotal: total,
    difference,
    status: Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
  }
}

function resultView(detail, year, mode) {
  const sections = RESULT_SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.map((row) => materializeLine(detail, row, year, mode, 'result')),
  }))
  return {
    id: 'result',
    label: 'Resultat',
    year,
    mode,
    sections,
    reconciliations: {
      operating_revenue: reconciliation(sections[0].rows, 'total_operating_revenue'),
      operating_expense: reconciliation(sections[1].rows, 'total_operating_expense'),
    },
  }
}

function balanceView(detail, year, mode) {
  const sections = BALANCE_SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.map((row) => materializeLine(detail, row, year, mode, 'balance')),
  }))
  const totalAssets = sections[0].rows.find((row) => row.id === 'total_assets')?.value
  const totalEquityDebt = sections[1].rows.find((row) => row.id === 'total_equity_debt')?.value
  const complete = Number.isFinite(totalAssets) && Number.isFinite(totalEquityDebt)
  const difference = complete ? totalAssets - totalEquityDebt : null
  const tolerance = complete ? Math.max(1e-9, Math.abs(totalEquityDebt) * 1e-9) : null
  return {
    id: 'balance', label: 'Balanse', year, mode, sections,
    reconciliations: {
      balance: {
        componentTotal: totalAssets ?? null,
        reportedTotal: totalEquityDebt ?? null,
        difference,
        status: !complete ? 'incomplete' : Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
      },
    },
    limitations: ['SSBs publiserte balanse for kommunekonsern har balansekapittel, men ikke sektor eller motpart.'],
  }
}

const CASHFLOW_SECTIONS = [
  {
    id: 'operating', label: 'Kontantstrøm fra drift', totalId: 'operating_cashflow',
    rows: [
      { id: 'taxes_and_block_grant', label: 'Skatt og rammetilskudd', sources: [resultSource('AGD75'), resultSource('A800'), resultSource('AG10'), resultSource('AGD76')] },
      { id: 'sales_and_user_payments', label: 'Brukerbetalinger, salg og leie', sources: [resultSource('A600'), resultSource('AGD96')] },
      { id: 'other_operating_receipts', label: 'Andre tilskudd og driftsinntekter', sources: [resultSource('AGD77'), resultSource('AGD78')] },
      { id: 'wages_and_social_costs', label: 'Lønn og sosiale kostnader', sources: [resultSource('AG15', -1), resultSource('AG35', -1)] },
      { id: 'goods_and_services', label: 'Varer og tjenester', sources: [resultSource('AG17', -1), resultSource('AGD51', -1)] },
      { id: 'operating_transfers', label: 'Overføringer og tilskudd', sources: [resultSource('AGD80', -1)] },
      { id: 'net_interest', label: 'Netto renter', sources: [resultSource('AGD79'), resultSource('AGD82', -1)] },
      { id: 'operating_cashflow', label: 'Netto kontantstrøm fra drift', calculatedFromSection: true, kind: 'total' },
    ],
  },
  {
    id: 'investing', label: 'Kontantstrøm fra investeringer', totalId: 'investing_cashflow',
    rows: [
      { id: 'fixed_asset_investments', label: 'Investeringer i varige driftsmidler', sources: [investmentSource('AGI39', -1)] },
      { id: 'investment_grants', label: 'Investeringstilskudd og overføringer', sources: [investmentSource('AGI40', -1)] },
      { id: 'shares_and_equity_investments', label: 'Kjøp av aksjer og andeler', sources: [investmentSource('AGI41', -1)] },
      { id: 'new_loans_receivable', label: 'Utlån med egne midler', sources: [investmentSource('AGI42', -1)] },
      { id: 'asset_sales', label: 'Salg av varige driftsmidler', sources: [investmentSource('AGI44')] },
      { id: 'share_sales', label: 'Salg av aksjer og andeler', sources: [investmentSource('929')] },
      { id: 'company_distributions', label: 'Utdeling fra selskaper', sources: [investmentSource('AGI45')] },
      { id: 'loan_repayments_received', label: 'Mottatte avdrag på utlån', sources: [investmentSource('AGI46')] },
      { id: 'investing_cashflow', label: 'Netto kontantstrøm fra investeringer', calculatedFromSection: true, kind: 'total' },
    ],
  },
  {
    id: 'financing', label: 'Kontantstrøm fra finansiering', totalId: 'financing_cashflow',
    rows: [
      { id: 'new_borrowing', label: 'Nye lån', sources: [investmentSource('AGI17')] },
      { id: 'loan_repayments', label: 'Avdrag på lån', sources: [investmentSource('AG5', -1)] },
      { id: 'financing_cashflow', label: 'Netto kontantstrøm fra finansiering', calculatedFromSection: true, kind: 'total' },
    ],
  },
]

function materializeCashflowSection(detail, section, year, mode) {
  const components = section.rows
    .filter((row) => !row.calculatedFromSection)
    .map((row) => materializeLine(detail, row, year, mode, 'cashflow'))
  const reported = components.filter((row) => Number.isFinite(row.value))
  const complete = reported.length === components.length
  const totalDefinition = section.rows.find((row) => row.calculatedFromSection)
  const total = {
    ...totalDefinition,
    statementId: 'cashflow',
    value: complete ? reported.reduce((sum, row) => sum + row.value, 0) : null,
    incomplete: !complete,
    availableDimensions: [],
    sourceObservations: components.flatMap((row) => row.sourceObservations),
    clickable: true,
  }
  return { ...section, rows: [...components, total] }
}

function balanceMovement(detail, code, year, mode) {
  const current = rawPoint(detail, balanceSource(code), year)?.amount
  const previous = rawPoint(detail, balanceSource(code), Number(year) - 1)?.amount
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  const amount = current - previous
  if (mode === 'amount') return amount
  return observationValue(amount, detail, year, mode)
}

function cashflowView(detail, year, mode) {
  const coreSections = CASHFLOW_SECTIONS.map((section) => materializeCashflowSection(detail, section, year, mode))
  const totals = coreSections.map((section) => section.rows.at(-1).value)
  const netCashflow = totals.every(Number.isFinite) ? totals.reduce((sum, value) => sum + value, 0) : null
  const closingCash = rawPoint(detail, balanceSource('KG52'), year)?.[mode] ?? null
  const reportedMovement = balanceMovement(detail, 'KG52', year, mode)
  const openingAmount = rawPoint(detail, balanceSource('KG52'), Number(year) - 1)?.amount
  const openingCash = mode === 'amount' ? openingAmount : observationValue(openingAmount, detail, year, mode)
  const liquiditySection = {
    id: 'liquidity', label: 'Endring i likviditet',
    rows: [
      { id: 'opening_cash', label: 'Bankinnskudd og kontanter ved årets start', value: openingCash, availableDimensions: [], sourceObservations: [], clickable: true },
      { id: 'net_cashflow', label: 'Beregnet netto kontantstrøm', value: netCashflow, kind: 'result', availableDimensions: [], sourceObservations: [], clickable: true },
      { id: 'reported_cash_movement', label: 'Rapportert endring i bankinnskudd og kontanter', value: reportedMovement, kind: 'subtotal', availableDimensions: [], sourceObservations: [], clickable: true },
      { id: 'closing_cash', label: 'Bankinnskudd og kontanter ved årets slutt', value: Number.isFinite(closingCash) ? closingCash : null, availableDimensions: [], sourceObservations: [], clickable: true },
    ],
  }
  const complete = Number.isFinite(netCashflow) && Number.isFinite(reportedMovement)
  const difference = complete ? netCashflow - reportedMovement : null
  const tolerance = complete ? Math.max(1e-9, Math.abs(reportedMovement) * 1e-9) : null
  return {
    id: 'cashflow', label: 'Kontantstrøm', year, mode, calculated: true,
    sections: [...coreSections, liquiditySection],
    reconciliations: {
      cash: {
        componentTotal: netCashflow,
        reportedTotal: reportedMovement,
        difference,
        status: !complete ? 'incomplete' : Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
      },
    },
    note: 'Kontantstrømmen er beregnet fra rapportert KOSTRA-regnskap. Bank ved årets start + beregnet netto kontantstrøm sammenlignes med bank ved årets slutt. Forskjellen mot den rapporterte bankbevegelsen vises åpent og kan blant annet skyldes periodisering, interne føringer og poster som ikke lar seg klassifisere entydig som kontantstrøm.',
    limitations: ['SSB publiserer ikke kontantstrøm koblet til funksjon og art. Beregnede kontantstrømlinjer har derfor historikk, men ingen konstruert funksjons- eller artsdrill.'],
  }
}

export function statementView(detail, statementId = 'result', year, mode = 'amount') {
  if (statementId === 'result') return resultView(detail, year, mode)
  if (statementId === 'balance') return balanceView(detail, year, mode)
  if (statementId === 'cashflow') return cashflowView(detail, year, mode)
  return { id: statementId, label: STATEMENT_TYPES.find((item) => item.id === statementId)?.label ?? statementId, year, mode, sections: [], reconciliations: {} }
}
