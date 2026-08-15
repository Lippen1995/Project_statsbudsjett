const PALETTE = ['#F3E6D8', '#E9C7AF', '#D99D7D', '#C97052', '#9F3F2C']

export const KOSTRA_OVERVIEW_METRICS = [
  {
    id: 'revenues',
    label: 'Driftsinntekter',
    description: 'Alle løpende inntekter i driftsregnskapet, blant annet skatt, rammetilskudd, gebyrer og andre overføringer.',
  },
  {
    id: 'expenses',
    label: 'Driftskostnader',
    description: 'Brutto driftsutgifter: alle løpende utgifter til drift og tjenester, inkludert avskrivninger.',
  },
  {
    id: 'net_result',
    label: 'Netto driftsresultat',
    description: 'Viser hva som er igjen etter driften og netto finansutgifter. Beløpet kan brukes til investeringer eller settes av til senere.',
  },
  {
    id: 'investments',
    label: 'Investeringsutgifter',
    description: 'Brutto utgifter til varige investeringer som bygg, anlegg, transportmidler og annet utstyr.',
  },
  {
    id: 'result_after_investments',
    label: 'Driftsresultat etter investeringer',
    description: 'Et utledet tall: netto driftsresultat minus brutto investeringsutgifter. Dette er ikke en egen offisiell KOSTRA-regnskapslinje.',
  },
  {
    id: 'debt',
    label: 'Netto lånegjeld',
    description: 'Langsiktig gjeld fratrukket utlån og ubrukte lånemidler. Pensjonsforpliktelser er ikke med.',
  },
  {
    id: 'net_expenses',
    label: 'Netto driftsutgifter',
    description: 'Driftsutgifter inkludert avskrivninger etter at direkte driftsinntekter er trukket fra. Viser behovet for finansiering fra frie inntekter.',
  },
]

/** Vis den norske kortformen i grensesnittet, også når kilden har parallelle språkformer. */
export function displayEntityName(entity) {
  if (!entity) return ''
  if (entity.id === 'county:03' || entity.id === 'municipality:0301' || /^Oslo(?: kommune)?\s*(?:-|$)/i.test(entity.name ?? '')) {
    return 'Oslo kommune'
  }
  return entity.name ?? entity.code ?? ''
}

/** En kommunesum tilhører geografien fylket, ikke organisasjonen fylkeskommunen. */
export function countyGroupName(entity) {
  const name = displayEntityName(entity)
  if (name === 'Oslo kommune') return name
  const bokmalName = name.split(/\s+-\s+/)[0].replace(/\s+fylkeskommune$/i, '').trim()
  return bokmalName ? `${bokmalName} fylke` : ''
}

/** Søk alltid i aktive kommuner og fylker, uavhengig av hvilket kartnivå som vises. */
export function findKostraEntities(entities, query, limit = 8) {
  const needle = query.trim().toLocaleLowerCase('nb-NO')
  if (needle.length < 2) return []
  return entities
    .filter((entity) => (entity.active == null || Boolean(entity.active)) && ['county', 'municipality'].includes(entity.kind))
    .filter((entity) => `${entity.name ?? ''} ${displayEntityName(entity)} ${entity.code ?? ''}`.toLocaleLowerCase('nb-NO').includes(needle))
    .sort((a, b) => (a.kind === b.kind ? displayEntityName(a).localeCompare(displayEntityName(b), 'nb-NO') : a.kind === 'county' ? -1 : 1))
    .slice(0, limit)
}

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

/** Summer kommuneregnskap innenfor ett eller flere fylker, aldri fylkeskommuneregnskap. */
export function summarizeMunicipalities(index, metricId, year, countyIds) {
  const counties = new Set(countyIds)
  const entityIds = (index?.entities ?? [])
    .filter((entity) => entity.kind === 'municipality' && counties.has(entity.parent_id))
    .map((entity) => entity.id)
  return { ...summarizeKostraEntities(index, metricId, year, entityIds), entityIds }
}

function resultAfterInvestments(result, investments, population) {
  const complete = result.complete && investments.complete
  const amount = complete ? result.amount - investments.amount : null
  const usablePopulation = Number.isFinite(population) && population > 0 ? population : null
  return {
    amount,
    perCapita: amount != null && usablePopulation ? amount * 1000 / usablePopulation : null,
    population: usablePopulation,
    entities: result.entities,
    availableEntities: Math.min(result.availableEntities, investments.availableEntities),
    complete,
  }
}

/** Bygg den faste toppoversikten uten å blande fylkes- og kommuneregnskap. */
export function overviewComparisonRows(index, year, countyIds) {
  const directMetrics = KOSTRA_OVERVIEW_METRICS.filter((metric) => metric.id !== 'result_after_investments')
  const summaries = new Map(directMetrics.map((metric) => [metric.id, {
    county: summarizeKostraEntities(index, metric.id, year, countyIds),
    municipalities: summarizeMunicipalities(index, metric.id, year, countyIds),
  }]))
  const revenue = summaries.get('revenues')
  const derived = {
    county: resultAfterInvestments(
      summaries.get('net_result').county,
      summaries.get('investments').county,
      revenue.county.population,
    ),
    municipalities: resultAfterInvestments(
      summaries.get('net_result').municipalities,
      summaries.get('investments').municipalities,
      revenue.municipalities.population,
    ),
  }
  return KOSTRA_OVERVIEW_METRICS.map((metric) => ({
    ...metric,
    ...(metric.id === 'result_after_investments' ? derived : summaries.get(metric.id)),
  }))
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
