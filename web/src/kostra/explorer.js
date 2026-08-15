const DRILL_METRICS = [
  ['revenues', 'Inntekter'],
  ['expenses', 'Utgifter'],
  ['investments', 'Investeringer'],
  ['debt', 'Gjeld'],
]

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
    if (year !== detail?.latestYear) return []
    const population = detailPopulation(detail, year)
    return (detail?.accountingArts?.[functionCode] ?? []).map((item) => row(
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
