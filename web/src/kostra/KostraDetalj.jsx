import React, { useEffect, useMemo, useState } from 'react'
import { loadKostraDetail } from '../lib/kostra'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { INK, RUST } from '../fellestall/design'
import { formatKostraValue, mapValue, metricSeries } from './model'

const GREEN = '#47735D'

function point(item, metric, year) {
  return item?.metrics?.[metric]?.[year] ?? null
}

function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.amount)))
  return (
    <div className="ko-breakdown">
      <h3>{title}</h3>
      {rows.map((row) => (
        <div className="ko-breakdownrad" key={row.code}>
          <div><span>{row.name}</span><strong>{formatKostraValue(row.amount, 'amount')}</strong></div>
          <i style={{ width: `${Math.abs(row.amount) / max * 100}%` }} />
        </div>
      ))}
    </div>
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
    setDetail(null); setError(null); setServiceCode(null); setFunctionCode(null)
    loadKostraDetail(kind, code).then((data) => data ? setDetail(data) : setError('Detaljdata er ikke tilgjengelig ennå.')).catch((e) => setError(e.message))
  }, [kind, code])

  const entityId = kind === 'county' ? `county:${code.slice(0, 2)}` : `municipality:${code}`
  const allEntities = [...index.entities, ...(index.historicalEntities ?? [])]
  const entity = allEntities.find((item) => item.id === entityId)
  const metricDefs = index.metrics.filter((item) => item.category === 'finance')
  const selectedService = detail?.services.find((item) => item.code === serviceCode)
  const functions = detail?.functions.filter((item) => !serviceCode || item.serviceCodes?.includes(serviceCode)) ?? []
  const selectedFunction = functions.find((item) => item.code === functionCode)
  const arts = detail?.accountingArts?.[functionCode] ?? []
  const Heading = embedded ? 'h2' : 'h1'
  const comparisonIds = useMemo(() => detail ? [
    { id: entityId, name: entity?.name ?? detail.entity.name, color: RUST },
    detail.comparisons.peerGroupEntityId && { id: detail.comparisons.peerGroupEntityId, name: index.entities.find((e) => e.id === detail.comparisons.peerGroupEntityId)?.name, color: GREEN },
    { id: detail.comparisons.norwayEntityId, name: 'Norge', color: INK },
  ].filter(Boolean) : [], [detail, entityId, entity, index])

  if (error) return <section className="ko-status"><Heading>{entity?.name ?? 'KOSTRA'}</Heading><p>{error}</p><a href="#kostra">Tilbake til kartet</a></section>
  if (!detail) return <section className="ko-status"><div className="spinner" /><p>Laster kommuneregnskap…</p></section>

  const year = detail.latestYear
  const summary = ['revenues', 'expenses', 'net_result', 'debt'].map((id) => {
    const definition = metricDefs.find((item) => item.id === id)
    const value = detail.overview[id]?.[year]?.[mode]
    return { id, name: definition?.label ?? id, value }
  })
  const historyDefinition = metricDefs.find((item) => item.id === historyMetric)
  const historySeries = comparisonIds.map((comparison) => ({
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

  const drillRows = selectedFunction
    ? [...arts].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    : selectedService
      ? [...functions].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.amount ?? 0) - Math.abs(point(a, 'net_expenses', year)?.amount ?? 0))
      : [...detail.services].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.amount ?? 0) - Math.abs(point(a, 'net_expenses', year)?.amount ?? 0))

  return (
    <>
      <header className={`ko-hero ko-detailhero ${embedded ? 'ko-hero--integrert' : ''}`}>
        <div className="ft-kicker">{kind === 'county' ? 'Fylkeskommuneregnskap' : 'Kommuneregnskap'} · KOSTRA {year}</div>
        <Heading>{detail.entity.name}</Heading>
        <div className="ko-smuler">
          <a href="#kostra">Norge</a><span>›</span>
          {kind === 'municipality' && <><a href={`#kostra/fylke/${code.slice(0, 2)}`}>{index.entities.find((item) => item.id === `county:${code.slice(0, 2)}`)?.name}</a><span>›</span></>}
          <span aria-current="page">{detail.entity.name}</span>
        </div>
      </header>

      <section className="ft-seksjon ko-detaljseksjon">
        <div className="ko-moduslinje">
          <div className="ft-bytter">
            <button className={`ft-bytte ${mode === 'perCapita' ? 'aktiv' : ''}`} onClick={() => setMode('perCapita')}>Per innbygger</button>
            <button className={`ft-bytte ${mode === 'amount' ? 'aktiv' : ''}`} onClick={() => setMode('amount')}>Totalt</button>
          </div>
          {detail.entity.peer_group_id && <span>Sammenlignes med {index.entities.find((item) => item.id === detail.entity.peer_group_id)?.name}</span>}
        </div>
        <div className="ko-nokkeltall">
          {summary.map((item) => (
            <div key={item.id}><span className="ft-stikkord">{item.name}</span><strong className="num">{formatKostraValue(item.value, mode)}</strong></div>
          ))}
        </div>

        {detail.boundaryHistory?.length > 0 && (
          <div className="ko-panel ko-grensehistorikk">
            <span className="ft-stikkord">Historiske grenser og koder</span>
            <h2>Sammenlignbarhet over tid</h2>
            {detail.boundaryHistory.map((change) => {
              const changedBoundary = change.relationType === 'boundary_change'
              const previousHref = kind === 'county'
                ? `#kostra/fylke/${change.sourceCode.slice(0, 2)}/detaljer`
                : `#kostra/kommune/${change.sourceCode}`
              return (
                <p key={`${change.sourceId}-${change.targetId}-${change.changeYear}`}>
                  <strong>{change.changeYear}:</strong>{' '}
                  <a href={previousHref}>{change.sourceName} ({change.sourceCode})</a>
                  {' → '}{change.targetName} ({change.targetCode}).{' '}
                  {changedBoundary
                    ? 'Geografien ble endret; seriene holdes derfor adskilt.'
                    : 'Ren kodeendring dokumentert av SSB Klass; tidsserien videreføres.'}
                </p>
              )
            })}
          </div>
        )}

        <div className="ko-detaljgrid">
          <div className="ko-panel">
            <div className="ko-paneltopp">
              <div><span className="ft-stikkord">Historisk utvikling</span><h2>{historyDefinition?.label}</h2></div>
              <select className="ko-select" value={historyMetric} onChange={(event) => setHistoryMetric(event.target.value)}>
                {metricDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <LinjeGraf serier={historySeries} aar={index.years} W={680} H={250} fraNull={historyMetric !== 'net_result'} aksefmt={(value) => formatKostraValue(value, mode)} tips={historyTips} beskrivelse={`${historyDefinition?.label} for ${detail.entity.name}, sammenlignet med Norge og KOSTRA-gruppen`} />
            <div className="ko-graflegend">
              {historySeries.map((serie) => <span key={serie.navn}><i style={{ background: serie.farge }} />{serie.navn}</span>)}
            </div>
          </div>
          <div className="ko-panel ko-sammenligning">
            <span className="ft-stikkord">Sammenligning {year}</span>
            <h2>{historyDefinition?.label}</h2>
            {comparisonIds.map((comparison) => {
              const value = mapValue(index, historyMetric, year, comparison.id, mode)
              return <div className="ko-sammenlignrad" key={comparison.id}><span>{comparison.name}</span><strong>{formatKostraValue(value, mode)}</strong></div>
            })}
          </div>
        </div>

        <div className="ko-breakdowngrid">
          <Breakdown title="Hva inntektene består av" rows={detail.revenueBreakdown} />
          <Breakdown title="Hva utgiftene består av" rows={detail.expenseBreakdown} />
        </div>

        <div className="ko-drill">
          <div className="ko-paneltopp">
            <div><span className="ft-stikkord">Økonomisk drill-down</span><h2>Fra total til regnskapsart</h2></div>
            <span className="num">{year}</span>
          </div>
          <div className="ko-drillsmuler">
            <button onClick={() => { setServiceCode(null); setFunctionCode(null) }}>Totalt</button>
            {selectedService && <><span>›</span><button onClick={() => setFunctionCode(null)}>{selectedService.name}</button></>}
            {selectedFunction && <><span>›</span><span>{selectedFunction.name}</span></>}
          </div>
          <div className="ko-drillhode">
            <span>{selectedFunction ? 'Regnskapsart' : selectedService ? 'KOSTRA-funksjon' : 'Tjenesteområde'}</span>
            <span>Beløp</span>
          </div>
          <div className="ko-drillrader">
            {drillRows.map((row) => {
              const value = selectedFunction ? row.amount : point(row, 'net_expenses', year)?.amount
              const clickable = !selectedFunction
              return (
                <button
                  key={row.code}
                  disabled={!clickable}
                  onClick={() => selectedService ? setFunctionCode(row.code) : setServiceCode(row.code)}
                >
                  <span><small>{row.code}</small>{row.name}</span>
                  <strong className="num">{formatKostraValue(value, 'amount')}</strong>
                  {clickable && <b>›</b>}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
