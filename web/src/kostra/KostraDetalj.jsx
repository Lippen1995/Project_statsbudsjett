import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
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
  municipalityEqualizationRows,
  municipalityFreeIncomeRankingRows,
  municipalityIncomeRankingRows,
  personalTaxAllocation,
  populationForEntity,
  stateFlowSummary,
  yearlyGrowth,
} from './model'
import { accountingArtBreakdown, explorerDrillRows } from './explorer'
import KostraGrowthSummary from './KostraGrowthSummary'
import IncomeEqualizationChart from './IncomeEqualizationChart'
import KostraInfoTooltip from './KostraInfoTooltip'
import KostraStatements from './KostraStatements'
import MunicipalityEqualizationDialog from './MunicipalityEqualizationDialog'
import MunicipalityFreeIncomeRankingDialog from './MunicipalityFreeIncomeRankingDialog'
import MunicipalityIncomeRankingDialog from './MunicipalityIncomeRankingDialog'
import RobekStatusDialog from './RobekStatusDialog'
import { expenseCompositionRows, incomeCompositionRows } from './statements'

const GREEN = '#47735D'
const DRILL_CATEGORIES = [
  { id: 'revenues', label: 'Inntekter' },
  { id: 'expenses', label: 'Utgifter' },
  { id: 'investments', label: 'Investeringer' },
]
const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })
const taxRateFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 3 })
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

function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.amount ?? 0)))
  return (
    <div className="ko-breakdown">
      <h3>{title}</h3>
      {rows.map((row) => (
        <div className="ko-breakdownrad" key={row.code}>
          <div>
            <span>{row.name}</span>
            <strong>
              <span>{formatKostraValue(row.amount, 'amount')}</span>
              <small className="ko-breakdownandel">{Number.isFinite(row.share) ? `${percentFormat.format(row.share)} %` : '–'}</small>
            </strong>
          </div>
          <i style={{ width: `${Math.abs(row.amount ?? 0) / max * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

function signedPercent(value) {
  if (!Number.isFinite(value)) return '–'
  if (Math.abs(value) < 0.05) return '0 %'
  return `${value > 0 ? '+' : '−'}${percentFormat.format(Math.abs(value))} %`
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
  index,
  entityCode,
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
  const amountSummary = incomeEqualizationSummary(incomeEqualization, stateFlows, year, 'amount')
  const perCapitaSummary = incomeEqualizationSummary(incomeEqualization, stateFlows, year, 'perCapita')
  const amountCalculation = blockGrantCalculationSummary(blockGrantCalculation, amountSummary, year, 'amount')
  const perCapitaCalculation = blockGrantCalculationSummary(blockGrantCalculation, perCapitaSummary, year, 'perCapita')
  const selectedEntityId = `municipality:${entityCode}`
  const municipalityRanking = municipalityIncomeRankingRows(index, year, selectedEntityId)
  const municipalityEqualization = municipalityEqualizationRows(index, year, selectedEntityId)
  const municipalityFreeIncomeRanking = municipalityFreeIncomeRankingRows(index, year, selectedEntityId)
  const nationalDifference = Number.isFinite(perCapitaSummary?.taxBeforeNationalRatio)
    ? (perCapitaSummary.taxBeforeNationalRatio - 1) * 100
    : null
  const perCapitaComponents = new Map((perCapitaCalculation?.components ?? []).map((component) => [component.code, component.value]))
  const comparisonRows = incomeSystemComparisons?.values?.[year] ?? []
  const selectedExpenseEqualization = (mode === 'perCapita' ? perCapitaCalculation : amountCalculation)
    ?.components.find((component) => component.code === 'expense_equalization')?.value ?? null
  const incomeColumns = incomeSystemTableColumns(summary, comparisonRows, entityName, mode, selectedExpenseEqualization)
  const splitEqualization = incomeColumns.length > 0
    && incomeColumns.every((column) => Number.isFinite(column.expenseEqualization))
  const equalizationLabel = isContributor
    ? 'Trekk i inntektsutjevningen'
    : isRecipient ? 'Tillegg i inntektsutjevningen' : 'Inntektsutjevning'
  const taxAllocation = personalTaxAllocation(year, entityCode)

  return (
    <section className="ko-strommer" aria-labelledby="ko-strommer-tittel">
      <div className="ko-stromhode">
        <span className="ft-stikkord">Skatt, rammetilskudd og utjevning</span>
        <h2 id="ko-strommer-tittel">Skatt og rammetilskudd i {entityName}</h2>
        <p>Inntektsutjevningen er et tillegg eller trekk i rammetilskuddet, ikke en egen inntekt.</p>
      </div>
      <section className="ko-kommunestatistikk" aria-labelledby="ko-kommunestatistikk-tittel">
        <span className="ft-stikkord" id="ko-kommunestatistikk-tittel">Oppsummering · {year}</span>
        <div className="ko-kommunestatistikkgrid">
          <MunicipalityIncomeRankingDialog
            rows={municipalityRanking}
            selectedEntityId={selectedEntityId}
            selectedName={entityName}
            year={year}
          />
          <div>
            <span>Mot landsgjennomsnittet</span>
            <strong className="num">{signedPercent(nationalDifference)}</strong>
            <small>Skatt per innbygger før utjevning</small>
          </div>
          <MunicipalityFreeIncomeRankingDialog
            rows={municipalityFreeIncomeRanking}
            selectedEntityId={selectedEntityId}
            selectedName={entityName}
            year={year}
          />
          <MunicipalityEqualizationDialog
            rows={municipalityEqualization}
            selectedEntityId={selectedEntityId}
            selectedName={entityName}
            year={year}
          />
          <RobekStatusDialog municipalityCode={entityCode} municipalityName={entityName} />
        </div>
      </section>
      <article className="ko-inntektsregnestykke">
        <span className="ft-stikkord">Frie inntekter{mode === 'perCapita' && comparisonRows.length > 0 ? ' · sammenligning per innbygger' : ''}</span>
        <h3>Skatt og rammetilskudd</h3>
        <p>
          Rammetilskuddet vises før og etter utgifts- og inntektsutjevning. Kommunens skatteinntekter legges til nederst.
        </p>
        <div className="ko-rammetabellramme" tabIndex={incomeColumns.length > 1 ? '0' : undefined} aria-label={incomeColumns.length > 1 ? 'Rull sidelengs for å se hele sammenligningen på smale skjermer' : undefined}>
          <table className={`ko-stromtabell ko-regnestykke ko-inntektssystemtabell${incomeColumns.length > 1 ? ' ko-inntektssystemtabell--sammenligning' : ''}`}>
            <caption className="sr-only">Skatt, rammetilskudd, utgiftsutjevning og inntektsutjevning for {entityName} i {year}</caption>
            <thead><tr><th scope="col">Regnestykke</th>{incomeColumns.map((column) => (
              <th scope="col" key={column.id}>
                <span className="ko-sammenlignnavn">{column.label}{column.id.startsWith('peer_group:') && (
                  <KostraInfoTooltip label={column.label}>SSB grupperer kommuner med lignende folketall, økonomiske rammer og kostnadsforhold. Gruppen er et sammenligningsgrunnlag, ikke en egen kommune.</KostraInfoTooltip>
                )}</span>
                <small>{mode === 'perCapita' ? 'Per innbygger' : 'Beløp'}</small>
              </th>
            ))}</tr></thead>
            <tbody>
              <tr><th scope="row"><b className="ko-operator">&nbsp;</b><span>{splitEqualization ? 'Rammetilskudd før utjevning' : 'Rammetilskudd før inntektsutjevning'}</span><small>{splitEqualization ? 'Bokført rammetilskudd med inntekts- og utgiftsutjevning tatt ut.' : 'Bokført rammetilskudd med inntektsutjevningens tillegg eller trekk tatt ut.'}</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.before, mode)}</td>)}</tr>
              {splitEqualization && <tr><th scope="row"><b className="ko-operator">±</b><span>Utgiftsutjevning</span><small>Tillegg eller trekk ut fra beregnet utgiftsbehov per innbygger.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.expenseEqualization, mode)}</td>)}</tr>}
              <tr className="ko-stromtabell--utjevning"><th scope="row"><b className="ko-operator">±</b><span>Inntektsutjevning</span><small>Tillegg eller trekk ut fra skatt per innbygger sammenlignet med landet.</small></th>{incomeColumns.map((column) => <td className="num" key={column.id}>{formatKostraValue(column.incomeEqualization, mode)}</td>)}</tr>
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
          {taxAllocation && <div className="ko-personskatt" aria-label={`Kommunens andel av personskatten i ${taxAllocation.year}`}>
            <span className="ft-stikkord">Siste fullførte inntektsår · {taxAllocation.year}</span>
            <h4>Dette går til kommunen</h4>
            <div className="ko-personskattkort">
              <div>
                <span>Alminnelig inntekt</span>
                <strong className="num">{taxRateFormat.format(taxAllocation.municipalIncomeRate)} %</strong>
                <p>Av 100 kr i alminnelig inntekt etter fradrag går {taxRateFormat.format(taxAllocation.municipalIncomeRate)} kr i skatt til {entityName}. Dette er ikke brutto lønn.</p>
              </div>
              <div>
                <span>Skattepliktig nettoformue</span>
                <strong className="num">{taxRateFormat.format(taxAllocation.municipalWealthRate)} %</strong>
                <p>Av 100 kr over bunnfradraget på {populationFormat.format(taxAllocation.wealthAllowance)} kr går {taxRateFormat.format(taxAllocation.municipalWealthRate)} kr til {entityName}.{taxAllocation.reducedWealthRate ? ' Kommunen har vedtatt en lavere sats enn maksimum.' : ''}</p>
              </div>
            </div>
            <p className="ko-personskattnote">
              Trinnskatt og trygdeavgift går ikke til kommunen. Staten tar {taxRateFormat.format(taxAllocation.stateWealthRate)} % formuesskatt i det ordinære trinnet og {taxRateFormat.format(taxAllocation.stateWealthTopRate)} % av nettoformue over {populationFormat.format(taxAllocation.wealthTopThreshold)} kr.
              {' '}<a href={taxAllocation.sourceUrl} target="_blank" rel="noreferrer">Stortingets skattevedtak for {taxAllocation.year}</a>.
            </p>
          </div>}
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
          <IncomeEqualizationChart
            index={index}
            year={year}
            selectedEntityId={`municipality:${entityCode}`}
            selectedName={entityName}
          />
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
  const [drillMetric, setDrillMetric] = useState('expenses')
  const [drillMode, setDrillMode] = useState('amount')
  const [statementYear, setStatementYear] = useState(null)

  useEffect(() => {
    let active = true
    setDetail(null); setError(null); setServiceCode(null); setFunctionCode(null); setDrillMetric('expenses'); setStatementYear(null)
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
  const selectedService = drillMetric === 'revenues' ? null : detail?.services.find((item) => item.code === serviceCode)
  const functions = detail?.functions.filter((item) => !serviceCode || item.serviceCodes?.includes(serviceCode)) ?? []
  const selectedFunction = functions.find((item) => item.code === functionCode)
  const artBreakdown = drillMetric === 'expenses' && functionCode
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
  const compositionYear = statementYear ?? year
  const incomeComposition = incomeCompositionRows(detail, compositionYear)
  const expenseComposition = expenseCompositionRows(detail, compositionYear)
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

  const drillCategory = DRILL_CATEGORIES.find((item) => item.id === drillMetric)
  const drillPointMetric = drillMetric === 'investments' ? 'investments' : 'net_expenses'
  const revenueRows = drillMetric === 'revenues'
    ? explorerDrillRows(detail, year, { metricId: 'revenues' })
    : []
  const drillRows = drillMetric === 'revenues'
    ? [...revenueRows].sort((a, b) => Math.abs(b[drillMode] ?? 0) - Math.abs(a[drillMode] ?? 0))
    : drillMetric === 'investments' && selectedService
      ? [...functions].sort((a, b) => Math.abs(point(b, drillPointMetric, year)?.[drillMode] ?? 0) - Math.abs(point(a, drillPointMetric, year)?.[drillMode] ?? 0))
      : selectedFunction
      ? [...arts].sort((a, b) => (b[drillMode] ?? -Infinity) - (a[drillMode] ?? -Infinity))
      : selectedService
        ? [...functions].sort((a, b) => Math.abs(point(b, drillPointMetric, year)?.[drillMode] ?? 0) - Math.abs(point(a, drillPointMetric, year)?.[drillMode] ?? 0))
        : [...detail.services].sort((a, b) => Math.abs(point(b, drillPointMetric, year)?.[drillMode] ?? 0) - Math.abs(point(a, drillPointMetric, year)?.[drillMode] ?? 0))
  const maxArtValue = Math.max(1, ...arts.map((item) => Math.abs(item[drillMode] ?? 0)))
  const drillHistoryData = drillHistory(detail, index.years, serviceCode, functionCode, drillMode, drillMetric)
  const drillSeries = [{ navn: drillHistoryData.name, farge: RUST, bredde: 2.5, punkter: drillHistoryData.points }]
  const drillGrowth = yearlyGrowth(drillHistoryData.points, index.years, year)
  const drillPopulation = populationForEntity(index, year, entityId)
  const drillHeading = drillMetric === 'revenues'
    ? 'Fra total til inntektsart'
    : drillMetric === 'investments'
      ? 'Fra total til KOSTRA-funksjon'
      : 'Fra total til regnskapsart'
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

        <KostraStatements detail={detail} index={index} onYearChange={setStatementYear} />
        {false && <div className="ko-drill">
          <div className="ko-paneltopp">
            <div><span className="ft-stikkord">Økonomisk drill-down</span><h2>{drillHeading}</h2></div>
            <div className="ko-drillverktoy">
              <label className="ko-drillkategori">
                <span className="ft-stikkord">Vis</span>
                <select
                  className="ko-select"
                  value={drillMetric}
                  onChange={(event) => {
                    setDrillMetric(event.target.value)
                    setServiceCode(null)
                    setFunctionCode(null)
                  }}
                >
                  {DRILL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
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
                <button onClick={() => { setServiceCode(null); setFunctionCode(null) }}>{drillCategory?.label}</button>
                {selectedService && <><span>›</span><button onClick={() => setFunctionCode(null)}>{selectedService.name}</button></>}
                {selectedFunction && <><span>›</span><span>{selectedFunction.name}</span></>}
              </div>
              <div className={`ko-drillhode ${selectedFunction && drillMetric === 'expenses' ? 'ko-drillhode--arts' : ''}`}>
                <span>{drillMetric === 'revenues' ? 'Inntektsart' : selectedFunction && drillMetric === 'expenses' ? 'Regnskapsart' : selectedService ? 'KOSTRA-funksjon' : 'Tjenesteområde'}</span>
                {selectedFunction && drillMetric === 'expenses'
                  ? <><span>{drillMode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span>Andel</span></>
                  : <><span>{drillMode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span><span /></>}
              </div>
              <div className="ko-drillrader">
                {drillRows.map((row) => {
                  const isArt = drillMetric === 'revenues' || (selectedFunction && drillMetric === 'expenses')
                  const value = isArt ? row[drillMode] : point(row, drillPointMetric, year)?.[drillMode]
                  const clickable = drillMetric !== 'revenues' && (drillMetric === 'investments' || !selectedFunction)
                  const showsNext = clickable && !(drillMetric === 'investments' && selectedService)
                  return (
                    <button
                      key={row.code}
                      className={selectedFunction && drillMetric === 'expenses' ? 'ko-drillart' : ''}
                      disabled={!clickable}
                      aria-pressed={drillMetric === 'investments' && selectedService ? row.code === functionCode : undefined}
                      onClick={() => selectedService ? setFunctionCode(row.code) : setServiceCode(row.code)}
                    >
                      <span>
                        <span><small>{row.code}</small>{row.name}</span>
                        {selectedFunction && drillMetric === 'expenses' && <i style={{ width: `${Math.abs(row[drillMode] ?? 0) / maxArtValue * 100}%` }} />}
                      </span>
                      <strong className="num">{formatKostraValue(value, drillMode)}</strong>
                      {selectedFunction && drillMetric === 'expenses' && <em className="num">{Number.isFinite(row.share) ? `${populationFormat.format(row.share)} %` : '–'}</em>}
                      {showsNext && <b>›</b>}
                    </button>
                  )
                })}
              </div>
              {drillRows.length === 0 && drillMetric === 'revenues' && <p className="ko-artavstemming">SSB har ikke publisert en inntektsfordeling for dette året.</p>}
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
              {drillMetric === 'expenses' && arts.some((item) => (item.amount ?? 0) < 0) && (
                <p className="ko-artavstemming">Negative beløp er motposter og vises med fortegn; de er ikke fremstilt som ordinære kostnader.</p>
              )}
            </div>
            <aside className="ko-drillgraf" aria-live="polite" aria-atomic="true">
              <span className="ft-stikkord">Utvikling over tid</span>
              <h3>{drillHistoryData.name}</h3>
              <strong className="ko-drillgrafverdi num">{formatKostraValue(drillHistoryData.latestValue, drillMode)}</strong>
              <KostraGrowthSummary growth={drillGrowth} />
              {selectedFunction && drillMetric === 'expenses' && <p className="ko-drillgrafnote">Regnskapsartene viser {year}; grafen viser funksjonen over tid.</p>}
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
        </div>}

        {kind === 'municipality' && (
          <IncomeEqualization
            index={index}
            entityCode={code}
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
          <Breakdown title="Hva inntektene består av" rows={incomeComposition} />
          <Breakdown title="Hva utgiftene består av" rows={expenseComposition} />
        </div>
      </section>
    </>
  )
}
