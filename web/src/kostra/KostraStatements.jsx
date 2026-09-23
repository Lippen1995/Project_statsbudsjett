import React, { useEffect, useMemo, useRef, useState } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { formatKostraShare, formatKostraValue, yearlyGrowth } from './model'
import KostraGrowthSummary from './KostraGrowthSummary'
import {
  DIMENSIONS,
  STATEMENT_TYPES,
  statementDrill,
  statementDrillScope,
  statementRowInteraction,
  statementView,
} from './statements'

const PRESETS = {
  line: { label: 'Regnskapslinjer først', statements: ['result', 'balance', 'cashflow'], requires: 'line', dimensions: ['line', 'service', 'function', 'art', 'tax', 'balance_chapter'] },
  service: { label: 'Tjeneste først', statements: ['result', 'cashflow'], requires: 'service', dimensions: ['service', 'line', 'function', 'art'] },
  cost: { label: 'Regnskapsart først', statements: ['result', 'cashflow'], requires: 'art', dimensions: ['art', 'line', 'service', 'function'] },
  function: { label: 'Funksjon først', statements: ['result', 'cashflow'], requires: 'function', dimensions: ['function', 'line', 'art', 'service'] },
  balance: { label: 'Balansekapittel først', statements: ['balance'], requires: 'balance_chapter', dimensions: ['balance_chapter', 'line'] },
  tax: { label: 'Skattetype', statements: ['result'], requires: 'tax', dimensions: ['tax'] },
}

function viewRows(view) {
  return [...(view.overviewRows ?? []), ...view.sections.flatMap((section) => section.rows)]
}

function dimensionNames(dimensions, lowerCase = false) {
  const labels = dimensions.map((dimension) => DIMENSIONS[dimension]?.label ?? dimension)
    .map((label) => lowerCase ? label.toLocaleLowerCase('nb-NO') : label)
  return new Intl.ListFormat('nb-NO', { style: 'long', type: 'conjunction' }).format(labels)
}

function availableYears(detail, statementId, fallback) {
  const dataset = statementId === 'cashflow' ? ['result', 'investment', 'balance'] : [statementId]
  const years = new Set(dataset.flatMap((id) => Object.values(detail?.statementData?.[id] ?? {})
    .flatMap((item) => Object.keys(item.values ?? {}).map(Number))))
  return [...years].filter(Number.isFinite).sort((a, b) => a - b).length
    ? [...years].filter(Number.isFinite).sort((a, b) => a - b)
    : fallback
}

function readUrlState() {
  if (typeof window === 'undefined') return {}
  const query = window.location.hash.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const statementId = params.get('oppstilling')
  const dimensions = params.get('dimensjoner')?.split(',').filter((id) => DIMENSIONS[id])
  const selections = Object.fromEntries([...params.entries()]
    .filter(([key]) => key.startsWith('valg_'))
    .map(([key, value]) => [key.slice(5), value]))
  return {
    statementId: STATEMENT_TYPES.some((item) => item.id === statementId) ? statementId : undefined,
    lineId: params.get('linje') || undefined,
    year: Number(params.get('aar')) || undefined,
    mode: ['amount', 'perCapita'].includes(params.get('enhet')) ? params.get('enhet') : undefined,
    dimensions,
    selections,
  }
}

function statementUrl(state) {
  if (typeof window === 'undefined') return ''
  const base = window.location.hash.split('?')[0]
  const params = new URLSearchParams()
  params.set('oppstilling', state.statementId)
  params.set('aar', String(state.year))
  params.set('enhet', state.mode)
  if (state.lineId) params.set('linje', state.lineId)
  if (state.dimensions.length) params.set('dimensjoner', state.dimensions.join(','))
  Object.entries(state.selections).forEach(([dimension, value]) => params.set(`valg_${dimension}`, value))
  return `${base}?${params}`
}

function lineSeries(detail, statementId, lineId, years, mode) {
  return years.map((year) => {
    const row = viewRows(statementView(detail, statementId, year, mode))
      .find((item) => item.id === lineId)
    return { v: row?.value ?? null }
  })
}

function selectionName(detail, view, dimension, code) {
  if (dimension === 'line') return viewRows(view).find((item) => item.id === code)?.label ?? code
  if (dimension === 'service') return detail.services?.find((item) => item.code === code)?.name ?? code
  if (dimension === 'function') return detail.functions?.find((item) => item.code === code)?.name ?? code
  if (dimension === 'art') return Object.values(detail.accountingArts ?? {}).flat().find((item) => item.code === code)?.name ?? code
  if (dimension === 'tax') return viewRows(view).flatMap((item) => item.drillTaxComponents ?? []).find((item) => item.code === code)?.name ?? code
  if (dimension === 'balance_chapter') return detail.statementData?.balance?.[code]?.name ?? code
  return code
}

function DimensionOrder({ dimensions, setDimensions, allowed }) {
  const remaining = allowed.filter((id) => !dimensions.includes(id))
  const move = (index, offset) => {
    const target = index + offset
    if (target < 0 || target >= dimensions.length) return
    const next = [...dimensions]
    ;[next[index], next[target]] = [next[target], next[index]]
    setDimensions(next)
  }
  return (
    <div className="ko-dimensjoner">
      <span className="ft-stikkord">Rekkefølge på drill</span>
      <ol>
        {dimensions.map((id, index) => <li key={id}>
          <span>{index + 1}. {DIMENSIONS[id]?.label}</span>
          <span>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Flytt ${DIMENSIONS[id]?.label} til venstre`}>←</button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === dimensions.length - 1} aria-label={`Flytt ${DIMENSIONS[id]?.label} til høyre`}>→</button>
            <button type="button" onClick={() => setDimensions(dimensions.filter((item) => item !== id))} aria-label={`Fjern ${DIMENSIONS[id]?.label}`}>×</button>
          </span>
        </li>)}
      </ol>
      {remaining.length > 0 && <label>
        <span>Bryt videre ned etter</span>
        <select value="" onChange={(event) => event.target.value && setDimensions([...dimensions, event.target.value])}>
          <option value="">Velg dimensjon</option>
          {remaining.map((id) => <option key={id} value={id}>{DIMENSIONS[id].label}</option>)}
        </select>
      </label>}
    </div>
  )
}

export default function KostraStatements({ detail, index, onYearChange }) {
  const url = useMemo(readUrlState, [])
  const [statementId, setStatementId] = useState(url.statementId ?? 'result')
  const [lineId, setLineId] = useState(url.lineId ?? null)
  const [year, setYear] = useState(url.year ?? detail.latestYear)
  const [mode, setMode] = useState(url.mode ?? 'amount')
  const [dimensions, setDimensions] = useState(url.dimensions ?? [])
  const [selections, setSelections] = useState(url.selections ?? {})
  const [graphFocusId, setGraphFocusId] = useState(null)
  const [graphSelection, setGraphSelection] = useState(null)
  const tabsRef = useRef([])
  const urlReadyRef = useRef(false)
  const years = availableYears(detail, statementId, index.years)
  const view = statementView(detail, statementId, year, mode)
  const selectedLine = viewRows(view).find((row) => row.id === lineId)
  const selectedChildLine = selections.line
    ? viewRows(view).find((row) => row.id === selections.line)
    : null
  // Kontrollene beskriver alle gyldige veier fra den valgte hovedlinjen.
  // En valgt underlinje kan ha færre dimensjoner, men skal ikke skjule andre
  // rekkefølger brukeren kan bytte til for hele oppstillingen.
  const allowedDimensions = selectedLine?.availableDimensions ?? []
  const effectiveDimensions = dimensions.filter((id) => allowedDimensions.includes(id))
  const drillScope = statementDrillScope(selectedLine, selectedChildLine, effectiveDimensions)
  const dimensionOrderAllowed = selectedChildLine
    ? ['line', ...selectedChildLine.availableDimensions]
    : allowedDimensions
  const drill = selectedLine ? statementDrill(detail, {
    statementId, lineId, dimensions: effectiveDimensions, selections, year, mode, years,
  }) : null

  useEffect(() => {
    onYearChange?.(year)
  }, [onYearChange, year])

  useEffect(() => {
    const target = statementUrl({ statementId, lineId, year, mode, dimensions: effectiveDimensions, selections })
    if (target && window.location.hash !== target) {
      window.history[urlReadyRef.current ? 'pushState' : 'replaceState'](null, '', target)
    }
    urlReadyRef.current = true
  }, [statementId, lineId, year, mode, effectiveDimensions.join(','), JSON.stringify(selections)])

  useEffect(() => {
    const restore = () => {
      const state = readUrlState()
      setStatementId(state.statementId ?? 'result')
      setLineId(state.lineId ?? null)
      setYear(state.year ?? detail.latestYear)
      setMode(state.mode ?? 'amount')
      setDimensions(state.dimensions ?? [])
      setSelections(state.selections ?? {})
      setGraphFocusId(null)
      setGraphSelection(null)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [detail.latestYear])

  function chooseStatement(id) {
    setStatementId(id); setLineId(null); setSelections({}); setDimensions([]); setGraphFocusId(null); setGraphSelection(null)
    const nextYears = availableYears(detail, id, index.years)
    if (!nextYears.includes(year)) setYear(nextYears.at(-1) ?? detail.latestYear)
  }

  function chooseLine(row) {
    if (!row.clickable && !Number.isFinite(row.value)) return
    const interaction = statementRowInteraction(row)
    setGraphFocusId(row.id)
    setGraphSelection(null)
    if (interaction.action === 'graph') return
    setLineId(row.id); setSelections({})
    const initial = row.availableDimensions.length === 1
      ? row.availableDimensions
      : row.availableDimensions.includes('line')
      ? PRESETS.line.dimensions
      : row.availableDimensions.includes('balance_chapter')
        ? PRESETS.balance.dimensions
        : PRESETS.service.dimensions
    const validInitial = initial.filter((id) => row.availableDimensions.includes(id))
    setDimensions(validInitial)
  }

  function chooseDrillRow(row) {
    const rowDimension = row.dimension ?? drill.nextDimension
    const nextSelections = { ...selections, [rowDimension]: row.code }
    if (statementRowInteraction(row).action === 'graph') {
      setGraphSelection({
        lineId,
        dimensions: effectiveDimensions,
        selections: nextSelections,
        dimension: rowDimension,
        code: row.code,
        name: row.name,
      })
      return
    }
    setGraphSelection(null)
    if (rowDimension === 'line') {
      const child = viewRows(view).find((item) => item.id === row.code)
      if (child) {
        setDimensions([
          ...effectiveDimensions,
          ...child.availableDimensions.filter((dimension) => !effectiveDimensions.includes(dimension)),
        ])
      }
    }
    setSelections(nextSelections)
  }

  function tabKeyDown(event, index) {
    const keys = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: STATEMENT_TYPES.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    const target = (keys[event.key] + STATEMENT_TYPES.length) % STATEMENT_TYPES.length
    tabsRef.current[target]?.focus(); chooseStatement(STATEMENT_TYPES[target].id)
  }

  const graphLineId = lineId ?? graphFocusId ?? (statementId === 'result' ? 'net_operating_result' : statementId === 'balance' ? 'total_assets' : 'net_cashflow')
  const graphLine = viewRows(view).find((row) => row.id === graphLineId)
  const graphSelectionDrill = graphSelection ? statementDrill(detail, {
    statementId,
    lineId: graphSelection.lineId,
    dimensions: graphSelection.dimensions,
    selections: graphSelection.selections,
    year,
    mode,
    years,
  }) : null
  const graphPoints = graphSelectionDrill?.history
    ?? (drill && Object.keys(selections).length ? drill.history : lineSeries(detail, statementId, graphLineId, years, mode))
  const graphGrowth = yearlyGrowth(graphPoints, years, year)
  const graphValue = graphPoints[years.indexOf(year)]?.v ?? graphSelectionDrill?.activeTotal ?? graphLine?.value ?? null
  const graphName = graphSelection?.name ?? (Object.keys(selections).length
    ? Object.entries(selections).map(([dimension, code]) => selectionName(detail, view, dimension, code)).at(-1) ?? selectedLine?.label
    : graphLine?.label ?? view.label)
  const maxRow = Math.max(1, ...(drill?.rows ?? []).map((row) => Math.abs(row.value ?? 0)))

  return (
    <section className="ko-drill" aria-labelledby="ko-oppstilling-tittel">
      <div className="ko-paneltopp ko-oppstillingstopp">
        <div><span className="ft-stikkord">Økonomisk drill-down</span><h2 id="ko-oppstilling-tittel">Regnskapsoppstillinger</h2></div>
        <div className="ko-drillverktoy">
          <div className="ft-bytter" aria-label="Vis beløp i økonomisk drill-down">
            <button type="button" className={`ft-bytte ${mode === 'amount' ? 'aktiv' : ''}`} aria-pressed={mode === 'amount'} onClick={() => setMode('amount')}>Nominelt beløp</button>
            <button type="button" className={`ft-bytte ${mode === 'perCapita' ? 'aktiv' : ''}`} aria-pressed={mode === 'perCapita'} onClick={() => setMode('perCapita')}>Per innbygger</button>
          </div>
          <label className="ko-aarvalg"><span className="sr-only">År</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </div>
      <div className="ko-oppstillingfaner" role="tablist" aria-label="Velg regnskapsoppstilling">
        {STATEMENT_TYPES.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={statementId === item.id} tabIndex={statementId === item.id ? 0 : -1} ref={(node) => { tabsRef.current[index] = node }} onKeyDown={(event) => tabKeyDown(event, index)} onClick={() => chooseStatement(item.id)}>{item.label}</button>)}
      </div>
      <div className="ko-drillgrid" role="tabpanel">
        <div>
          {selectedLine ? <>
            <nav className="ko-drillsmuler" aria-label="Valgt regnskapsnivå">
              <button type="button" onClick={() => { setLineId(null); setSelections({}); setGraphSelection(null) }}>{view.label}</button><span>›</span>
              <button type="button" onClick={() => { setSelections({}); setGraphSelection(null) }}>{selectedLine.label}</button>
              {effectiveDimensions.filter((id) => selections[id]).map((id, index, chosen) => <React.Fragment key={id}><span>›</span><button type="button" onClick={() => { setSelections(Object.fromEntries(Object.entries(selections).filter(([key]) => chosen.indexOf(key) < index))); setGraphSelection(null) }}>{selectionName(detail, view, id, selections[id])}</button></React.Fragment>)}
            </nav>
            {selectedChildLine && drillScope.alternativeDimensions.length > 0 && <p className="ko-drillkontekst">
              {selectedChildLine.availableDimensions.length > 0
                ? <><strong>{selectedChildLine.label}</strong> kan bare fordeles på {dimensionNames(selectedChildLine.availableDimensions, true)}. </>
                : <><strong>{selectedChildLine.label}</strong> har ikke en egen fordeling på lavere KOSTRA-nivå. </>}
              {dimensionNames(drillScope.alternativeDimensions)} er alternative innganger til hele «{selectedLine.label}», ikke nivåer under {selectedChildLine.label}.
            </p>}
            <div className="ko-presetgruppe">
              <span className="ft-stikkord">{selectedChildLine ? `Start en ny fordeling av hele ${selectedLine.label}` : 'Velg første nivå'}</span>
              <div className="ko-presetter" aria-label="Ferdige drillrekkefølger">
                {Object.entries(PRESETS).filter(([, preset]) => preset.statements.includes(statementId) && (!preset.requires || allowedDimensions.includes(preset.requires))).map(([id, preset]) => {
                  const presetDimensions = preset.dimensions.filter((dimension) => allowedDimensions.includes(dimension))
                  const isActive = presetDimensions.length === effectiveDimensions.length
                    && presetDimensions.every((dimension, index) => effectiveDimensions[index] === dimension)
                  return <button key={id} type="button" aria-pressed={isActive} onClick={() => { setDimensions(presetDimensions); setSelections({}); setGraphSelection(null) }}>{preset.label}{selectedLine.partialDimensions?.includes(preset.requires) ? ' (delvis)' : ''}</button>
                })}
              </div>
            </div>
            <DimensionOrder dimensions={drillScope.visibleDimensions} setDimensions={(next) => { setDimensions(next); setSelections({}); setGraphSelection(null) }} allowed={dimensionOrderAllowed} />
            {drill?.nextDimension && <><div className="ko-drillhode ko-drillhode--arts"><span>{DIMENSIONS[drill.nextDimension]?.label}{drill.rows.some((row) => row.fallback) ? ' / regnskapslinje' : ''}</span><span>{mode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span>Andel</span></div>
            <div className="ko-drillrader">
              {(drill?.rows ?? []).map((row) => {
                const interaction = statementRowInteraction(row)
                const rowDimension = row.dimension ?? drill.nextDimension
                return <button key={`${rowDimension}:${row.code}`} type="button" className="ko-drillart" aria-label={interaction.action === 'graph' ? `Vis ${row.name} i grafen` : undefined} aria-pressed={interaction.action === 'graph' ? graphSelection?.dimension === rowDimension && graphSelection?.code === row.code : undefined} onClick={() => chooseDrillRow(row)}>
                <span><span>{row.fallback ? <small>Linje</small> : rowDimension !== 'line' && <small>{row.code}</small>}{row.name}</span><i style={{ width: `${Math.abs(row.value ?? 0) / maxRow * 100}%` }} /></span>
                <strong className="num">{formatKostraValue(row.value, mode)}</strong><em className="num">{formatKostraShare(row.share)}</em>{interaction.action === 'drill' && <b>›</b>}
              </button>})}
            </div></>}
            {!drill?.nextDimension && effectiveDimensions.length > 0 && <p className="ko-artavstemming">Dette er laveste tilgjengelige KOSTRA-nivå for valget.</p>}
            {drill?.nextDimension && (drill?.rows.length ?? 0) === 0 && <p className="ko-artavstemming">Det finnes ikke rapporterte observasjoner på neste nivå for dette valget og året.</p>}
            {effectiveDimensions.length === 0 && <p className="ko-artavstemming">SSBs oppstilling har ikke en videre funksjons-, arts- eller balansedimensjon for denne linjen. Historikken vises til høyre.</p>}
            {selectedLine.drillNote && <p className="ko-artavstemming">{selectedLine.drillNote}</p>}
            {drill?.coverageNote && <p className="ko-artavstemming">{drill.coverageNote}</p>}
            {drill?.reconciliation.status === 'difference' && <p className="ko-artavstemming">Underpostene summerer til {formatKostraValue(drill.reconciliation.componentTotal, mode)}, mens oppstillingen viser {formatKostraValue(drill.reconciliation.reportedTotal, mode)}. Avviket på {formatKostraValue(drill.reconciliation.difference, mode)} er beholdt og ikke justert.</p>}
            {drill?.note && <p className="ko-artavstemming">{drill.note}</p>}
          </> : <div className="ko-oppstilling">
            <section aria-labelledby={`ko-${statementId}-oversikt`}>
              <h3 id={`ko-${statementId}-oversikt`} className="sr-only">{view.label} – hovedlinjer</h3>
              {(view.defaultRows ?? view.overviewRows ?? []).map((row) => {
                const interaction = statementRowInteraction(row)
                const graphSelected = interaction.action === 'graph' && graphLineId === row.id
                return <button
                  key={row.id}
                  type="button"
                  className={`ko-oppstillingrad ko-oppstillingrad--${row.kind ?? 'line'}${row.overviewLevel === 0 ? ' ko-oppstillingrad--overview-subtotal' : ''}${row.overviewLevel === 1 ? ' ko-oppstillingrad--nested' : ''}${interaction.tone ? ` ko-oppstillingrad--${interaction.tone}` : ''}`}
                  disabled={!row.clickable}
                  aria-label={row.overviewParentLabel ? `${row.label}, under ${row.overviewParentLabel}, ${formatKostraValue(row.value, mode)}. ${row.clickable ? interaction.hint : 'Ingen data for valgt år'}` : undefined}
                  aria-pressed={interaction.action === 'graph' ? graphSelected : undefined}
                  onClick={() => chooseLine(row)}
                >
                  <span>{row.label}{row.clickable && row.overviewLevel !== 1 && <small>{interaction.hint}</small>}</span>
                  <strong className="num">{formatKostraValue(row.value, mode)}</strong>
                  {interaction.action === 'drill' && <b aria-hidden="true">›</b>}
                </button>
              })}
            </section>
            {view.note && <p className="ko-artavstemming">{view.note}</p>}
            {view.limitations?.map((note) => <p className="ko-artavstemming" key={note}>{note}</p>)}
            {Object.entries(view.reconciliations ?? {}).map(([id, check]) => check.status === 'difference' && <p className="ko-artavstemming" key={id}>
              {id === 'balance'
                ? check.cause === 'unmatched-intercompany-balances'
                  ? `Balansen går ikke opp i SSBs kommunekonserntall fordi interne fordringer og intern gjeld mellom kommunen og foretak/selskaper ikke er rapportert med samme beløp. SSBs kontrollposter forklarer avviket på ${formatKostraValue(Math.abs(check.difference), mode)}${Math.abs(check.unexplainedDifference) > 0 ? `, med en avrundingsrest på ${formatKostraValue(Math.abs(check.unexplainedDifference), mode)}` : ''}. Kildetallene er vist uendret.`
                  : `Sum eiendeler avviker med ${formatKostraValue(check.difference, mode)} fra sum egenkapital og gjeld i den publiserte KOSTRA-tabellen. Kildetallene er vist uendret.`
                : id === 'cash'
                  ? `Beregnet netto kontantstrøm avviker med ${formatKostraValue(check.difference, mode)} fra rapportert endring i bankinnskudd og kontanter. Avviket er ikke justert.`
                  : `Underpostene avviker med ${formatKostraValue(check.difference, mode)} fra den publiserte totalen.`}
            </p>)}
          </div>}
        </div>
        <aside className="ko-drillgraf" aria-live="polite" aria-atomic="true">
          <span className="ft-stikkord">Utvikling over tid</span><h3>{graphName}</h3>
          <strong className="ko-drillgrafverdi num">{formatKostraValue(graphValue, mode)}</strong>
          <KostraGrowthSummary growth={graphGrowth} />
          <LinjeGraf serier={[{ navn: graphName, farge: RUST, bredde: 2.5, punkter: graphPoints }]} aar={years} W={390} H={230} fraNull={!graphPoints.some((point) => point.v < 0)} aksefmt={(value) => formatKostraValue(value, mode)} beskrivelse={`${graphName}, ${mode === 'perCapita' ? 'per innbygger' : 'nominelt'}, over tid`} />
          <small className="ko-drillgrafnote">Kilde: SSB Statbank KOSTRA. Kontantstrøm er beregnet fra resultat-, investerings- og balanseregnskapet.</small>
        </aside>
      </div>
    </section>
  )
}
