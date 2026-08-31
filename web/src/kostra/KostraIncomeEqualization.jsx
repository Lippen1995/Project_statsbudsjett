import React, { useMemo, useState } from 'react'
import {
  displayEntityName,
  formatKostraValue,
  incomeEqualizationMapSummary,
  incomeEqualizationPoint,
} from './model'

const integerFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

function ratio(value) {
  return Number.isFinite(value) ? `${integerFormat.format(value * 100)} %` : '–'
}

function statusText(status) {
  if (status === 'recipient') return 'Mottar tillegg'
  if (status === 'contributor') return 'Får trekk'
  if (status === 'neutral') return 'Ingen netto utjevning'
  return 'Mangler publiserte data'
}

function pointValue(point, field, mode) {
  return point?.[field]?.[mode] ?? null
}

export default function KostraIncomeEqualization({
  index, shapes, entities, year, mode, hoverId, onHover, onOpen,
}) {
  const [sortKey, setSortKey] = useState('equalization')
  const [sortDirection, setSortDirection] = useState('desc')
  const rows = useMemo(() => shapes.map((shape) => ({
    shape,
    entity: entities.get(shape.id),
    point: incomeEqualizationPoint(index, year, shape.id),
  })), [entities, index, shapes, year])
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortKey === 'name') {
      const order = displayEntityName(a.entity).localeCompare(displayEntityName(b.entity), 'nb-NO')
      return sortDirection === 'desc' ? -order : order
    }
    const aValue = pointValue(a.point, sortKey, mode)
    const bValue = pointValue(b.point, sortKey, mode)
    if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0
    if (!Number.isFinite(aValue)) return 1
    if (!Number.isFinite(bValue)) return -1
    const order = aValue - bValue
    return sortDirection === 'desc' ? -order : order
  }), [mode, rows, sortDirection, sortKey])
  const summary = incomeEqualizationMapSummary(index, year, shapes.map((shape) => shape.id))
  const hovered = hoverId ? rows.find((row) => row.shape.id === hoverId) : null
  const sourceUrl = hovered?.point?.sourceUrl ?? rows.find((row) => row.point?.sourceUrl)?.point.sourceUrl

  const changeSort = (key, direction) => {
    if (direction) {
      setSortKey(key)
      setSortDirection(direction)
      return
    }
    setSortDirection((current) => sortKey === key && current === 'desc' ? 'asc' : 'desc')
    setSortKey(key)
  }
  const arrow = (key) => sortKey === key ? (sortDirection === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <section className="ft-seksjon ko-utforsk ko-utjevningsoversikt">
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <div className="ft-kicker">Kommunenes skatteinntekter</div>
          <h3>Netto inntektsutjevning for kommunene</h3>
          <p>
            Kommuner med høye skatteinntekter per innbygger får trekk, mens kommuner med lavere
            skatteinntekter får tillegg. Ordningen reduserer forskjellene, men utjevner dem ikke fullt ut.
          </p>
        </div>
      </div>

      <div className="ko-utjevningsforklaring">
        <div>
          <span className="ft-stikkord">Hvorfor utjevnes inntektene?</span>
          <p>
            Skattegrunnlaget varierer kraftig mellom kommunene. Inntektsutjevningen går gjennom
            rammetilskuddet og skal gi mer like økonomiske forutsetninger for et likeverdig tjenestetilbud.
            En symmetrisk del kompenserer eller trekker samme andel av avstanden til landsgjennomsnittet.
            Kommuner langt under gjennomsnittet kan få tilleggskompensasjon. Satser og terskler kan endres;
            tabellen bruker KDDs sluttavregning for valgt år.
          </p>
        </div>
        <div>
          <span className="ft-stikkord">Hva inngår?</span>
          <p>
            Her utjevnes inntekts- og formuesskatt fra personlige skattytere og naturressursskatt.
            Eiendomsskatt, gebyrer, øremerkede tilskudd, renter og utbytte er ikke med i beregningen.
          </p>
        </div>
        <div>
          <span className="ft-stikkord">Skatt, frie og samlede inntekter</span>
          <p>
            «Generelle inntekter» brukes ofte løst; det presise begrepet her er frie inntekter:
            skatteinntektene over pluss rammetilskudd. Samlede kommuneinntekter er videre.
            Utbytte fra selskaper kommunen eier er finansinntekt og kan styrke økonomien, men det
            gjør ikke kommunen til bidragsyter i inntektsutjevningen. Kartet kan derfor ikke alene
            brukes som mål på kommunens samlede økonomiske handlingsrom.
          </p>
        </div>
      </div>

      <div className="ko-utjevningsnokkeltall" aria-label={`Oppsummering av inntektsutjevningen i ${year}`}>
        <div><span>Mottar tillegg</span><strong>{summary.recipients} kommuner</strong><small>{formatKostraValue(summary.receivedAmount, 'amount')}</small></div>
        <div><span>Får trekk</span><strong>{summary.contributors} kommuner</strong><small>{formatKostraValue(summary.contributedAmount, 'amount')}</small></div>
        <div><span>Datadekning</span><strong>{summary.availableEntities} av {summary.entities}</strong><small>{summary.population == null ? '–' : `${integerFormat.format(summary.population)} innbyggere`}</small></div>
      </div>

      <div className="ko-utjevningssortering">
        <span className="ft-stikkord">Ranger</span>
        <button type="button" className={sortKey === 'equalization' && sortDirection === 'desc' ? 'aktiv' : ''} onClick={() => changeSort('equalization', 'desc')}>Mottar mest</button>
        <button type="button" className={sortKey === 'equalization' && sortDirection === 'asc' ? 'aktiv' : ''} onClick={() => changeSort('equalization', 'asc')}>Bidrar mest</button>
      </div>

      <div className="ko-utjevningstabellramme" tabIndex={0} aria-label="Sorterbar tabell over kommunenes inntektsutjevning">
        <table className="ko-utjevningstabell">
          <thead>
            <tr>
              <th scope="col"><button type="button" onClick={() => changeSort('name')}>Kommune{arrow('name')}</button></th>
              <th scope="col"><button type="button" onClick={() => changeSort('taxBefore')}>Skatt før{arrow('taxBefore')}</button></th>
              <th scope="col"><button type="button" onClick={() => changeSort('equalization')}>Netto utjevning{arrow('equalization')}</button></th>
              <th scope="col"><button type="button" onClick={() => changeSort('taxAfter')}>Skatt etter{arrow('taxAfter')}</button></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.shape.id}
                className={hoverId === row.shape.id ? 'fokus' : ''}
                onMouseEnter={() => onHover(row.shape.id)}
                onMouseLeave={() => onHover(null)}
              >
                <th scope="row">
                  <button type="button" onFocus={() => onHover(row.shape.id)} onBlur={() => onHover(null)} onClick={() => onOpen(row.shape)}>
                    <span>{displayEntityName(row.entity)}</span><small>{statusText(row.point?.status)} · åpne kommunen</small>
                  </button>
                </th>
                <td><strong>{formatKostraValue(pointValue(row.point, 'taxBefore', mode), mode)}</strong><small>{ratio(row.point?.taxBefore?.nationalRatio)} av landet</small></td>
                <td className={`ko-utjevningverdi ko-utjevningverdi--${row.point?.status ?? 'missing'}`}><strong>{formatKostraValue(pointValue(row.point, 'equalization', mode), mode)}</strong><small>{statusText(row.point?.status)}</small></td>
                <td><strong>{formatKostraValue(pointValue(row.point, 'taxAfter', mode), mode)}</strong><small>{ratio(row.point?.taxAfter?.nationalRatio)} av landet</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!summary.complete && <p className="ko-datadekning">{summary.availableEntities} av {summary.entities} kommuner har publiserte tall for {year}.</p>}
      <p className="ko-utjevningsnote">
        Beløpene viser den signerte nettoutjevningen: positivt er tillegg og negativt er trekk.
        Små avvik mellom samlet tillegg og trekk kan skyldes avrunding i kilden.
        {' '}<a href="https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/inntektssystemet-for-kommuner-og-fylkeskommuner/id2353961/">Les KDDs forklaring av inntektssystemet</a>.
        {sourceUrl && <> Tallgrunnlag: <a href={sourceUrl}>årets sluttavregning</a>.</>}
      </p>
    </section>
  )
}
