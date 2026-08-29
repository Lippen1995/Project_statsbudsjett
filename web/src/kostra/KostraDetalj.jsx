import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadKostraDetail } from '../lib/kostra'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { INK, RUST } from '../fellestall/design'
import {
  comparisonEntityIds,
  drillHistory,
  formatKostraValue,
  mapValue,
  materialBoundaryHistory,
  metricSeries,
  populationForEntity,
  stateFlowSummary,
  yearlyGrowth,
} from './model'
import { accountingArtBreakdown, accountingArtFunctionBreakdown } from './explorer'
import KostraGrowthSummary from './KostraGrowthSummary'

const GREEN = '#47735D'
const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

function point(item, metric, year) {
  return item?.metrics?.[metric]?.[year] ?? null
}

function Breakdown({ title, rows, detail, year }) {
  const [selectedCode, setSelectedCode] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const backButtonRef = useRef(null)
  const rowButtonsRef = useRef(new Map())
  const selected = rows.find((row) => row.code === selectedCode)
  const breakdown = selected
    ? accountingArtFunctionBreakdown(detail, year, selected.code)
    : null
  const functionRows = breakdown?.rows ?? []
  const visibleRows = showAll ? functionRows : functionRows.slice(0, 10)
  const max = Math.max(1, ...(selected ? functionRows : rows).map((row) => Math.abs(row.amount)))

  useEffect(() => {
    setSelectedCode(null)
    setShowAll(false)
  }, [detail, year])

  useEffect(() => {
    if (selectedCode) backButtonRef.current?.focus()
  }, [selectedCode])

  function closeDrill() {
    const previousCode = selectedCode
    setSelectedCode(null)
    setShowAll(false)
    requestAnimationFrame(() => rowButtonsRef.current.get(previousCode)?.focus())
  }

  return (
    <div className="ko-breakdown">
      <h3>{title}</h3>
      {!selected && rows.map((row) => (
        <button
          type="button"
          className="ko-breakdownrad ko-breakdownvalg"
          key={row.code}
          onClick={() => setSelectedCode(row.code)}
          ref={(node) => {
            if (node) rowButtonsRef.current.set(row.code, node)
            else rowButtonsRef.current.delete(row.code)
          }}
          aria-label={`Vis hvilke KOSTRA-funksjoner som forklarer ${row.name.toLowerCase()}`}
        >
          <div>
            <span>{row.name}</span>
            <strong>{formatKostraValue(row.amount, 'amount')}<b aria-hidden="true">›</b></strong>
          </div>
          <i style={{ width: `${Math.abs(row.amount) / max * 100}%` }} />
        </button>
      ))}
      {selected && <>
        <div className="ko-breakdownsmuler">
          <button type="button" ref={backButtonRef} onClick={closeDrill}>← Tilbake</button>
          <span>{selected.code}</span>
        </div>
        <div className="ko-breakdownvalgt">
          <strong>{selected.name}</strong>
          <span>{formatKostraValue(selected.amount, 'amount')} · fordelt på {functionRows.length} KOSTRA-funksjoner</span>
        </div>
        {functionRows.length > 0 && (
          <table className="ko-breakdowntabell">
            <caption className="sr-only">{selected.name} fordelt på KOSTRA-funksjon</caption>
            <thead><tr>
              <th scope="col">KOSTRA-funksjon</th>
              <th scope="col">Beløp</th>
              <th scope="col">Per innb.</th>
              <th scope="col">Andel</th>
            </tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">
                    <span><small>{row.code}</small>{row.name}</span>
                    <i style={{ width: `${Math.abs(row.amount) / max * 100}%` }} />
                  </th>
                  <td>{formatKostraValue(row.amount, 'amount')}</td>
                  <td>{formatKostraValue(row.perCapita, 'perCapita')}</td>
                  <td>{Number.isFinite(row.share) ? `${populationFormat.format(row.share)} %` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {functionRows.length > 10 && (
          <button type="button" className="ko-breakdownvisalle" onClick={() => setShowAll((current) => !current)}>
            {showAll ? 'Vis de første 10 funksjonene' : `Vis alle ${functionRows.length} funksjoner`}
          </button>
        )}
        {functionRows.length === 0 && <p className="ko-artavstemming">SSB har ikke publisert funksjonsfordeling for denne regnskapsarten.</p>}
        {breakdown?.summation.status === 'matches' && (
          <p className="ko-artavstemming">Totalen over er summen av de viste KOSTRA-funksjonene.</p>
        )}
        {breakdown?.summation.status === 'difference' && (
          <p className="ko-artavstemming">Funksjonene summerer til {formatKostraValue(breakdown.summation.functionTotal, 'amount')}, mens sammendraget over viser {formatKostraValue(breakdown.summation.breakdownTotal, 'amount')}. Avviket er ikke justert.</p>
        )}
        {functionRows.some((row) => row.amount < 0) && (
          <p className="ko-artavstemming">Negative beløp er motposter og beholdes med fortegn.</p>
        )}
      </>}
    </div>
  )
}

function StateFlowColumn({ title, kicker, description, stateFlows, direction, year, mode }) {
  const summary = stateFlowSummary(stateFlows, direction, year, mode)
  const items = stateFlows?.[direction] ?? []
  const valuesByCode = new Map(items.map((item) => [item.code, item]))
  const sourcePeriods = [...new Set(items
    .map((item) => item.values?.[year]?.sourcePeriod)
    .filter(Boolean))]
  return (
    <article className={`ko-stromkolonne ko-stromkolonne--${direction}`}>
      <span className="ft-stikkord">{kicker}</span>
      <h3>{title}</h3>
      <strong className="ko-stromtotal num">{formatKostraValue(summary.total, mode)}</strong>
      <p className="ko-stromforklaring">{description}</p>
      <table className="ko-stromtabell">
        <caption className="sr-only">{title} i {year}</caption>
        <thead><tr><th scope="col">Post</th><th scope="col">Beløp</th></tr></thead>
        <tbody>
          {summary.rows.map((row) => {
            const definition = valuesByCode.get(row.code)
            return (
              <tr key={row.code}>
                <th scope="row"><span>{row.label}</span><small>{definition?.description}</small></th>
                <td className="num">{formatKostraValue(row.value, mode)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!summary.complete && <p className="ko-stromdekning">Totalsummen skjules fordi én eller flere poster mangler.</p>}
      <small className="ko-stromkilde">
        Faktiske tall · {direction === 'incoming' ? 'SSB KOSTRA 12137' : 'SSB 07022, akkumulert desember'}
        {sourcePeriods.length > 0 && ` · ${sourcePeriods.join(', ')}`}
      </small>
    </article>
  )
}

function StateFlows({ entityName, stateFlows, year, mode }) {
  return (
    <section className="ko-strommer" aria-labelledby="ko-strommer-tittel">
      <div className="ko-stromhode">
        <span className="ft-stikkord">Staten og kommunen</span>
        <h2 id="ko-strommer-tittel">Pengestrømmer mellom staten og {entityName}</h2>
        <p>Vi skiller kommuneorganisasjonens inntekt fra skatter og avgifter registrert i kommunen som geografisk område.</p>
      </div>
      <div className="ko-stromgrid">
        <StateFlowColumn
          kicker="Til kommuneorganisasjonen"
          title="Fra staten"
          description="Rammetilskuddet er frie midler kommunen mottar fra staten. Andre statlige tilskudd og ytelser er ikke med i denne summen."
          stateFlows={stateFlows}
          direction="incoming"
          year={year}
          mode={mode}
        />
        <StateFlowColumn
          kicker="Fra kommunen som geografisk område"
          title="Til staten og folketrygden"
          description="Dette er innbetalte og fordelte skatter og avgifter i kommunens skatteregnskap, fordelt på personer, arbeidsgivere og fellesskatt."
          stateFlows={stateFlows}
          direction="outgoing"
          year={year}
          mode={mode}
        />
      </div>
      <p className="ko-stromforbehold"><strong>Ikke et nettoregnskap:</strong> Beløpene gjelder ulike aktører og dekker ikke alle statlige inntekter eller utgifter i området. De skal derfor ikke trekkes fra hverandre som kommunens gevinst eller tap mot staten.</p>
    </section>
  )
}

export default function KostraDetalj({ index, kind, code, embedded = false }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('perCapita')
  const [historyMetric, setHistoryMetric] = useState('expenses')
  const [serviceCode, setServiceCode] = useState(null)
  const [functionCode, setFunctionCode] = useState(null)

  useEffect(() => {
    let active = true
    setDetail(null); setError(null); setServiceCode(null); setFunctionCode(null)
    loadKostraDetail(kind, code)
      .then((data) => {
        if (!active) return
        if (data) setDetail(data)
        else setError('Detaljdata er ikke tilgjengelig ennå.')
      })
      .catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [kind, code])

  const entityId = kind === 'county' ? `county:${code.slice(0, 2)}` : `municipality:${code}`
  const allEntities = [...index.entities, ...(index.historicalEntities ?? [])]
  const entity = allEntities.find((item) => item.id === entityId)
  const parentCountyCode = kind === 'municipality' ? code.slice(0, 2) : null
  const parentCounty = parentCountyCode
    ? allEntities.find((item) => item.id === `county:${parentCountyCode}`)
    : null
  const historicalEntity = entity?.active === 0 || entity?.active === false
  const metricDefs = index.metrics.filter((item) => item.category === 'finance')
  const selectedService = detail?.services.find((item) => item.code === serviceCode)
  const functions = detail?.functions.filter((item) => !serviceCode || item.serviceCodes?.includes(serviceCode)) ?? []
  const selectedFunction = functions.find((item) => item.code === functionCode)
  const artBreakdown = functionCode
    ? accountingArtBreakdown(detail, detail?.latestYear, functionCode)
    : null
  const arts = artBreakdown?.rows ?? []
  const Heading = embedded ? 'h2' : 'h1'
  const comparisons = useMemo(() => {
    if (!detail) return []
    return comparisonEntityIds(entityId, detail.comparisons, mode).map((id) => ({
      id,
      name: id === entityId
        ? entity?.name ?? detail.entity.name
        : id === detail.comparisons.norwayEntityId
          ? 'Norge'
          : index.entities.find((item) => item.id === id)?.name ?? id,
      color: id === entityId ? RUST : id === detail.comparisons.norwayEntityId ? INK : GREEN,
    }))
  }, [detail, entityId, entity, index, mode])

  if (error) return <section className="ko-status"><Heading>{entity?.name ?? 'KOSTRA'}</Heading><p>{error}</p><a href="#kostra">Tilbake til kartet</a></section>
  if (!detail) return <section className="ko-status"><div className="spinner" /><p>Laster kommuneregnskap…</p></section>

  const year = detail.latestYear
  const summary = ['revenues', 'expenses', 'net_result', 'debt'].map((id) => {
    const definition = metricDefs.find((item) => item.id === id)
    const value = detail.overview[id]?.[year]?.[mode]
    return { id, name: definition?.label ?? id, value }
  })
  const historyDefinition = metricDefs.find((item) => item.id === historyMetric)
  const historySeries = comparisons.map((comparison) => ({
    navn: comparison.name,
    farge: comparison.color,
    bredde: comparison.id === entityId ? 2.5 : 1.5,
    stiplet: comparison.id !== entityId,
    punkter: metricSeries(index, historyMetric, comparison.id, mode),
  }))
  const historyTips = (i) => ({
    tittel: String(index.years[i]),
    linjer: historySeries.map((serie) => ({ farge: serie.farge, tekst: `${serie.navn}: ${formatKostraValue(serie.punkter[i]?.v, mode)}` })),
  })
  const boundaryWarnings = materialBoundaryHistory(detail.boundaryHistory)

  const drillRows = selectedFunction
    ? [...arts].sort((a, b) => (b[mode] ?? -Infinity) - (a[mode] ?? -Infinity))
    : selectedService
      ? [...functions].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.amount ?? 0) - Math.abs(point(a, 'net_expenses', year)?.amount ?? 0))
      : [...detail.services].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.amount ?? 0) - Math.abs(point(a, 'net_expenses', year)?.amount ?? 0))
  const maxArtValue = Math.max(1, ...arts.map((item) => Math.abs(item[mode] ?? 0)))
  const drillHistoryData = drillHistory(detail, index.years, serviceCode, functionCode)
  const drillSeries = [{ navn: drillHistoryData.name, farge: RUST, bredde: 2.5, punkter: drillHistoryData.points }]
  const drillGrowth = yearlyGrowth(drillHistoryData.points, index.years, year)
  const drillTips = (i) => ({
    tittel: String(index.years[i]),
    linjer: [{ farge: RUST, tekst: `${drillHistoryData.name}: ${formatKostraValue(drillHistoryData.points[i]?.v, 'amount')}` }],
  })

  return (
    <>
      <header className={`ko-hero ko-detailhero ${embedded ? 'ko-hero--integrert' : ''}`}>
        <div className="ft-kicker">{kind === 'county' ? 'Fylkeskommuneregnskap' : 'Kommuneregnskap'} · KOSTRA {year}</div>
        <Heading>{detail.entity.name}</Heading>
        <div className="ko-smuler">
          <a href="#kostra">Norge</a><span>›</span>
          {kind === 'municipality' && parentCounty && <>
            <a href={historicalEntity
              ? `#kostra/fylke/${parentCountyCode}/detaljer`
              : `#kostra/fylke/${parentCountyCode}`}
            >{parentCounty.name}</a><span>›</span>
          </>}
          <span aria-current="page">{detail.entity.name}</span>
        </div>
      </header>

      <section className="ft-seksjon ko-detaljseksjon">
        <div className="ko-moduslinje">
          <div className="ft-bytter">
            <button className={`ft-bytte ${mode === 'perCapita' ? 'aktiv' : ''}`} onClick={() => setMode('perCapita')}>Per innbygger</button>
            <button className={`ft-bytte ${mode === 'amount' ? 'aktiv' : ''}`} onClick={() => setMode('amount')}>Totalt</button>
          </div>
          {mode === 'perCapita' && detail.entity.peer_group_id && <span>Sammenlignes med {index.entities.find((item) => item.id === detail.entity.peer_group_id)?.name} og Norge</span>}
        </div>
        <div className="ko-nokkeltall">
          {summary.map((item) => (
            <div key={item.id}><span className="ft-stikkord">{item.name}</span><strong className="num">{formatKostraValue(item.value, mode)}</strong></div>
          ))}
        </div>

        {boundaryWarnings.length > 0 && (
          <div className="ko-panel ko-grensehistorikk">
            <span className="ft-stikkord">Historiske grenser</span>
            <h2>Brudd i tidsserien</h2>
            {boundaryWarnings.map((change) => {
              const previousHref = kind === 'county'
                ? `#kostra/fylke/${change.sourceCode.slice(0, 2)}/detaljer`
                : `#kostra/kommune/${change.sourceCode}/detaljer`
              return (
                <p key={`${change.sourceId}-${change.targetId}-${change.changeYear}`}>
                  <strong>{change.changeYear}:</strong>{' '}
                  <a href={previousHref}>{change.sourceName} ({change.sourceCode})</a>
                  {' → '}{change.targetName} ({change.targetCode}).{' '}
                  Geografien ble endret, så tallene før og etter endringen er ikke direkte sammenlignbare.
                </p>
              )
            })}
          </div>
        )}

        {kind === 'municipality' && detail.stateFlows?.years?.includes(year) && (
          <StateFlows entityName={detail.entity.name} stateFlows={detail.stateFlows} year={year} mode={mode} />
        )}

        <div className={`ko-detaljgrid ${mode === 'amount' ? 'ko-detaljgrid--uten-sammenligning' : ''}`}>
          <div className="ko-panel">
            <div className="ko-paneltopp">
              <div><span className="ft-stikkord">Historisk utvikling</span><h2>{historyDefinition?.label}</h2></div>
              <select className="ko-select" value={historyMetric} onChange={(event) => setHistoryMetric(event.target.value)}>
                {metricDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <LinjeGraf serier={historySeries} aar={index.years} W={680} H={250} fraNull={historyMetric !== 'net_result'} aksefmt={(value) => formatKostraValue(value, mode)} tips={historyTips} beskrivelse={mode === 'perCapita' ? `${historyDefinition?.label} per innbygger for ${detail.entity.name}, sammenlignet med Norge og KOSTRA-gruppen` : `${historyDefinition?.label} totalt for ${detail.entity.name}`} />
            <div className="ko-graflegend">
              {historySeries.map((serie) => <span key={serie.navn}><i style={{ background: serie.farge }} />{serie.navn}</span>)}
            </div>
          </div>
          {mode === 'perCapita' && <div className="ko-panel ko-sammenligning">
            <span className="ft-stikkord">Sammenligning {year}</span>
            <h2>{historyDefinition?.label}</h2>
            {comparisons.map((comparison) => {
              const value = mapValue(index, historyMetric, year, comparison.id, mode)
              const population = populationForEntity(index, year, comparison.id)
              return (
                <div className="ko-sammenlignrad" key={comparison.id}>
                  <span>{comparison.name}<small>{population == null ? 'Innbyggertall mangler' : `ca. ${populationFormat.format(population)} innbyggere`}</small></span>
                  <strong>{formatKostraValue(value, mode)}</strong>
                </div>
              )
            })}
          </div>}
        </div>

        <div className="ko-breakdowngrid">
          <Breakdown title="Hva inntektene består av" rows={detail.revenueBreakdown} detail={detail} year={year} />
          <Breakdown title="Hva utgiftene består av" rows={detail.expenseBreakdown} detail={detail} year={year} />
        </div>

        <div className="ko-drill">
          <div className="ko-paneltopp">
            <div><span className="ft-stikkord">Økonomisk drill-down</span><h2>Fra total til regnskapsart</h2></div>
            <span className="num">{year}</span>
          </div>
          <div className="ko-drillgrid">
            <div>
              <div className="ko-drillsmuler">
                <button onClick={() => { setServiceCode(null); setFunctionCode(null) }}>Totalt</button>
                {selectedService && <><span>›</span><button onClick={() => setFunctionCode(null)}>{selectedService.name}</button></>}
                {selectedFunction && <><span>›</span><span>{selectedFunction.name}</span></>}
              </div>
              <div className={`ko-drillhode ${selectedFunction ? 'ko-drillhode--arts' : ''}`}>
                <span>{selectedFunction ? 'Regnskapsart' : selectedService ? 'KOSTRA-funksjon' : 'Tjenesteområde'}</span>
                {selectedFunction
                  ? <><span>{mode === 'perCapita' ? 'Per innb.' : 'Totalt'}</span><span>Andel</span></>
                  : <><span>Beløp</span><span /></>}
              </div>
              <div className="ko-drillrader">
                {drillRows.map((row) => {
                  const value = selectedFunction ? row.amount : point(row, 'net_expenses', year)?.amount
                  const clickable = !selectedFunction
                  return (
                    <button
                      key={row.code}
                      className={selectedFunction ? 'ko-drillart' : ''}
                      disabled={!clickable}
                      onClick={() => selectedService ? setFunctionCode(row.code) : setServiceCode(row.code)}
                    >
                      <span>
                        <span><small>{row.code}</small>{row.name}</span>
                        {selectedFunction && <i style={{ width: `${Math.abs(row[mode] ?? 0) / maxArtValue * 100}%` }} />}
                      </span>
                      <strong className="num">{formatKostraValue(selectedFunction ? row[mode] : value, selectedFunction ? mode : 'amount')}</strong>
                      {selectedFunction && <em className="num">{Number.isFinite(row.share) ? `${populationFormat.format(row.share)} %` : '–'}</em>}
                      {clickable && <b>›</b>}
                    </button>
                  )
                })}
              </div>
              {artBreakdown?.reconciliation.status === 'reconciled' && <p className="ko-artavstemming">Artsgruppene avstemmer mot funksjonens brutto driftsutgifter.</p>}
              {artBreakdown?.reconciliation.status === 'difference' && (
                <p className="ko-artavstemming">Artsgruppene summerer til {formatKostraValue(artBreakdown.reconciliation.componentTotal, 'amount')}, mens SSB oppgir {formatKostraValue(artBreakdown.reconciliation.functionTotal, 'amount')}. Avviket på {formatKostraValue(artBreakdown.reconciliation.difference, 'amount')} er ikke justert.</p>
              )}
              {artBreakdown?.reconciliation.status === 'incomplete-components' && (
                <p className="ko-artavstemming">SSB mangler én eller flere hovedarter for valgt år. Rapporterte arter vises, men andeler og avstemming utelates.</p>
              )}
              {artBreakdown?.reconciliation.status === 'missing-total' && (
                <p className="ko-artavstemming">SSB har publisert hovedartene, men mangler kontrolltotalen. Artsfordelingen kan derfor ikke avstemmes mot brutto driftsutgifter.</p>
              )}
              {arts.some((item) => (item.amount ?? 0) < 0) && (
                <p className="ko-artavstemming">Negative beløp er motposter og vises med fortegn; de er ikke fremstilt som ordinære kostnader.</p>
              )}
            </div>
            <aside className="ko-drillgraf" aria-live="polite" aria-atomic="true">
              <span className="ft-stikkord">Utvikling over tid</span>
              <h3>{drillHistoryData.name}</h3>
              <strong className="ko-drillgrafverdi num">{formatKostraValue(drillHistoryData.latestValue, 'amount')}</strong>
              <KostraGrowthSummary growth={drillGrowth} />
              {selectedFunction && <p className="ko-drillgrafnote">Regnskapsartene viser {year}; grafen viser funksjonen over tid.</p>}
              <LinjeGraf
                serier={drillSeries}
                aar={index.years}
                W={390}
                H={230}
                fraNull={drillHistoryData.fromZero}
                aksefmt={(value) => formatKostraValue(value, 'amount')}
                tips={drillTips}
                beskrivelse={`Utvikling i ${drillHistoryData.name.toLowerCase()} for ${detail.entity.name}`}
              />
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
