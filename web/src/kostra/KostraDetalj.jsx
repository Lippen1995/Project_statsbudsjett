import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadKostraDetail } from '../lib/kostra'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { INK, RUST } from '../fellestall/design'
import {
  comparisonEntityIds,
  drillHistory,
  formatKostraValue,
  incomeEqualizationSummary,
  mapValue,
  materialBoundaryHistory,
  metricSeries,
  populationForEntity,
  stateFlowSummary,
  yearlyGrowth,
} from './model'
import { accountingArtBreakdown, accountingArtFunctionBreakdown } from './explorer'
import KostraGrowthSummary from './KostraGrowthSummary'
import KostraInfoTooltip from './KostraInfoTooltip'

const GREEN = '#47735D'
const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })

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
  const contributingFunctionCount = functionRows.filter((row) => row.amount !== 0).length
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
        >
          <div>
            <span>{row.name}</span>
            <strong>{formatKostraValue(row.amount, 'amount')}<b aria-hidden="true">›</b></strong>
          </div>
          <i style={{ width: `${Math.abs(row.amount) / max * 100}%` }} />
          <span className="sr-only">. Vis fordeling på KOSTRA-funksjoner</span>
        </button>
      ))}
      {selected && <>
        <div className="ko-breakdownsmuler">
          <button type="button" ref={backButtonRef} onClick={closeDrill}>← Tilbake</button>
          <span>{selected.code}</span>
        </div>
        <div className="ko-breakdownvalgt">
          <strong>{selected.name}</strong>
          <span>{formatKostraValue(selected.amount, 'amount')} · {contributingFunctionCount} funksjoner med beløp</span>
        </div>
        {functionRows.length > 0 && (
          <div className="ko-breakdowntabellramme" tabIndex="0" aria-label="Rull sidelengs for å se hele funksjonstabellen på smale skjermer">
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
          </div>
        )}
        {functionRows.length > 10 && (
          <button type="button" className="ko-breakdownvisalle" onClick={() => setShowAll((current) => !current)}>
            {showAll ? 'Vis de første 10 funksjonene' : `Vis alle ${functionRows.length} funksjoner`}
          </button>
        )}
        {functionRows.length === 0 && <p className="ko-artavstemming">SSB har ikke publisert funksjonsfordeling for denne regnskapsarten.</p>}
        {breakdown?.summation.status === 'matches' && (
          <p className="ko-artavstemming">Totalen over inkluderer alle rapporterte KOSTRA-funksjoner{functionRows.length > 10 ? ', også radene som vises når listen utvides' : ''}.</p>
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

function ratioDescription(ratio) {
  if (!Number.isFinite(ratio)) return 'Nivå mot landsgjennomsnittet mangler'
  const deviation = Math.abs((ratio - 1) * 100)
  if (deviation < 0.05) return 'På nivå med landsgjennomsnittet'
  return `${percentFormat.format(deviation)} % ${ratio > 1 ? 'over' : 'under'} landsgjennomsnittet`
}

function StateTaxDetails({ entityName, stateFlows, year, mode }) {
  const summary = stateFlowSummary(stateFlows, 'outgoing', year, mode)
  const items = stateFlows?.outgoing ?? []
  const valuesByCode = new Map(items.map((item) => [item.code, item]))
  const sourcePeriods = [...new Set(items
    .map((item) => item.values?.[year]?.sourcePeriod)
    .filter(Boolean))]
  if (summary.rows.length === 0) return null

  return (
    <details className="ko-stromdetaljer">
      <summary>Se skatter og avgifter registrert i {entityName}</summary>
      <article className="ko-stromkolonne">
        <span className="ft-stikkord">Kommunen som geografisk område</span>
        <h3>Til staten og folketrygden</h3>
        <strong className="ko-stromtotal ko-stromtotal--trekk num">{formatKostraValue(summary.total, mode)}</strong>
        <p className="ko-stromforklaring">Dette er innbetalte og fordelte skatter og avgifter registrert i området. De er ikke kommuneorganisasjonens betaling og inngår ikke i konklusjonen over.</p>
        <table className="ko-stromtabell">
          <caption className="sr-only">Skatter og avgifter registrert i {entityName} i {year}</caption>
          <thead><tr><th scope="col">Post</th><th scope="col">Beløp</th></tr></thead>
          <tbody>{summary.rows.map((row) => (
            <tr key={row.code}>
              <th scope="row"><span>{row.label}</span><small>{valuesByCode.get(row.code)?.description}</small></th>
              <td className="num">{formatKostraValue(row.value, mode)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!summary.complete && <p className="ko-stromdekning">Totalsummen skjules fordi én eller flere poster mangler.</p>}
        <small className="ko-stromkilde">Faktiske tall · SSB 07022, akkumulert desember{sourcePeriods.length > 0 && ` · ${sourcePeriods.join(', ')}`}</small>
      </article>
    </details>
  )
}

function IncomeEqualization({ entityName, incomeEqualization, stateFlows, year, mode }) {
  const summary = incomeEqualizationSummary(incomeEqualization, stateFlows, year, mode)
  if (!summary || summary.equalizationStatus === 'missing') {
    return (
      <section className="ko-strommer" aria-labelledby="ko-strommer-tittel">
        <div className="ko-stromhode">
          <span className="ft-stikkord">Inntektsutjevning</span>
          <h2 id="ko-strommer-tittel">Inntektsutjevningen for {entityName}</h2>
          <p>Kommunal- og distriktsdepartementet har ikke publisert en sluttavregning for dette året.</p>
        </div>
      </section>
    )
  }

  const isContributor = summary.equalizationStatus === 'contributor'
  const isRecipient = summary.equalizationStatus === 'recipient'
  const statusTitle = isContributor
    ? `${entityName} får et trekk og bidrar til utjevningen`
    : isRecipient ? `${entityName} får et tillegg gjennom utjevningen` : `${entityName} får verken tillegg eller trekk`
  const valueContext = mode === 'perCapita' ? 'per innbygger' : 'til sammen'
  const transferTitle = isContributor
    ? `Trekk: ${formatKostraValue(Math.abs(summary.equalization), mode)} ${valueContext}`
    : isRecipient
      ? `Tillegg: ${formatKostraValue(Math.abs(summary.equalization), mode)} ${valueContext}`
      : 'Ingen omfordeling'
  const freeIncomeTitle = summary.freeIncomeSource === 'own_tax'
    ? 'Mest kommer fra egne skatter'
    : summary.freeIncomeSource === 'block_grant'
      ? 'Mest kommer fra rammetilskuddet'
      : summary.freeIncomeSource === 'equal' ? 'De to inntektskildene er like store' : 'Tallgrunnlaget er ufullstendig'
  const freeIncomeDescription = summary.freeIncomeSource === 'own_tax'
    ? 'Av disse to inntektskildene er kommunens egne skatteinntekter størst.'
    : summary.freeIncomeSource === 'block_grant'
      ? 'Av disse to inntektskildene er rammetilskuddet fra staten størst.'
      : summary.freeIncomeSource === 'equal'
        ? 'Skatteinntektene og rammetilskuddet er omtrent like store.'
        : 'Skatteinntekter eller rammetilskudd mangler for dette året.'
  const equalizationRowTitle = isContributor
    ? 'Trekk gjennom rammetilskuddet'
    : isRecipient ? 'Tillegg gjennom inntektsutjevningen' : 'Ingen endring'
  const equalizationRowDescription = isContributor
    ? 'Trekket bidrar til utjevningen for kommuner med lavere skatteinntekter.'
    : isRecipient ? 'Dette beløpet legges til gjennom rammetilskuddet.' : 'Kommunens skatteinntekter endres ikke.'

  return (
    <section className="ko-strommer" aria-labelledby="ko-strommer-tittel">
      <div className="ko-stromhode">
        <span className="ft-stikkord">Skatt og inntektsutjevning</span>
        <h2 id="ko-strommer-tittel">Hva betyr inntektsutjevningen for {entityName}?</h2>
        <p>Kommuner får svært ulike skatteinntekter. Derfor blir noe av forskjellen jevnet ut gjennom pengene kommunen får fra staten, kalt rammetilskudd. Kommuner med mye skatt per innbygger får et trekk, mens kommuner med mindre skatt får et tillegg. Målet er at alle kommuner skal ha bedre mulighet til å tilby gode tjenester.</p>
      </div>
      <div className={`ko-utjevningstatus ko-utjevningstatus--${summary.equalizationStatus}`}>
        <span className="ft-stikkord">Kort fortalt · {year}</span>
        <h3>{statusTitle}</h3>
        <p>
          Før utjevningen har kommunen <strong>{formatKostraValue(summary.taxBefore, mode)}</strong> {valueContext} i skatteinntekter. Det er {ratioDescription(summary.taxBeforeNationalRatio).toLowerCase()}.
          {' '}{isContributor
            ? <>Derfor får kommunen et trekk på <strong>{formatKostraValue(Math.abs(summary.equalization), mode)}</strong> {valueContext} gjennom rammetilskuddet.</>
            : isRecipient
              ? <>Derfor får kommunen <strong>{formatKostraValue(Math.abs(summary.equalization), mode)}</strong> {valueContext} i tillegg gjennom rammetilskuddet.</>
              : 'Utjevningen endrer derfor ikke skatteinntektene.'}
          {' '}Etter utjevningen tilsvarer skattenivået <strong>{formatKostraValue(summary.taxAfter, mode)}</strong> {valueContext}. Dette er et sammenligningstall, ikke en egen inntekt.
        </p>
      </div>
      <div className="ko-stromgrid">
        <article className="ko-stromkolonne">
          <span className="ft-stikkord">Slik regnes det</span>
          <h3>Skattenivå før og etter utjevning</h3>
          <strong className={`ko-stromtotal num ${isContributor ? 'ko-stromtotal--trekk' : ''}`}>
            {transferTitle}
          </strong>
          <p className="ko-stromforklaring">Tabellen viser kommunens faktiske skatteinntekter, justeringen gjennom rammetilskuddet og et beregnet nivå etter utjevning.</p>
          <table className="ko-stromtabell">
            <caption className="sr-only">Skatt og inntektsutjevning for {entityName} i {year}</caption>
            <thead><tr><th scope="col">Post</th><th scope="col">{mode === 'perCapita' ? 'Per innbygger' : 'Beløp'}</th></tr></thead>
            <tbody>
              <tr><th scope="row"><span>Skatteinntekter før utjevning</span><small>Det kommunen får inn før noe blir omfordelt.</small></th><td className="num">{formatKostraValue(summary.taxBefore, mode)}</td></tr>
              <tr className="ko-stromtabell--utjevning"><th scope="row"><span>{equalizationRowTitle}</span><small>{equalizationRowDescription}</small></th><td className="num">{formatKostraValue(summary.equalization, mode)}</td></tr>
              <tr><th scope="row"><span>Skattenivå etter utjevning</span><small>Et sammenligningstall – ikke en egen inntekt som skal legges til rammetilskuddet.</small></th><td className="num">{formatKostraValue(summary.taxAfter, mode)}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="ko-stromkolonne">
          <span className="ft-stikkord">Penger kommunen kan prioritere selv</span>
          <h3>Skatteinntekter og penger fra staten</h3>
          <strong className="ko-stromtotal num">{freeIncomeTitle}</strong>
          <p className="ko-stromforklaring">Frie inntekter er penger kommunen i hovedsak kan prioritere selv. Forenklet er det skatteinntektene før utjevning pluss rammetilskuddet, der tillegg eller trekk fra utjevningen allerede er tatt med. {freeIncomeDescription}</p>
          <table className="ko-stromtabell">
            <caption className="sr-only">Frie inntektskilder for {entityName} i {year}</caption>
            <thead><tr><th scope="col">Kilde</th><th scope="col">{mode === 'perCapita' ? 'Per innbygger' : 'Beløp'}</th></tr></thead>
            <tbody>
              <tr><th scope="row"><span>Kommunens skatteinntekter</span><small>Inntekts- og formuesskatt fra personer, samt naturressursskatt der det er aktuelt.</small></th><td className="num">{formatKostraValue(summary.taxBefore, mode)}</td></tr>
              <tr><th scope="row"><span>Penger fra staten (rammetilskudd)</span><small>Inntektsutjevningen er én av flere deler av denne samlede overføringen.</small></th><td className="num">{formatKostraValue(summary.blockGrant, mode)}</td></tr>
            </tbody>
          </table>
        </article>
      </div>
      <div className="ko-stromforbehold">
        <p><strong>Slik kan tallene legges sammen:</strong> Bruk skatteinntekter før utjevning og rammetilskuddet. Ikke legg til skattenivået etter utjevning – da blir utjevningen telt to ganger.</p>
        <p><strong>Hvorfor gjør vi dette?</strong> Kommuner med høye skatteinntekter har et bedre utgangspunkt enn kommuner med lave skatteinntekter. Utjevningen reduserer forskjellen, men fjerner den ikke helt.</p>
        <p><strong>Hva er med i beregningen?</strong> Inntekts- og formuesskatt fra personer og naturressursskatt fra kraftforetak. Det er skatt per innbygger som sammenlignes.</p>
        <p><strong>Hva er ikke med?</strong> Blant annet eiendomsskatt, gebyrer, salgsinntekter og utbytte fra selskaper kommunen eier. En kommune kan derfor ha andre store inntekter som ikke vises her.</p>
        <p><strong>Rammetilskudd er mer enn inntektsutjevning.</strong> Det inneholder også utgiftsutjevning og andre tilskudd. Inntektsutjevningen er bare én del av den samlede overføringen fra staten.</p>
      </div>
      <small className="ko-stromkilde">Faktiske tall · {summary.sourceUrl
        ? <a href={summary.sourceUrl} target="_blank" rel="noreferrer">Kommunal- og distriktsdepartementet</a>
        : 'Kommunal- og distriktsdepartementet'}, løpende inntektsutjevning · SSB KOSTRA 12137</small>
      <StateTaxDetails entityName={entityName} stateFlows={stateFlows} year={year} mode={mode} />
    </section>
  )
}

export default function KostraDetalj({ index, kind, code, embedded = false, onReady }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('perCapita')
  const [historyMetric, setHistoryMetric] = useState('expenses')
  const [serviceCode, setServiceCode] = useState(null)
  const [functionCode, setFunctionCode] = useState(null)
  const [drillMode, setDrillMode] = useState('amount')

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

  useLayoutEffect(() => {
    if (detail) onReady?.()
  }, [detail, onReady])

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
    ? [...arts].sort((a, b) => (b[drillMode] ?? -Infinity) - (a[drillMode] ?? -Infinity))
    : selectedService
      ? [...functions].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.[drillMode] ?? 0) - Math.abs(point(a, 'net_expenses', year)?.[drillMode] ?? 0))
      : [...detail.services].sort((a, b) => Math.abs(point(b, 'net_expenses', year)?.[drillMode] ?? 0) - Math.abs(point(a, 'net_expenses', year)?.[drillMode] ?? 0))
  const maxArtValue = Math.max(1, ...arts.map((item) => Math.abs(item[drillMode] ?? 0)))
  const drillHistoryData = drillHistory(detail, index.years, serviceCode, functionCode, drillMode)
  const drillSeries = [{ navn: drillHistoryData.name, farge: RUST, bredde: 2.5, punkter: drillHistoryData.points }]
  const drillGrowth = yearlyGrowth(drillHistoryData.points, index.years, year)
  const drillPopulation = populationForEntity(index, year, entityId)
  const drillReconciliationValue = (amount) => drillMode === 'perCapita'
    ? Number.isFinite(amount) && drillPopulation ? amount * 1000 / drillPopulation : null
    : amount
  const drillTips = (i) => ({
    tittel: String(index.years[i]),
    linjer: [{ farge: RUST, tekst: `${drillHistoryData.name}: ${formatKostraValue(drillHistoryData.points[i]?.v, drillMode)}` }],
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

        {kind === 'municipality' && (
          <IncomeEqualization
            entityName={detail.entity.name}
            incomeEqualization={detail.incomeEqualization}
            stateFlows={detail.stateFlows}
            year={year}
            mode={mode}
          />
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
              const isPeerGroup = comparison.id === detail.comparisons.peerGroupEntityId
              return (
                <div className="ko-sammenlignrad" key={comparison.id}>
                  <span>
                    <span className="ko-sammenlignnavn">
                      {comparison.name}
                      {isPeerGroup && (
                        <KostraInfoTooltip label={comparison.name}>
                          SSB grupperer kommuner etter folkemengde og økonomiske rammebetingelser, blant annet bundne kostnader og frie disponible inntekter. Gruppen brukes for å sammenligne {detail.entity.name} med kommuner som har lignende forutsetninger.
                        </KostraInfoTooltip>
                      )}
                    </span>
                    <small>{population == null ? 'Innbyggertall mangler' : `ca. ${populationFormat.format(population)} innbyggere`}</small>
                  </span>
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
            <div className="ko-drillverktoy">
              <div className="ft-bytter" aria-label="Vis beløp i økonomisk drill-down">
                <button
                  type="button"
                  className={`ft-bytte ${drillMode === 'amount' ? 'aktiv' : ''}`}
                  aria-pressed={drillMode === 'amount'}
                  onClick={() => setDrillMode('amount')}
                >Nominelt beløp</button>
                <button
                  type="button"
                  className={`ft-bytte ${drillMode === 'perCapita' ? 'aktiv' : ''}`}
                  aria-pressed={drillMode === 'perCapita'}
                  onClick={() => setDrillMode('perCapita')}
                >Per innbygger</button>
              </div>
              <span className="num">{year}</span>
            </div>
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
                  ? <><span>{drillMode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span>Andel</span></>
                  : <><span>{drillMode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span /></>}
              </div>
              <div className="ko-drillrader">
                {drillRows.map((row) => {
                  const value = selectedFunction ? row[drillMode] : point(row, 'net_expenses', year)?.[drillMode]
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
                        {selectedFunction && <i style={{ width: `${Math.abs(row[drillMode] ?? 0) / maxArtValue * 100}%` }} />}
                      </span>
                      <strong className="num">{formatKostraValue(value, drillMode)}</strong>
                      {selectedFunction && <em className="num">{Number.isFinite(row.share) ? `${populationFormat.format(row.share)} %` : '–'}</em>}
                      {clickable && <b>›</b>}
                    </button>
                  )
                })}
              </div>
              {artBreakdown?.reconciliation.status === 'reconciled' && <p className="ko-artavstemming">Artsgruppene avstemmer mot funksjonens brutto driftsutgifter.</p>}
              {artBreakdown?.reconciliation.status === 'difference' && (
                <p className="ko-artavstemming">Artsgruppene summerer til {formatKostraValue(drillReconciliationValue(artBreakdown.reconciliation.componentTotal), drillMode)}, mens SSB oppgir {formatKostraValue(drillReconciliationValue(artBreakdown.reconciliation.functionTotal), drillMode)}. Avviket på {formatKostraValue(drillReconciliationValue(artBreakdown.reconciliation.difference), drillMode)} er ikke justert.</p>
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
              <strong className="ko-drillgrafverdi num">{formatKostraValue(drillHistoryData.latestValue, drillMode)}</strong>
              <KostraGrowthSummary growth={drillGrowth} />
              {selectedFunction && <p className="ko-drillgrafnote">Regnskapsartene viser {year}; grafen viser funksjonen over tid.</p>}
              <LinjeGraf
                serier={drillSeries}
                aar={index.years}
                W={390}
                H={230}
                fraNull={drillHistoryData.fromZero}
                aksefmt={(value) => formatKostraValue(value, drillMode)}
                tips={drillTips}
                beskrivelse={`Utvikling i ${drillHistoryData.name.toLowerCase()} ${drillMode === 'perCapita' ? 'per innbygger' : 'nominelt'} for ${detail.entity.name}`}
              />
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
