const DRILL_METRICS = [
  ['revenues', 'Inntekter'],
  ['expenses', 'Utgifter'],
  ['investments', 'Investeringer'],
  ['debt', 'Gjeld'],
]

// Offisielle, gjensidig utelukkende hovedgrupper under AGD10. Øvrige
// artskoder i tabell 12367/12368 er summer eller underarter av disse og ville
// derfor ha dobbelttelt beløpene i en artsfordeling.
const GROSS_EXPENSE_COMPONENTS = new Set(['AG16', 'AGD50', 'AGD51', 'AG34', 'A590'])

function point(item, metricId, year) {
  return item?.metrics?.[metricId]?.[year] ?? null
}

function detailPopulation(detail, year) {
  for (const metricId of ['revenues', 'expenses', 'debt', 'investments']) {
    const value = detail?.overview?.[metricId]?.[year]
    if (Number.isFinite(value?.amount) && Number.isFinite(value?.perCapita) && value.perCapita !== 0) {
      return Math.round(Math.abs(value.amount * 1000 / value.perCapita))
    }
  }
  return null
}

function row(code, name, value, kind, clickable = true) {
  return {
    code,
    name,
    amount: value?.amount ?? null,
    perCapita: value?.perCapita ?? null,
    kind,
    clickable,
  }
}

function accountingArtValue(item, year, latestYear) {
  if (item?.values) return item.values?.[year] ?? null
  // Leser gamle, lokalt genererte filer fram til neste ETL-kjøring. Disse
  // inneholder bare siste år og skal aldri brukes som historiske verdier.
  return year === latestYear && Number.isFinite(item?.amount)
    ? { amount: item.amount }
    : null
}

/**
 * Lag en avstembar artsfordeling for brutto driftsutgifter på én funksjon.
 * Beløp er i 1000 kroner i SSB-kilden; per innbygger blir derfor ganget med
 * 1000. Manglende rader forblir manglende og blir ikke gjort om til null.
 */
export function accountingArtBreakdown(detail, year, functionCode) {
  const population = detailPopulation(detail, year)
  const arts = detail?.accountingArts?.[functionCode] ?? []
  const componentRows = arts
    .filter((item) => GROSS_EXPENSE_COMPONENTS.has(item.code))
    .map((item) => ({ item, value: accountingArtValue(item, year, detail?.latestYear) }))
    .filter(({ value }) => Number.isFinite(value?.amount))
  const hasCompleteComponents = componentRows.length === GROSS_EXPENSE_COMPONENTS.size
  const componentTotal = hasCompleteComponents
    ? componentRows.reduce((sum, { value }) => sum + value.amount, 0)
    : null
  const totalArt = arts.find((item) => item.code === 'AGD10')
  const publishedTotal = accountingArtValue(totalArt, year, detail?.latestYear)?.amount
  const functionTotal = Number.isFinite(publishedTotal)
    ? publishedTotal
    : detail?.functions?.find((item) => item.code === functionCode)
      ?.metrics?.gross_expenses?.[year]?.amount ?? null
  const difference = Number.isFinite(componentTotal) && Number.isFinite(functionTotal)
    ? componentTotal - functionTotal
    : null
  const tolerance = Number.isFinite(functionTotal) ? Math.max(1, Math.abs(functionTotal) * 1e-6) : null
  const status = !hasCompleteComponents
    ? 'incomplete-components'
    : !Number.isFinite(functionTotal)
      ? 'missing-total'
      : Math.abs(difference) <= tolerance
        ? 'reconciled'
        : 'difference'

  return {
    rows: componentRows.map(({ item, value }) => ({
      ...row(item.code, item.name, {
        amount: value.amount,
        perCapita: population ? value.amount * 1000 / population : null,
      }, 'art', false),
      share: Number.isFinite(componentTotal) && componentTotal !== 0
        ? value.amount / componentTotal * 100
        : null,
    })),
    reconciliation: {
      componentTotal,
      functionTotal,
      difference,
      status,
    },
  }
}

/** Sorter en kopi slik at manglende verdier alltid havner nederst. */
export function sortExplorerRows(rows, sortKey, direction = 'desc') {
  return [...rows].sort((a, b) => {
    const aValue = a[sortKey]
    const bValue = b[sortKey]
    if (!Number.isFinite(aValue)) return Number.isFinite(bValue) ? 1 : 0
    if (!Number.isFinite(bValue)) return -1
    return direction === 'asc' ? aValue - bValue : bValue - aValue
  })
}

/** Returner neste synlige nivå i den innebygde økonomidrillen. */
export function explorerDrillRows(detail, year, path) {
  const { metricId, serviceCode, functionCode } = path
  if (!metricId) {
    return DRILL_METRICS.map(([id, name]) => row(
      id,
      name,
      detail?.overview?.[id]?.[year],
      'metric',
      true,
    ))
  }

  if (metricId === 'debt') return []
  if (metricId === 'revenues') {
    if (year !== detail?.latestYear) return []
    const population = detailPopulation(detail, year)
    return (detail?.revenueBreakdown ?? []).map((item) => row(
      item.code,
      item.name,
      {
        amount: item.amount,
        perCapita: population ? item.amount * 1000 / population : null,
      },
      'art',
      false,
    ))
  }

  const serviceMetric = metricId === 'investments' ? 'investments' : 'gross_expenses'
  if (functionCode) {
    if (metricId === 'investments') return []
    return accountingArtBreakdown(detail, year, functionCode).rows
  }

  if (serviceCode) {
    return (detail?.functions ?? [])
      .filter((item) => item.serviceCodes?.includes(serviceCode))
      .map((item) => row(item.code, item.name, point(item, serviceMetric, year), 'function'))
  }

  return (detail?.services ?? []).map((item) => (
    row(item.code, item.name, point(item, serviceMetric, year), 'service')
  ))
}

/** Historikken følger samme valgte nivå som radene, men stopper ved funksjon. */
export function explorerHistory(detail, years, path) {
  const { metricId, serviceCode, functionCode } = path
  if (!metricId) return null
  const selected = functionCode
    ? detail?.functions?.find((item) => item.code === functionCode)
    : serviceCode
      ? detail?.services?.find((item) => item.code === serviceCode)
      : null
  const serviceMetric = metricId === 'investments' ? 'investments' : 'gross_expenses'
  const values = selected
    ? selected.metrics?.[serviceMetric]
    : detail?.overview?.[metricId]
  const points = years.map((year) => ({ v: values?.[year]?.amount ?? null }))
  const available = points.map((item) => item.v).filter(Number.isFinite)
  return {
    name: selected?.name ?? DRILL_METRICS.find(([id]) => id === metricId)?.[1] ?? metricId,
    points,
    fromZero: !available.some((value) => value < 0),
  }
}
