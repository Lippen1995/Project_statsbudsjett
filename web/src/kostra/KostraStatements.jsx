import React, { useEffect, useMemo, useRef, useState } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { formatKostraValue, yearlyGrowth } from './model'
import KostraGrowthSummary from './KostraGrowthSummary'
import { DIMENSIONS, STATEMENT_TYPES, statementDrill, statementView } from './statements'

const PRESETS = {
  service: { label: 'Etter tjeneste', dimensions: ['service', 'function', 'art'] },
  cost: { label: 'Etter kostnadstype', dimensions: ['art', 'service', 'function'] },
  function: { label: 'Etter funksjon', dimensions: ['function', 'art', 'service'] },
  balance: { label: 'Etter balansekapittel', dimensions: ['balance_chapter'] },
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
    const row = statementView(detail, statementId, year, mode).sections
      .flatMap((section) => section.rows).find((item) => item.id === lineId)
    return { v: row?.value ?? null }
  })
}

function selectionName(detail, dimension, code) {
  if (dimension === 'service') return detail.services?.find((item) => item.code === code)?.name ?? code
  if (dimension === 'function') return detail.functions?.find((item) => item.code === code)?.name ?? code
  if (dimension === 'art') return Object.values(detail.accountingArts ?? {}).flat().find((item) => item.code === code)?.name ?? code
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

export default function KostraStatements({ detail, index }) {
  const url = useMemo(readUrlState, [])
  const [statementId, setStatementId] = useState(url.statementId ?? 'result')
  const [lineId, setLineId] = useState(url.lineId ?? null)
  const [year, setYear] = useState(url.year ?? detail.latestYear)
  const [mode, setMode] = useState(url.mode ?? 'amount')
  const [dimensions, setDimensions] = useState(url.dimensions ?? [])
  const [selections, setSelections] = useState(url.selections ?? {})
  const tabsRef = useRef([])
  const urlReadyRef = useRef(false)
  const years = availableYears(detail, statementId, index.years)
  const view = statementView(detail, statementId, year, mode)
  const selectedLine = view.sections.flatMap((section) => section.rows).find((row) => row.id === lineId)
  const allowedDimensions = selectedLine?.availableDimensions ?? []
  const effectiveDimensions = dimensions.filter((id) => allowedDimensions.includes(id))
  const drill = selectedLine ? statementDrill(detail, {
    statementId, lineId, dimensions: effectiveDimensions, selections, year, mode, years,
  }) : null

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
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [detail.latestYear])

  function chooseStatement(id) {
    setStatementId(id); setLineId(null); setSelections({}); setDimensions([])
    const nextYears = availableYears(detail, id, index.years)
    if (!nextYears.includes(year)) setYear(nextYears.at(-1) ?? detail.latestYear)
  }

  function chooseLine(row) {
    if (!row.clickable && !Number.isFinite(row.value)) return
    setLineId(row.id); setSelections({})
    const initial = row.availableDimensions.includes('balance_chapter')
      ? PRESETS.balance.dimensions
      : PRESETS.service.dimensions.filter((id) => row.availableDimensions.includes(id))
    setDimensions(initial)
  }

  function tabKeyDown(event, index) {
    const keys = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: STATEMENT_TYPES.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    const target = (keys[event.key] + STATEMENT_TYPES.length) % STATEMENT_TYPES.length
    tabsRef.current[target]?.focus(); chooseStatement(STATEMENT_TYPES[target].id)
  }

  const graphLineId = lineId ?? (statementId === 'result' ? 'net_operating_result' : statementId === 'balance' ? 'total_assets' : 'net_cashflow')
  const graphLine = view.sections.flatMap((section) => section.rows).find((row) => row.id === graphLineId)
  const graphPoints = drill && Object.keys(selections).length ? drill.history : lineSeries(detail, statementId, graphLineId, years, mode)
  const graphGrowth = yearlyGrowth(graphPoints, years, year)
  const graphValue = graphPoints[years.indexOf(year)]?.v ?? graphLine?.value ?? null
  const graphName = Object.keys(selections).length
    ? Object.entries(selections).map(([dimension, code]) => selectionName(detail, dimension, code)).at(-1) ?? selectedLine?.label
    : graphLine?.label ?? view.label
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
              <button type="button" onClick={() => { setLineId(null); setSelections({}) }}>{view.label}</button><span>›</span>
              <button type="button" onClick={() => setSelections({})}>{selectedLine.label}</button>
              {effectiveDimensions.filter((id) => selections[id]).map((id, index, chosen) => <React.Fragment key={id}><span>›</span><button type="button" onClick={() => setSelections(Object.fromEntries(Object.entries(selections).filter(([key]) => chosen.indexOf(key) < index)))}>{selectionName(detail, id, selections[id])}</button></React.Fragment>)}
            </nav>
            <div className="ko-presetter" aria-label="Ferdige drillrekkefølger">
              {Object.entries(PRESETS).filter(([, preset]) => preset.dimensions.some((id) => allowedDimensions.includes(id))).map(([id, preset]) => <button key={id} type="button" onClick={() => { setDimensions(preset.dimensions.filter((dimension) => allowedDimensions.includes(dimension))); setSelections({}) }}>{preset.label}</button>)}
            </div>
            <DimensionOrder dimensions={effectiveDimensions} setDimensions={(next) => { setDimensions(next); setSelections({}) }} allowed={allowedDimensions} />
            {drill?.nextDimension && <><div className="ko-drillhode ko-drillhode--arts"><span>{DIMENSIONS[drill.nextDimension]?.label}</span><span>{mode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span>Andel</span></div>
            <div className="ko-drillrader">
              {(drill?.rows ?? []).map((row) => <button key={row.code} type="button" className="ko-drillart" onClick={() => setSelections({ ...selections, [drill.nextDimension]: row.code })}>
                <span><span><small>{row.code}</small>{row.name}</span><i style={{ width: `${Math.abs(row.value ?? 0) / maxRow * 100}%` }} /></span>
                <strong className="num">{formatKostraValue(row.value, mode)}</strong><em className="num">{Number.isFinite(row.share) ? `${row.share.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %` : '–'}</em>{drill.remainingDimensions.length > 1 && <b>›</b>}
              </button>)}
            </div></>}
            {!drill?.nextDimension && effectiveDimensions.length > 0 && <p className="ko-artavstemming">Dette er laveste tilgjengelige KOSTRA-nivå for valget.</p>}
            {drill?.nextDimension && (drill?.rows.length ?? 0) === 0 && <p className="ko-artavstemming">Det finnes ikke rapporterte observasjoner på neste nivå for dette valget og året.</p>}
            {effectiveDimensions.length === 0 && <p className="ko-artavstemming">SSBs oppstilling har ikke en videre funksjons-, arts- eller balansedimensjon for denne linjen. Historikken vises til høyre.</p>}
            {selectedLine.drillNote && <p className="ko-artavstemming">{selectedLine.drillNote}</p>}
            {drill?.reconciliation.status === 'difference' && <p className="ko-artavstemming">Underpostene summerer til {formatKostraValue(drill.reconciliation.componentTotal, mode)}, mens oppstillingen viser {formatKostraValue(drill.reconciliation.reportedTotal, mode)}. Avviket på {formatKostraValue(drill.reconciliation.difference, mode)} er beholdt og ikke justert.</p>}
            {drill?.note && <p className="ko-artavstemming">{drill.note}</p>}
          </> : <div className="ko-oppstilling">
            {view.sections.map((section) => <section key={section.id} aria-labelledby={`ko-${statementId}-${section.id}`}>
              <h3 id={`ko-${statementId}-${section.id}`}>{section.label}</h3>
              {section.rows.map((row) => <button key={row.id} type="button" className={`ko-oppstillingrad ko-oppstillingrad--${row.kind ?? 'line'}`} disabled={!row.clickable} onClick={() => chooseLine(row)}>
                <span>{row.label}{row.clickable && <small>{row.availableDimensions.length ? 'Se detaljer' : 'Vis historikk'}</small>}</span><strong className="num">{formatKostraValue(row.value, mode)}</strong>{row.clickable && <b aria-hidden="true">›</b>}
              </button>)}
            </section>)}
            {view.note && <p className="ko-artavstemming">{view.note}</p>}
            {view.limitations?.map((note) => <p className="ko-artavstemming" key={note}>{note}</p>)}
            {Object.entries(view.reconciliations ?? {}).map(([id, check]) => check.status === 'difference' && <p className="ko-artavstemming" key={id}>
              {id === 'balance'
                ? `Sum eiendeler avviker med ${formatKostraValue(check.difference, mode)} fra sum egenkapital og gjeld i den publiserte KOSTRA-tabellen.`
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
