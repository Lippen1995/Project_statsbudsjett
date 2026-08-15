const PALETTE = ['#F3E6D8', '#E9C7AF', '#D99D7D', '#C97052', '#9F3F2C']

export function parseKostraRoute(hash = '') {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] !== 'kostra') return { page: 'map', countyCode: null }
  if (parts[1] === 'kommune' && /^\d{4}$/.test(parts[2] ?? '')) {
    return { page: 'detail', kind: 'municipality', code: parts[2] }
  }
  if (parts[1] === 'fylke' && /^\d{2}$/.test(parts[2] ?? '')) {
    if (parts[3] === 'detaljer') {
      return { page: 'detail', kind: 'county', code: `${parts[2]}00` }
    }
    return { page: 'map', countyCode: parts[2] }
  }
  return { page: 'map', countyCode: null }
}

export function mapValue(index, metricId, year, entityId, mode) {
  const point = index?.values?.[metricId]?.[year]?.[entityId]
  return point?.[mode] ?? null
}

/** Totalsummer kan ikke sammenlignes på tvers av regioner med ulik størrelse. */
export function comparisonEntityIds(entityId, comparisons, mode) {
  if (mode !== 'perCapita') return [entityId]
  return [entityId, comparisons?.peerGroupEntityId, comparisons?.norwayEntityId].filter(Boolean)
}

/** Velg den tidsserien som svarer til brukerens posisjon i økonomidrillen. */
export function drillHistory(detail, years, serviceCode, functionCode) {
  const selected = functionCode
    ? detail?.functions?.find((item) => item.code === functionCode)
    : serviceCode
      ? detail?.services?.find((item) => item.code === serviceCode)
      : null
  const values = selected?.metrics?.net_expenses ?? detail?.overview?.net_expenses
  const points = years.map((year) => ({ v: values?.[year]?.amount ?? null }))
  const available = points.map((item) => item.v).filter(Number.isFinite)
  return {
    name: selected?.name ?? 'Netto driftsutgifter totalt',
    points,
    latestValue: available.at(-1) ?? null,
    fromZero: !available.some((value) => value < 0),
  }
}

/** Rene kodebytter påvirker ikke sammenlignbarheten og trenger ikke varsles i UI-et. */
export function materialBoundaryHistory(changes = []) {
  return changes.filter((change) => change.relationType === 'boundary_change')
}

export function populationForEntity(index, year, entityId) {
  for (const metricId of ['revenues', 'expenses', 'debt', 'investments']) {
    const point = index?.values?.[metricId]?.[year]?.[entityId]
    if (Number.isFinite(point?.amount) && Number.isFinite(point?.perCapita) && point.perCapita !== 0) {
      return Math.round(Math.abs(point.amount * 1000 / point.perCapita))
    }
  }
  return null
}

/** Summer kartets enheter uten å summere per-innbyggerverdier direkte. */
export function summarizeKostraEntities(index, metricId, year, entityIds) {
  let amount = 0
  let population = 0
  let availableEntities = 0
  let completePopulation = true

  for (const entityId of entityIds) {
    const point = index?.values?.[metricId]?.[year]?.[entityId]
    const entityPopulationValue = populationForEntity(index, year, entityId)
    if (Number.isFinite(entityPopulationValue)) population += entityPopulationValue
    else completePopulation = false
    if (!Number.isFinite(point?.amount)) continue
    amount += point.amount
    availableEntities += 1
  }

  const entities = entityIds.length
  const complete = entities > 0 && availableEntities === entities
  const onePoint = entityIds.length === 1
    ? index?.values?.[metricId]?.[year]?.[entityIds[0]]
    : null
  const completeAmount = complete ? amount : null
  const completePopulationValue = completePopulation && entities > 0 ? population : null
  const perCapita = complete && onePoint && Number.isFinite(onePoint.perCapita)
    ? onePoint.perCapita
    : complete && completePopulation && population > 0
      ? amount * 1000 / population
      : null
  return {
    amount: completeAmount,
    perCapita,
    population: completePopulationValue,
    entities,
    availableEntities,
    complete,
  }
}

export function choroplethColor(value, values) {
  if (value == null || !Number.isFinite(value)) return '#E3DED4'
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return PALETTE[0]
  const rank = sorted.findIndex((candidate) => candidate >= value)
  const percentile = (rank < 0 ? sorted.length - 1 : rank) / Math.max(1, sorted.length - 1)
  return PALETTE[Math.min(PALETTE.length - 1, Math.floor(percentile * PALETTE.length))]
}

export function formatKostraValue(value, mode) {
  if (value == null) return '–'
  if (mode === 'perCapita') {
    return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value)} kr`
  }
  const mill = value / 1000
  const abs = Math.abs(mill)
  const sign = mill < 0 ? '−' : ''
  if (abs >= 1000) return `${sign}${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(abs / 1000)} mrd.`
  return `${sign}${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(abs)} mill.`
}

export function metricSeries(index, metricId, entityId, mode) {
  return index.years.map((year) => ({ v: mapValue(index, metricId, year, entityId, mode) }))
}
