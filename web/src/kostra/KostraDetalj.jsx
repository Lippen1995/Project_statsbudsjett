import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadKostraDetail } from '../lib/kostra'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { INK, RUST } from '../fellestall/design'
import {
  blockGrantCalculationSummary,
  comparisonEntityIds,
  drillHistory,
  formatKostraValue,
  incomeEqualizationSummary,
  incomeSystemTableColumns,
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
const BLOCK_GRANT_COMPONENTS = {
  base_per_resident: ['Lik grunnsum per innbygger', 'Alle kommuner starter med samme beløp per innbygger.'],
  expense_equalization: ['Utgiftsutjevning', 'Justerer for ufrivillige forskjeller i behov og kostnader, blant annet alder, bosetting og levekår.'],
  special_distribution: ['Saker med særskilt fordeling', 'Tidsavgrensede eller særskilt fordelte oppgaver som ligger i innbyggertilskuddet.'],
  income_guarantee: ['Inntektsgarantiordning', 'Demper brå fall når inntektssystemet eller beregningsgrunnlaget endres.'],
  district_south: ['Distriktstilskudd Sør-Norge', 'Tilskudd til kvalifiserte distriktskommuner i Sør-Norge.'],
  district_north: ['Distriktstilskudd Nord-Norge', 'Regionalpolitisk tilskudd til kommuner i Nord-Norge og Namdalen.'],
  regional_center_grant: ['Regionsentertilskudd', 'En tidligere tilskuddsordning til mellomstore kommuner som slo seg sammen.'],
  growth_grant: ['Veksttilskudd', 'Tilskudd til kommuner med særlig sterk befolkningsvekst.'],
  metropolitan_grant: ['Storbytilskudd', 'Tilskudd til de største bykommunene for særlige storbyutfordringer.'],
  discretionary_grant: ['Skjønnstilskudd', 'Midler til lokale forhold som ikke fanges godt nok av de faste kriteriene.'],
}

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

function StateTaxDetails({ entityName, stateFlows, year }) {
  const amountSummary = stateFlowSummary(stateFlows, 'outgoing', year, 'amount')
  const perCapitaSummary = stateFlowSummary(stateFlows, 'outgoing', year, 'perCapita')
  const items = stateFlows?.outgoing ?? []
  const valuesByCode = new Map(items.map((item) => [item.code, item]))
  const perCapitaByCode = new Map(perCapitaSummary.rows.map((row) => [row.code, row.value]))
  const sourcePeriods = [...new Set(items
    .map((item) => item.values?.[year]?.sourcePeriod)
    .filter(Boolean))]
  if (amountSummary.rows.length === 0) return null

  return (
    <details className="ko-stromdetaljer">
      <summary>Se skatter og avgifter registrert i {entityName}</summary>
      <article className="ko-stromkolonne">
        <span className="ft-stikkord">Kommunen som geografisk område</span>
        <h3>Til staten og folketrygden</h3>
        <div className="ko-stromtotaller">
          <div><small>Nominelt beløp</small><strong className="ko-stromtotal ko-stromtotal--trekk num">{formatKostraValue(amountSummary.total, 'amount')}</strong></div>
          <div><small>Per innbygger</small><strong className="ko-stromtotal ko-stromtotal--trekk num">{formatKostraValue(perCapitaSummary.total, 'perCapita')}</strong></div>
        </div>
        <p className="ko-stromforklaring">Dette er innbetalte og fordelte skatter og avgifter registrert i området. De er ikke kommuneorganisasjonens betaling og inngår ikke i konklusjonen over.</p>
        <div className="ko-rammetabellramme" tabIndex="0" aria-label="Rull sidelengs for å se nominelt beløp og beløp per innbygger på smale skjermer">
          <table className="ko-stromtabell ko-dobbeltbelop">
            <caption className="sr-only">Skatter og avgifter registrert i {entityName} i {year}, nominelt og per innbygger</caption>
            <thead><tr><th scope="col">Post</th><th scope="col">Nominelt beløp</th><th scope="col">Per innbygger</th></tr></thead>
            <tbody>{amountSummary.rows.map((row) => (
              <tr key={row.code}>
                <th scope="row"><span>{row.label}</span><small>{valuesByCode.get(row.code)?.description}</small></th>
                <td className="num">{formatKostraValue(row.value, 'amount')}</td>
                <td className="num">{formatKostraValue(perCapitaByCode.get(row.code), 'perCapita')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {(!amountSummary.complete || !perCapitaSummary.complete) && <p className="ko-stromdekning">Totalsummen skjules fordi én eller flere poster mangler.</p>}
        <small className="ko-stromkilde">Faktiske tall · SSB 07022, akkumulert desember{sourcePeriods.length > 0 && ` · ${sourcePeriods.join(', ')}`}</small>
      </article>
    </details>
  )
}

function IncomeEqualization({
  entityName,
  incomeEqualization,
  stateFlows,
  blockGrantCalculation,
  incomeSystemComparisons,
  year,
  mode,
}) {
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
    ? `${entityName} får et trekk i rammetilskuddet`
    : isRecipient ? `${entityName} får et tillegg i rammetilskuddet` : `${entityName} får verken tillegg eller trekk`
  const valueContext = mode === 'perCapita' ? 'per innbygger' : 'til sammen'
  const amountSummary = incomeEqualizationSummary(incomeEqualization, stateFlows, year, 'amount')
  const perCapitaSummary = incomeEqualizationSummary(incomeEqualization, stateFlows, year, 'perCapita')
  const amountCalculation = blockGrantCalculationSummary(blockGrantCalculation, amountSummary, year, 'amount')
  const perCapitaCalculation = blockGrantCalculationSummary(blockGrantCalculation, perCapitaSummary, year, 'perCapita')
  const perCapitaComponents = new Map((perCapitaCalculation?.components ?? []).map((component) => [component.code, component.value]))
  const comparisonRows = incomeSystemComparisons?.values?.[year] ?? []
  const incomeColumns = incomeSystemTableColumns(summary, comparisonRows, entityName, mode)
  const equalizationLabel = isContributor
    ? 'Trekk i inntektsutjevningen'
    : isRecipient ? 'Tillegg i inntektsutjevningen' : 'Inntektsutjevning'

  return (
    <section className="ko-strommer" aria-labelledby="ko-strommer-tittel">
      <div className="ko-stromhode">
        <span className="ft-stikkord">Skatt, rammetilskudd og utjevning</span>
        <h2 id="ko-strommer-tittel">Slik henger pengene sammen for {entityName}</h2>
        <p>Kommunen får både lokale skatteinntekter og rammetilskudd fra staten. Inntektsutjevningen er ikke en tredje inntekt: den er et tillegg eller trekk inne i rammetilskuddet. Oppstillingen under tar den derfor først ut av det bokførte rammetilskuddet, og legger den inn igjen som en synlig egen linje.</p>
      </div>
      <div className={`ko-utjevningstatus ko-utjevningstatus--${summary.equalizationStatus}`}>
        <span className="ft-stikkord">Kort fortalt · {year}</span>
        <h3>{statusTitle}</h3>
        <p>
          Kommunens skatt per innbygger før utjevning er {ratioDescription(summary.taxBeforeNationalRatio).toLowerCase()}.
          {' '}{isContributor
            ? <>Derfor reduseres rammetilskuddet med <strong>{formatKostraValue(Math.abs(summary.equalization), mode)}</strong> {valueContext}.</>
            : isRecipient
              ? <>Derfor økes rammetilskuddet med <strong>{formatKostraValue(Math.abs(summary.equalization), mode)}</strong> {valueContext}.</>
              : 'Rammetilskuddet endres ikke gjennom inntektsutjevningen.'}
          {' '}Kommunen sender ikke en faktura til andre kommuner; staten gjør justeringen når rammetilskuddet utbetales.
        </p>
      </div>
      <article className="ko-inntektsregnestykke">
        <span className="ft-stikkord">Pengene kommunen faktisk har fått inn{mode === 'perCapita' && comparisonRows.length > 0 ? ' · sammenligning per innbygger' : ''}</span>
        <h3>Skatt, rammetilskudd og utjevning i ett regnestykke</h3>
        <p>
          Først vises hvordan inntektsutjevningen endrer rammetilskuddet. Deretter legges kommunens skatt til.
          {' '}Sluttsummen er ikke «totale skatteinntekter», fordi rammetilskuddet er penger fra staten – ikke skatt kommunen har krevd inn.
          {mode === 'perCapita' && comparisonRows.length > 0
            ? ' Beløp per innbygger gjør kommunen, KOSTRA-gruppen og Norge sammenlignbare.'
            : mode === 'perCapita' ? ' Alle linjene bruker samme innbyggertall som KDDs sluttavregning, slik at de kan summeres.' : ''}
        </p>
        <div className="ko-rammetabellramme" tabIndex={incomeColumns.length > 1 ? '0' : undefined} aria-label={incomeColumns.length > 1 ? 'Rull sidelengs for å se hele sammenligningen på smale skjermer' : undefined}>
          <table className={`ko-stromtabell ko-regnestykke ko-inntektssystemtabell${incomeColumns.length > 1 ? ' ko-inntektssystemtabell--sammenligning' : ''}`}>
            <caption className="sr-only">Skatt, rammetilskudd og inntektsutjevning for {entityName} i {year}</caption>
            <thead><tr><th scope="col">Regnestykke</th>{incomeColumns.map((column) => (
              <th scope="col" key={column.id}>
                <span className="ko-sammenlignnavn">{column.label}{column.id.startsWith('peer_group:') && (
                  <KostraInfoTooltip label={column.label}>SSB grupperer kommuner med lignende folketall, økonomiske rammer og kostnadsforhold. Gruppen er et sammenligningsgrunnlag, ikke en egen kommune.</KostraInfoTooltip>
                )}</span>
                <small>{mode === 'perCapita' ? 'Per innbygger' : 'Beløp'}</small>
              </th>
            ))}</tr></thead>
            <tbody>
              <tr><th scope="row"><b className="ko-operator">&nbsp;</b><span>Rammetilskudd før inntektsutjevning</span><small>Bokført rammetilskudd med utjevningens tillegg eller trekk tatt ut.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.before, mode)}</td>)}</tr>
              <tr className="ko-stromtabell--utjevning"><th scope="row"><b className="ko-operator">±</b><span>Inntektsutjevning</span><small>Tillegg eller trekk ut fra skatt per innbygger sammenlignet med landet.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.equalization, mode)}</td>)}</tr>
              <tr className="ko-regnestykke--delsum"><th scope="row"><b className="ko-operator">=</b><span>Bokført rammetilskudd</span><small>Det kommunen faktisk har inntektsført som rammetilskudd.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.booked, mode)}</td>)}</tr>
              <tr><th scope="row"><b className="ko-operator">+</b><span>Kommunens skatteinntekter</span><small>Personlig inntekts- og formuesskatt, pluss naturressursskatt.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.tax, mode)}</td>)}</tr>
              <tr className="ko-regnestykke--sum"><th scope="row"><b className="ko-operator">=</b><span>Skatt og bokført rammetilskudd til sammen</span><small>To sentrale, frie inntektskilder – ikke kommunens samlede inntekter.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.total, mode)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </article>

      <div className="ko-stromgrid ko-forklaringsgrid">
        <article className="ko-stromkolonne">
          <span className="ft-stikkord">Hvor skatten kommer fra</span>
          <h3>Ikke all skatt blir igjen i kommunen</h3>
          <p className="ko-stromforklaring">Skatten som inngår i utjevningen, er kommunens andel av inntekts- og formuesskatt fra personer og naturressursskatt fra kraftforetak.</p>
          <ul className="ko-forklaringsliste">
            <li><strong>Personskatt:</strong> Staten bestemmer hvor stor del av skatt på inntekt og formue som tilfaller kommunen.</li>
            <li><strong>Selskapsskatt:</strong> Ordinær skatt på selskapers overskudd går til staten, ikke til kommunen.</li>
            <li><strong>Kraftunntaket:</strong> Naturressursskatt betales av kraftforetak til vertskommuner og inngår i utjevningen.</li>
            <li><strong>Andre lokale inntekter:</strong> Eiendomsskatt, gebyrer og utbytte fra kommunalt eide selskaper holdes utenfor inntektsutjevningen.</li>
          </ul>
        </article>
        <article className="ko-stromkolonne">
          <span className="ft-stikkord">Hvorfor staten justerer</span>
          <h3>To ulike forskjeller blir jevnet ut</h3>
          <p className="ko-stromforklaring"><strong>Inntektsutjevning</strong> reduserer forskjeller i skatteinntekt per innbygger. <strong>Utgiftsutjevning</strong> kompenserer for ufrivillige forskjeller i hva tjenestene koster.</p>
          <ul className="ko-forklaringsliste">
            <li>Kommuner med lav skatt per innbygger får et tillegg; kommuner med høy skatt får et trekk.</li>
            <li>Behov knyttet til blant annet alder, levekår, reiseavstander og bosettingsmønster påvirker utgiftsutjevningen.</li>
            <li>Forskjellene reduseres, men fjernes ikke helt. Kommunene beholder derfor fortsatt ulike økonomiske utgangspunkt.</li>
          </ul>
        </article>
      </div>

      <details className="ko-stromdetaljer ko-rammedetaljer">
        <summary>Se hele beregningen bak rammetilskuddet</summary>
        <div className="ko-rammedetaljinnhold">
          <h3>Fra lik grunnsum til bokført rammetilskudd</h3>
          <p>Grønt hefte viser beregningen i statsbudsjettet. Inntektsutjevningen fastsettes løpende når skattetallene blir kjent. Det bokførte KOSTRA-tallet kan derfor avvike fra statsbudsjettets opprinnelige beregning.</p>
          {amountCalculation ? (
            <div className="ko-rammetabellramme" tabIndex="0" aria-label="Rull sidelengs for å se nominelt beløp og beløp per innbygger på smale skjermer">
              <table className="ko-stromtabell ko-regnestykke ko-dobbeltbelop">
                <caption className="sr-only">Beregning av rammetilskuddet for {entityName} i {year}, nominelt og per innbygger</caption>
                <thead><tr><th scope="col">Del av beregningen</th><th scope="col">Nominelt beløp</th><th scope="col">Per innbygger</th></tr></thead>
                <tbody>
                  {amountCalculation.components.map((component) => {
                    const definition = BLOCK_GRANT_COMPONENTS[component.code] ?? [component.code, '']
                    return <tr key={component.code}><th scope="row"><span>{definition[0]}</span><small>{definition[1]}</small></th><td className="num">{formatKostraValue(component.value, 'amount')}</td><td className="num">{formatKostraValue(perCapitaComponents.get(component.code), 'perCapita')}</td></tr>
                  })}
                  <tr className="ko-regnestykke--delsum"><th scope="row"><span>Rammetilskudd i statsbudsjettet før inntektsutjevning</span><small>Summen av postene over.</small></th><td className="num">{formatKostraValue(amountCalculation.budgetedBeforeEqualization, 'amount')}</td><td className="num">{formatKostraValue(perCapitaCalculation?.budgetedBeforeEqualization, 'perCapita')}</td></tr>
                  <tr className="ko-stromtabell--utjevning"><th scope="row"><span>{equalizationLabel}</span><small>Endelig, faktisk inntektsutjevning legges til budsjettgrunnlaget her.</small></th><td className="num">{formatKostraValue(amountCalculation.equalization, 'amount')}</td><td className="num">{formatKostraValue(perCapitaCalculation?.equalization, 'perCapita')}</td></tr>
                  <tr><th scope="row"><span>Budsjettgrunnlag etter inntektsutjevning</span><small>Beregnet kontrollsum, ikke en egen bokført post.</small></th><td className="num">{formatKostraValue(amountCalculation.budgetedAfterEqualization, 'amount')}</td><td className="num">{formatKostraValue(perCapitaCalculation?.budgetedAfterEqualization, 'perCapita')}</td></tr>
                  <tr><th scope="row"><span>Endringer og avstemmingsforskjell gjennom året</span><small>Blant annet budsjettvedtak, ekstra skjønn og periodisering kan gi avvik.</small></th><td className="num">{formatKostraValue(amountCalculation.reconciliation, 'amount')}</td><td className="num">{formatKostraValue(perCapitaCalculation?.reconciliation, 'perCapita')}</td></tr>
                  <tr className="ko-regnestykke--sum"><th scope="row"><span>Faktisk bokført rammetilskudd</span><small>KOSTRA-regnskapet er kontrolltotalen.</small></th><td className="num">{formatKostraValue(amountCalculation.reportedBlockGrant, 'amount')}</td><td className="num">{formatKostraValue(perCapitaCalculation?.reportedBlockGrant, 'perCapita')}</td></tr>
                </tbody>
              </table>
            </div>
          ) : <p>Den kommunevise tabellen fra Grønt hefte er ikke tilgjengelig for dette året. Det bokførte rammetilskuddet og den faktiske inntektsutjevningen vises likevel over.</p>}
          {amountCalculation?.sourceUrl && <small className="ko-stromkilde">Budsjettberegning · <a href={amountCalculation.sourceUrl} target="_blank" rel="noreferrer">Grønt hefte, tabell 1-k og 2-k</a> · periode {amountCalculation.sourcePeriod}</small>}
        </div>
      </details>
      <small className="ko-stromkilde">Faktiske tall · {summary.sourceUrl
        ? <a href={summary.sourceUrl} target="_blank" rel="noreferrer">Kommunal- og distriktsdepartementet</a>
        : 'Kommunal- og distriktsdepartementet'}, løpende inntektsutjevning · SSB KOSTRA 12137</small>
      <StateTaxDetails entityName={entityName} stateFlows={stateFlows} year={year} />
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
            blockGrantCalculation={detail.blockGrantCalculation}
            incomeSystemComparisons={detail.incomeSystemComparisons}
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
