const stateKinds = ['growth', 'real-expenditure', 'annual-change']
const budgetKinds = ['budget-totals', 'budget-changes', 'budget-bridge']
const fields = {
  expenditure: ['Statens regnskapsførte utgifter', 'mill. kr'],
  perCapita: ['Utgifter per innbygger', 'kr per innbygger'],
  realPerCapita: ['KPI-justerte utgifter per innbygger', 'kr per innbygger i faste priser'],
  population: ['Folkemengde ved inngangen til året', 'personer'],
  cpi: ['Konsumprisindeks', 'indeks'],
}
export function graphPlan(copy, report) {
  const allowed = report.kind === 'budget-comparison' ? budgetKinds : stateKinds
  const plan =
    copy.graphs === undefined ? allowed.map((kind, i) => ({ kind, afterSection: i })) : copy.graphs
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 7)
    throw Error('Velg én til syv grafer')
  for (const graph of plan) {
    if (
      !graph ||
      !Number.isInteger(graph.afterSection) ||
      graph.afterSection < 0 ||
      graph.afterSection >= copy.sections.length
    )
      throw Error('Grafen må plasseres etter en faktisk seksjon')
    if (graph.kind === 'series') seriesGraph(graph, report)
    else if (!allowed.includes(graph.kind)) throw Error('Ukjent graf for denne rapporttypen')
    const keys =
      graph.kind === 'series'
        ? ['kind', 'afterSection', 'title', 'description', 'mode', 'series']
        : ['kind', 'afterSection']
    if (Object.keys(graph).some((k) => !keys.includes(k)))
      throw Error('Grafen kan bare inneholde kontrollerte seriehenvisninger, ikke egne verdier')
    for (const key of ['title', 'description'])
      if (
        graph[key] !== undefined &&
        (typeof graph[key] !== 'string' || !graph[key].trim() || graph[key].length > 300)
      )
        throw Error('Ugyldig graftekst')
  }
  return plan
}
export function seriesGraph(graph, report) {
  if (
    !['values', 'index'].includes(graph.mode) ||
    !Array.isArray(graph.series) ||
    graph.series.length < 1 ||
    graph.series.length > 5
  )
    throw Error('Seriegrafen krever målestokk og én til fem kontrollerte serier')
  const identities = new Set()
  const series = graph.series.map((ref) => {
    if (
      !ref ||
      Object.keys(ref).some((k) => !['source', 'id', 'label'].includes(k)) ||
      (ref.label !== undefined &&
        (typeof ref.label !== 'string' || !ref.label.trim() || ref.label.length > 100))
    )
      throw Error('Ugyldig seriehenvisning')
    const identity = `${ref.source}:${ref.id}`
    if (identities.has(identity)) throw Error('Duplisert seriehenvisning')
    identities.add(identity)
    if (ref.source === 'ssb') {
      const evidence = report.ssbEvidence?.find((e) => e.id === ref.id)
      if (!evidence) throw Error('SSB-serien finnes ikke i det frosne datagrunnlaget')
      return {
        label: ref.label ?? evidence.title,
        unit: evidence.unit,
        rows: evidence.rows,
        source: `SSB, tabell ${evidence.table}`,
      }
    }
    if (
      ref.source === 'fellestall' &&
      report.kind === 'real-expenditure-per-capita' &&
      fields[ref.id]
    ) {
      const [label, unit] = fields[ref.id]
      return {
        label: ref.label ?? label,
        unit,
        rows: report.rows.map((r) => ({ year: r.year, value: r[ref.id] })),
        source: 'Fellestall, analysens regnskapsgrunnlag',
      }
    }
    if (ref.source === 'post') {
      const evidence = report.eventEvidence?.items.find((e) => e.id === ref.id)
      if (evidence)
        return {
          label: ref.label ?? evidence.title,
          unit: 'mill. kr',
          rows: evidence.rows
            .filter((r) => r.reported)
            .map((r) => ({ year: r.year, value: r.expenditure })),
          source: 'Fellestall, de oppgitte regnskapspostene',
        }
    }
    throw Error('Ukjent seriehenvisning')
  })
  for (const s of series) {
    const years = new Set()
    for (const r of s.rows) {
      if (!Number.isInteger(r.year) || !Number.isFinite(r.value) || years.has(r.year))
        throw Error('Ugyldig frosset grafserie')
      years.add(r.year)
    }
  }
  const years = series[0].rows
    .map((r) => r.year)
    .filter((y) => series.every((s) => s.rows.some((r) => r.year === y)))
    .sort((a, b) => a - b)
  if (years.length < 2 || years.some((y, i) => i && y !== years[i - 1] + 1))
    throw Error('Grafen krever minst to felles sammenhengende observerte år')
  if (graph.mode === 'values' && new Set(series.map((s) => s.unit)).size !== 1)
    throw Error('Ulike enheter kan ikke tegnes på samme verdiakse; bruk indeks')
  const result = series.map((s) => {
    const rows = years.map((year) => s.rows.find((r) => r.year === year))
    const base = rows[0].value
    if (graph.mode === 'index' && base <= 0)
      throw Error('Indeksgrafen krever positiv verdi i det felles basisåret')
    const values = rows.map((r) => (graph.mode === 'index' ? (r.value / base) * 100 : r.value))
    if (values.some((v) => !Number.isFinite(v))) throw Error('Grafberegningen gir en ugyldig verdi')
    return { ...s, values }
  })
  return {
    years,
    series: result,
    unit: graph.mode === 'index' ? 'indeks' : series[0].unit,
    baseYear: years[0],
    indexed: graph.mode === 'index',
  }
}
