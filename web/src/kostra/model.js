const PALETTE = ['#F3E6D8', '#E9C7AF', '#D99D7D', '#C97052', '#9F3F2C']
const EQUALIZATION_CONTRIBUTOR = ['#DCE8E3', '#AFCFC4', '#61998A', '#14594F']
const EQUALIZATION_RECIPIENT = ['#F3E6D8', '#E5B99F', '#CF795A', '#9F3F2C']
const EQUALIZATION_NEUTRAL = '#D8D2C8'

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
    if (parts[3] === 'detaljer') {
      return { page: 'detail', kind: 'municipality', code: parts[2] }
    }
    return { page: 'map', countyCode: parts[2].slice(0, 2), municipalityCode: parts[2] }
  }
  if (parts[1] === 'fylke' && /^\d{2}$/.test(parts[2] ?? '')) {
    if (parts[3] === 'detaljer') {
      return { page: 'detail', kind: 'county', code: `${parts[2]}00` }
    }
    return { page: 'map', countyCode: parts[2] }
  }
  return { page: 'map', countyCode: null }
}

/** Skille dagens kartkommuner fra historiske eller ukjente koder. */
export function municipalityCodeStatus(index, code) {
  if (!code) return null
  const entityId = `municipality:${code}`
  const isActive = (index?.entities ?? []).some((entity) => entity.id === entityId)
  if (isActive) return 'active'
  const isHistorical = (index?.historicalEntities ?? []).some((entity) => entity.id === entityId)
  return isHistorical ? 'historical' : 'unknown'
}

/** Scroll bare ved en reell inngang til en dyp KOSTRA-lenke, aldri ved intern drill. */
export function shouldScrollToKostra(previousHash, nextHash, sectionVisible = false) {
  if (!nextHash.startsWith('#kostra')) return false
  if (previousHash == null) return true
  const alreadyInKostra = previousHash === '#kommuner' || previousHash.startsWith('#kostra')
  return !alreadyInKostra && !sectionVisible
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
export function drillHistory(detail, years, serviceCode, functionCode, mode = 'amount') {
  const selected = functionCode
    ? detail?.functions?.find((item) => item.code === functionCode)
    : serviceCode
      ? detail?.services?.find((item) => item.code === serviceCode)
      : null
  const values = selected?.metrics?.net_expenses ?? detail?.overview?.net_expenses
  const valueKey = mode === 'perCapita' ? 'perCapita' : 'amount'
  const points = years.map((year) => ({ v: values?.[year]?.[valueKey] ?? null }))
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

/** Summer én pengestrøm uten å lage et misvisende nettotall mellom ulike aktører. */
export function stateFlowSummary(stateFlows, direction, year, mode) {
  const valueKey = mode === 'perCapita' ? 'perCapita' : 'amount'
  const rows = (stateFlows?.[direction] ?? []).map((item) => ({
    code: item.code,
    label: item.label,
    value: item.values?.[year]?.[valueKey] ?? null,
  }))
  const complete = rows.length > 0 && rows.every((row) => Number.isFinite(row.value))
  return {
    rows,
    total: complete ? rows.reduce((sum, row) => sum + row.value, 0) : null,
    complete,
  }
}

/** Forklar om kommunen mottar eller bidrar i den løpende inntektsutjevningen. */
export function incomeEqualizationSummary(incomeEqualization, stateFlows, year, mode) {
  const point = incomeEqualization?.values?.[year]
  if (!point) return null
  const valueKey = mode === 'perCapita' ? 'perCapita' : 'amount'
  const equalization = point.equalization?.[valueKey]
  const taxBefore = point.taxBefore?.[valueKey]
  const taxAfter = point.taxAfter?.[valueKey]
  const blockGrantItem = stateFlows?.incoming?.find((item) => item.code === 'state_block_grant')
  const blockGrantPoint = blockGrantItem?.values?.[year]
  const blockGrant = blockGrantPoint?.[valueKey] ?? null
  const equalizationStatus = !Number.isFinite(taxBefore) || !Number.isFinite(equalization) || !Number.isFinite(taxAfter)
    ? 'missing'
    : equalization === 0 ? 'neutral'
    : equalization < 0 ? 'contributor' : 'recipient'
  const taxBeforeAmount = point.taxBefore?.amount
  const blockGrantAmount = blockGrantPoint?.amount
  const freeIncomeSource = !Number.isFinite(taxBeforeAmount) || !Number.isFinite(blockGrantAmount)
    ? null
    : taxBeforeAmount === blockGrantAmount ? 'equal' : taxBeforeAmount > blockGrantAmount ? 'own_tax' : 'block_grant'

  return {
    year,
    population: point.population ?? null,
    taxBefore,
    equalization,
    taxAfter,
    blockGrant,
    taxBeforeNationalRatio: point.taxBefore?.nationalRatio ?? null,
    taxAfterNationalRatio: point.taxAfter?.nationalRatio ?? null,
    equalizationStatus,
    freeIncomeSource,
    sourceUrl: point.sourceUrl ?? null,
    sourcePeriod: point.sourcePeriod ?? String(year),
  }
}

/** Ett forhåndsberegnet kartpunkt med eksplisitt retning på omfordelingen. */
export function incomeEqualizationPoint(index, year, entityId) {
  const point = index?.incomeEqualization?.[year]?.[entityId]
  const amount = point?.equalization?.amount
  if (!point || !Number.isFinite(amount)) return null
  return {
    ...point,
    status: amount < 0 ? 'contributor' : amount > 0 ? 'recipient' : 'neutral',
  }
}

/** Vis omfordelingens to sider; et nettotall alene ville skjult volumet. */
export function incomeEqualizationMapSummary(index, year, entityIds) {
  let receivedAmount = 0
  let contributedAmount = 0
  let recipients = 0
  let contributors = 0
  let neutral = 0
  let availableEntities = 0
  let population = 0
  let availablePopulation = 0

  for (const entityId of entityIds) {
    const point = incomeEqualizationPoint(index, year, entityId)
    if (!point) continue
    const amount = point.equalization.amount
    availableEntities += 1
    if (Number.isFinite(point.population)) {
      population += point.population
      availablePopulation += 1
    }
    if (amount > 0) {
      receivedAmount += amount
      recipients += 1
    } else if (amount < 0) {
      contributedAmount += Math.abs(amount)
      contributors += 1
    } else {
      neutral += 1
    }
  }
  const complete = entityIds.length > 0 && availableEntities === entityIds.length
  return {
    receivedAmount: complete ? receivedAmount : null,
    contributedAmount: complete ? contributedAmount : null,
    differenceAmount: complete ? receivedAmount - contributedAmount : null,
    recipients,
    contributors,
    neutral,
    availableEntities,
    entities: entityIds.length,
    population: availableEntities > 0 && availablePopulation === availableEntities ? population : null,
    complete,
  }
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

/** Bygg samme hovedpostoversikt for ett kommuneregnskap, uten fylkeskommunale tall. */
export function municipalityOverviewRows(index, year, municipalityId) {
  if (!municipalityId) return []
  const directMetrics = KOSTRA_OVERVIEW_METRICS.filter((metric) => metric.id !== 'result_after_investments')
  const summaries = new Map(directMetrics.map((metric) => [
    metric.id,
    summarizeKostraEntities(index, metric.id, year, [municipalityId]),
  ]))
  const derived = resultAfterInvestments(
    summaries.get('net_result'),
    summaries.get('investments'),
    summaries.get('revenues').population,
  )
  return KOSTRA_OVERVIEW_METRICS.map((metric) => ({
    ...metric,
    summary: metric.id === 'result_after_investments' ? derived : summaries.get(metric.id),
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

/** Divergerende skala: grønt er trekk/bidrag, rust er tillegg/mottak. */
export function incomeEqualizationColor(value, values) {
  if (value == null || !Number.isFinite(value)) return '#E3DED4'
  if (value === 0) return EQUALIZATION_NEUTRAL
  const sameSide = values.filter((candidate) => Number.isFinite(candidate) && Math.sign(candidate) === Math.sign(value))
  const maximum = Math.max(1, ...sameSide.map((candidate) => Math.abs(candidate)))
  const palette = value < 0 ? EQUALIZATION_CONTRIBUTOR : EQUALIZATION_RECIPIENT
  const bucket = Math.min(palette.length - 1, Math.floor(Math.abs(value) / maximum * palette.length))
  return palette[bucket]
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

/** Annualisert vekst fra første gyldige år, samt endring fra året før. */
export function yearlyGrowth(points, years, year) {
  const index = years.indexOf(year)
  if (index < 0) return { annual: null, yoy: null }
  const current = points?.[index]?.v
  if (!Number.isFinite(current)) return { annual: null, yoy: null }

  const firstIndex = points.findIndex((point, pointIndex) => (
    pointIndex < index && Number.isFinite(point?.v) && point.v > 0
  ))
  const elapsedYears = firstIndex >= 0 ? Number(years[index]) - Number(years[firstIndex]) : 0
  const annual = current > 0 && elapsedYears > 0
    ? (Math.pow(current / points[firstIndex].v, 1 / elapsedYears) - 1) * 100
    : null
  const previous = points?.[index - 1]?.v
  return {
    annual,
    yoy: Number.isFinite(previous) && previous > 0
      ? (current - previous) / previous * 100
      : null,
  }
}

export function metricSeries(index, metricId, entityId, mode) {
  return index.years.map((year) => ({ v: mapValue(index, metricId, year, entityId, mode) }))
}
