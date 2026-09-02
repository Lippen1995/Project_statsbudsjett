export const STATEMENT_TYPES = [
  { id: 'result', label: 'Resultat' },
  { id: 'balance', label: 'Balanse' },
  { id: 'cashflow', label: 'Kontantstrøm' },
]

export const DIMENSIONS = {
  line: { id: 'line', label: 'Regnskapslinje' },
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

const RESULT_OVERVIEW = [
  {
    id: 'operating_revenue', label: 'Inntekter', sources: [resultSource('AGD45')], kind: 'total',
    childLineIds: ['tax_income', 'block_grant', 'property_tax', 'other_tax', 'user_payments', 'sales_rent', 'state_grants', 'other_operating_revenue'],
  },
  {
    id: 'operating_expense', label: 'Driftskostnader', sources: [resultSource('AGD46')], kind: 'total',
    childLineIds: ['wages', 'goods_services', 'purchased_services', 'transfers', 'depreciation'],
  },
  {
    id: 'gross_operating_result', label: 'Bruttoresultat',
    sources: [resultSource('AGD45'), resultSource('AGD46', -1)], kind: 'subtotal',
  },
  {
    id: 'net_finance_expense', label: 'Netto finans',
    sources: [resultSource('AGD79'), resultSource('AGD81'), resultSource('AGD83'), resultSource('AGD82', -1)],
    kind: 'subtotal',
    childLineIds: ['interest_income', 'dividends', 'financial_gains', 'interest_expense'],
    childLineFactors: { interest_income: 1, dividends: 1, financial_gains: 1, interest_expense: -1 },
  },
  {
    id: 'net_operating_result', label: 'Nettoresultat', kind: 'result',
    sources: [resultSource('AGD45'), resultSource('AGD46', -1), resultSource('AGD79'), resultSource('AGD81'), resultSource('AGD83'), resultSource('AGD82', -1)],
  },
]

const BALANCE_SECTIONS = [
  {
    id: 'assets', label: 'Eiendeler',
    rows: [
      { id: 'fixed_property', label: 'Fast eiendom og anlegg', sources: [balanceSource('KG43')], drillBalanceCodes: ['KG43'] },
      { id: 'equipment', label: 'Maskiner, utstyr og transportmidler', sources: [balanceSource('KG44')], drillBalanceCodes: ['KG44'] },
      { id: 'shares', label: 'Aksjer og andeler', sources: [balanceSource('KG46')], drillBalanceCodes: ['KG46'] },
      { id: 'loans_receivable', label: 'Utlån', sources: [balanceSource('KG48')], drillBalanceCodes: ['KG48'] },
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

const BALANCE_OVERVIEW = [
  {
    id: 'assets', label: 'Eiendeler', sources: [balanceSource('KG62')], kind: 'total',
    childLineIds: ['fixed_property', 'equipment', 'shares', 'loans_receivable', 'pension_assets', 'other_noncurrent_assets', 'cash', 'receivables', 'current_financial_assets', 'other_current_assets'],
  },
  {
    id: 'equity_debt', label: 'Egenkapital og gjeld', sources: [balanceSource('KG90')], kind: 'total',
    childLineIds: ['discretionary_fund', 'restricted_operating_fund', 'investment_funds', 'other_equity', 'long_term_debt', 'supplier_debt', 'other_short_term_debt'],
  },
]

function rawPoint(detail, item, year) {
  return detail?.statementData?.[item.dataset]?.[item.code]?.values?.[year] ?? null
}

function sourcesSummary(detail, sources, year, mode) {
  const values = sources.map((item) => {
    const point = rawPoint(detail, item, year)
    const value = point?.[mode]
    return Number.isFinite(value) ? value * item.factor : null
  })
  const reported = values.filter(Number.isFinite)
  return {
    value: reported.length ? reported.reduce((sum, value) => sum + value, 0) : null,
    complete: reported.length === values.length,
    missingCodes: sources.filter((_, index) => !Number.isFinite(values[index])).map((item) => item.code),
  }
}

function sourcesValue(detail, sources, year, mode) {
  return sourcesSummary(detail, sources, year, mode).value
}

function materializeLine(detail, definition, year, mode, statementId) {
  const sourceSummary = sourcesSummary(detail, definition.sources, year, mode)
  const availableDimensions = definition.drillBalanceCodes?.length
    ? ['balance_chapter']
    : definition.drillMetricId
      ? ['service', 'function']
    : definition.drillArtCodes?.length
      ? ['service', 'function', 'art']
      : []
  return {
    ...definition,
    statementId,
    value: sourceSummary.value,
    sourceStatus: sourceSummary.complete ? 'complete' : 'incomplete',
    missingSourceCodes: sourceSummary.missingCodes,
    availableDimensions,
    sourceObservations: definition.sources.map((item) => ({
      ...item,
      name: detail?.statementData?.[item.dataset]?.[item.code]?.name ?? item.code,
      sourceTable: detail?.statementData?.[item.dataset]?.[item.code]?.sourceTable ?? null,
    })),
    clickable: true,
  }
}

function materializeOverviewLine(detail, definition, year, mode, statementId, sections) {
  const children = (definition.childLineIds ?? [])
    .map((id) => sections.flatMap((section) => section.rows).find((row) => row.id === id))
    .filter(Boolean)
  const availableDimensions = children.length
    ? ['line', ...new Set(children.flatMap((row) => row.availableDimensions))]
    : []
  const partialDimensions = availableDimensions.filter((dimension) => (
    dimension !== 'line' && children.some((row) => !row.availableDimensions.includes(dimension))
  ))
  const sourceSummary = definition.valueLineId
    ? null
    : sourcesSummary(detail, definition.sources ?? [], year, mode)
  const valueLine = definition.valueLineId
    ? sections.flatMap((section) => section.rows).find((row) => row.id === definition.valueLineId)
    : null
  return {
    ...definition,
    statementId,
    value: valueLine?.value ?? sourceSummary?.value ?? null,
    sourceStatus: valueLine?.sourceStatus ?? (sourceSummary?.complete ? 'complete' : 'incomplete'),
    missingSourceCodes: valueLine?.missingSourceCodes ?? sourceSummary?.missingCodes ?? [],
    availableDimensions,
    partialDimensions,
    clickable: true,
  }
}

function statementLine(detail, statementId, lineId, year, mode) {
  const view = statementView(detail, statementId, year, mode)
  return [...(view.overviewRows ?? []), ...view.sections.flatMap((section) => section.rows)]
    .find((row) => row.id === lineId) ?? null
}

function statementChildren(detail, statementId, line, year, mode = 'amount') {
  if (!line?.childLineIds?.length) return line ? [line] : []
  return line.childLineIds
    .map((id) => statementLine(detail, statementId, id, year, mode))
    .filter(Boolean)
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
  const factor = line?.drillFactor ?? 1
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
        amount: Number.isFinite(art.values?.[year]?.amount) ? art.values[year].amount * factor : null,
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

function metricRecords(detail, line, year) {
  const factor = line?.drillFactor ?? 1
  return (detail?.functions ?? []).map((fn) => {
    const point = fn.metrics?.[line.drillMetricId]?.[year]
    const serviceCode = fn.serviceCodes?.[0] ?? 'unclassified'
    const service = detail?.services?.find((item) => item.code === serviceCode)
    return {
      dimensions: {
        service: { code: serviceCode, name: service?.name ?? 'Ikke gruppert' },
        function: { code: fn.code, name: fn.name },
      },
      amount: Number.isFinite(point?.amount) ? point.amount * factor : null,
      values: fn.metrics?.[line.drillMetricId] ?? {},
      sourceTable: point?.sourceTable ?? null,
    }
  }).filter((record) => Number.isFinite(record.amount))
}

function recordsForLine(detail, statementId, line, year) {
  if (statementId === 'balance') return balanceRecords(detail, line, year)
  if (line?.drillMetricId) return metricRecords(detail, line, year)
  return resultRecords(detail, line, year)
}

function atomicRecords(detail, statementId, parent, year) {
  return statementChildren(detail, statementId, parent, year, 'amount').flatMap((line) => (
    recordsForLine(detail, statementId, line, year).map((record) => ({
      ...record,
      dimensions: {
        line: { code: line.id, name: line.label },
        ...record.dimensions,
      },
    }))
  ))
}

function lineSummaryRecords(detail, statementId, parent, year) {
  return statementChildren(detail, statementId, parent, year, 'amount').map((line) => ({
    dimensions: { line: { code: line.id, name: line.label } },
    amount: Number.isFinite(line.value) ? line.value * (parent?.childLineFactors?.[line.id] ?? 1) : null,
    values: {},
    sourceTable: line.sourceObservations?.[0]?.sourceTable ?? null,
  })).filter((record) => Number.isFinite(record.amount))
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
  const nextDimension = dimensions.find((dimension) => !selections?.[dimension]) ?? null
  const hasEarlierSelection = Object.keys(selections ?? {}).some((dimension) => dimension !== 'line')
  const records = nextDimension === 'line' && !hasEarlierSelection && !selections?.line
    ? lineSummaryRecords(detail, statementId, line, year)
    : atomicRecords(detail, statementId, line, year)
  const filtered = filterRecords(records, selections)
  const rows = nextDimension ? groupRecords(filtered, nextDimension, detail, year, mode) : []
  const amountTotal = filtered.reduce((sum, record) => sum + record.amount, 0)
  const selectedChild = selections?.line
    ? statementLine(detail, statementId, selections.line, year, mode)
    : null
  const onlyLineSelected = selectedChild && Object.keys(selections ?? {}).every((dimension) => dimension === 'line')
  const activeSourceLine = selectedChild ?? (!line?.childLineIds?.length ? line : null)
  const sourceIncomplete = activeSourceLine?.sourceStatus === 'incomplete'
  const activeTotal = filtered.length ? observationValue(amountTotal, detail, year, mode) : null
  const expected = Object.keys(selections ?? {}).length === 0
    ? line?.value
    : onlyLineSelected ? selectedChild.value : activeTotal
  const difference = Number.isFinite(expected) && Number.isFinite(activeTotal) ? activeTotal - expected : null
  const tolerance = Number.isFinite(expected) ? Math.max(1e-9, Math.abs(expected) * 1e-6) : null
  const history = years.map((historyYear) => {
    if (selections?.line && Object.keys(selections).every((dimension) => dimension === 'line')) {
      return { v: statementLine(detail, statementId, selections.line, historyYear, mode)?.value ?? null }
    }
    const historyLine = statementLine(detail, statementId, lineId, historyYear, mode)
    const historyRecords = atomicRecords(detail, statementId, historyLine, historyYear)
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
      status: sourceIncomplete || difference == null
        ? 'incomplete'
        : Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
    },
    note: statementId === 'result' && dimensions.some((dimension) => ['service', 'function', 'art'].includes(dimension))
      ? 'Tjenesteområder er en analysegruppering. Funksjoner som kan høre til flere områder plasseres én gang for å unngå dobbelttelling. SSBs oppstillingstabell og funksjon/art-tabell bruker enkelte ulike regnskapsdefinisjoner; avvik mot oppstillingslinjen vises derfor åpent.'
      : null,
    coverageNote: [
      line?.partialDimensions?.includes(nextDimension)
        ? `SSB publiserer ikke alle regnskapslinjene med dimensjonen «${DIMENSIONS[nextDimension]?.label}». Fordelingen viser den delen som kan brytes ned; resten er fortsatt med i totalen.`
        : null,
      sourceIncomplete
        ? `Én eller flere underposter mangler i SSB for valgt år (${activeSourceLine.missingSourceCodes.join(', ')}). Rapporterte underposter vises, men summen er markert som ufullstendig.`
        : null,
    ].filter(Boolean).join(' ') || null,
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
    overviewRows: RESULT_OVERVIEW.map((row) => materializeOverviewLine(detail, row, year, mode, 'result', sections)),
    note: 'Resultatoversikten er satt opp som et vanlig regnestykke: Bruttoresultat er inntekter minus driftskostnader, netto finans er rente- og eierinntekter minus renteutgifter, og nettoresultatet er summen av disse. Avdrag på lån vises bare under kontantstrøm. Dette er derfor ikke det samme som KOSTRAs lovbestemte «netto driftsresultat», som også korrigerer for avdrag, avskrivninger og interne poster.',
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
    overviewRows: BALANCE_OVERVIEW.map((row) => materializeOverviewLine(detail, row, year, mode, 'balance', sections)),
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
      { id: 'sales_and_user_payments', label: 'Brukerbetalinger, salg og leie', sources: [resultSource('A600'), resultSource('AGD96')], drillArtCodes: ['A600', 'AGD34'] },
      { id: 'other_operating_receipts', label: 'Andre tilskudd og driftsinntekter', sources: [resultSource('AGD77'), resultSource('AGD78')], drillArtCodes: ['AG48', 'AGD49', 'AGD28'] },
      { id: 'wages_and_social_costs', label: 'Lønn og sosiale kostnader', sources: [resultSource('AG15', -1), resultSource('AG35', -1)], drillArtCodes: ['AG16', 'A710'], drillFactor: -1 },
      { id: 'goods_and_services', label: 'Varer og tjenester', sources: [resultSource('AG17', -1), resultSource('AGD51', -1)], drillArtCodes: ['AGD50', 'AGD51'], drillFactor: -1 },
      { id: 'operating_transfers', label: 'Overføringer og tilskudd', sources: [resultSource('AGD80', -1)], drillArtCodes: ['AG34'], drillFactor: -1 },
      { id: 'net_interest', label: 'Netto renter', sources: [resultSource('AGD79'), resultSource('AGD82', -1)] },
      { id: 'operating_cashflow', label: 'Netto kontantstrøm fra drift', calculatedFromSection: true, kind: 'total' },
    ],
  },
  {
    id: 'investing', label: 'Kontantstrøm fra investeringer', totalId: 'investing_cashflow',
    rows: [
      { id: 'fixed_asset_investments', label: 'Investeringer i varige driftsmidler', sources: [investmentSource('AGI39', -1)], drillMetricId: 'investments', drillFactor: -1 },
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

const CASHFLOW_OVERVIEW = [
  {
    id: 'operating', label: 'Kontantstrøm fra drift', valueLineId: 'operating_cashflow', kind: 'total',
    childLineIds: ['taxes_and_block_grant', 'sales_and_user_payments', 'other_operating_receipts', 'wages_and_social_costs', 'goods_and_services', 'operating_transfers', 'net_interest'],
  },
  {
    id: 'investing', label: 'Kontantstrøm fra investeringer', valueLineId: 'investing_cashflow', kind: 'total',
    childLineIds: ['fixed_asset_investments', 'investment_grants', 'shares_and_equity_investments', 'new_loans_receivable', 'asset_sales', 'share_sales', 'company_distributions', 'loan_repayments_received'],
  },
  {
    id: 'financing', label: 'Kontantstrøm fra finansiering', valueLineId: 'financing_cashflow', kind: 'total',
    childLineIds: ['new_borrowing', 'loan_repayments'],
  },
  { id: 'net_cashflow_summary', label: 'Netto kontantstrøm', valueLineId: 'net_cashflow', kind: 'result' },
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
    overviewRows: CASHFLOW_OVERVIEW.map((row) => materializeOverviewLine(
      detail, row, year, mode, 'cashflow', [...coreSections, liquiditySection],
    )),
    reconciliations: {
      cash: {
        componentTotal: netCashflow,
        reportedTotal: reportedMovement,
        difference,
        status: !complete ? 'incomplete' : Math.abs(difference) <= tolerance ? 'reconciled' : 'difference',
      },
    },
    note: 'Kontantstrømmen er beregnet fra rapportert KOSTRA-regnskap. Bank ved årets start + beregnet netto kontantstrøm sammenlignes med bank ved årets slutt. Forskjellen mot den rapporterte bankbevegelsen vises åpent og kan blant annet skyldes periodisering, interne føringer og poster som ikke lar seg klassifisere entydig som kontantstrøm.',
    limitations: ['SSB publiserer ikke en egen kontantstrøm koblet til funksjon og art. Der de samme regnskapsartene finnes i funksjon/art-tabellen, vises den tilgjengelige fordelingen og eventuelle avvik mot kontantstrømlinjen beholdes. Investeringer kan fordeles på funksjon, men ikke på art.'],
  }
}

export function statementView(detail, statementId = 'result', year, mode = 'amount') {
  if (statementId === 'result') return resultView(detail, year, mode)
  if (statementId === 'balance') return balanceView(detail, year, mode)
  if (statementId === 'cashflow') return cashflowView(detail, year, mode)
  return { id: statementId, label: STATEMENT_TYPES.find((item) => item.id === statementId)?.label ?? statementId, year, mode, sections: [], reconciliations: {} }
}
