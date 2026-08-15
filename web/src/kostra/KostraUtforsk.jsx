import React, { useEffect, useMemo, useRef, useState } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { loadKostraDetail } from '../lib/kostra'
import { sortExplorerRows } from './explorer'
import { formatKostraValue, summarizeKostraEntities } from './model'
import KostraInlineUtforsk from './KostraInlineUtforsk'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

export default function KostraUtforsk({
  index, shapes, entities, metric, metricId, year, mode, hoverId, level, scopeName, onHover,
}) {
  const [sortKey, setSortKey] = useState('perCapita')
  const [sortDirection, setSortDirection] = useState('desc')
  const [drillEntityId, setDrillEntityId] = useState(null)
  const [detailState, setDetailState] = useState({ loading: false, detail: null, error: null })
  const sectionRef = useRef(null)
  const statusRef = useRef(null)
  const returnFocusId = useRef(null)
  const allIds = useMemo(() => shapes.map((shape) => shape.id), [shapes])
  const selectedIds = hoverId ? [hoverId] : allIds
  const scopeSummary = summarizeKostraEntities(index, metricId, year, allIds)
  const summary = summarizeKostraEntities(index, metricId, year, selectedIds)
  const selectedEntity = hoverId ? entities.get(hoverId) : null
  const title = selectedEntity?.name ?? scopeName
  const unsortedRows = shapes
    .map((shape) => ({
      shape,
      entity: entities.get(shape.id),
      summary: summarizeKostraEntities(index, metricId, year, [shape.id]),
    }))
  const shareTotal = unsortedRows.reduce((sum, row) => sum + Math.abs(row.summary.amount ?? 0), 0)
  const rows = sortExplorerRows(unsortedRows.map((row) => ({
    ...row,
    perCapita: row.summary.perCapita,
    share: Number.isFinite(row.summary.amount) && shareTotal
      ? Math.abs(row.summary.amount) / shareTotal * 100
      : null,
  })), sortKey, sortDirection)
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.perCapita ?? 0)))
  const signedValues = rows.some((row) => (row.summary.amount ?? 0) < 0)
  const history = [{
    navn: title,
    farge: RUST,
    bredde: 2.5,
    punkter: index.years.map((itemYear) => ({
      v: summarizeKostraEntities(index, metricId, itemYear, selectedIds)[mode],
    })),
  }]
  const drillEntity = drillEntityId ? entities.get(drillEntityId) : null
  const scopeKey = `${level}:${scopeName}`

  useEffect(() => {
    returnFocusId.current = null
    setDrillEntityId(null)
    setDetailState({ loading: false, detail: null, error: null })
  }, [scopeKey])

  useEffect(() => {
    if (!drillEntity) return undefined
    let active = true
    setDetailState({ loading: true, detail: null, error: null })
    loadKostraDetail(drillEntity.kind, drillEntity.code)
      .then((detail) => {
        if (!active) return
        setDetailState(detail
          ? { loading: false, detail, error: null }
          : { loading: false, detail: null, error: 'Detaljdata er ikke tilgjengelig.' })
      })
      .catch((error) => {
        if (active) setDetailState({ loading: false, detail: null, error: error.message })
      })
    return () => { active = false }
  }, [drillEntity])

  useEffect(() => {
    if (drillEntityId && !detailState.detail) {
      statusRef.current?.focus()
      return
    }
    if (!drillEntityId && returnFocusId.current) {
      const entityId = returnFocusId.current
      requestAnimationFrame(() => {
        sectionRef.current?.querySelector(`[data-entity-id="${entityId}"]`)?.focus()
      })
    }
  }, [drillEntityId, detailState.detail])

  const startDrill = (row) => {
    onHover(null)
    returnFocusId.current = row.entity?.id ?? row.shape.id
    setDetailState({ loading: true, detail: null, error: null })
    setDrillEntityId(row.entity?.id ?? row.shape.id)
  }
  const changeSort = (key) => {
    setSortDirection((current) => sortKey === key && current === 'desc' ? 'asc' : 'desc')
    setSortKey(key)
  }
  const sortArrow = (key) => sortKey === key ? (sortDirection === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <section className="ft-seksjon ko-utforsk" ref={sectionRef}>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h3>Utforsk kommuner og fylker</h3>
          <p>
            Samme valg som i kartet, rangert som en liste. Klikk på et område for å utforske
            regnskapet videre her, uten å bytte side.
          </p>
        </div>
      </div>

      {drillEntity ? (
        detailState.detail ? (
          <KostraInlineUtforsk
            key={drillEntity.id}
            index={index}
            detail={detailState.detail}
            entity={drillEntity}
            year={year}
            scopeName={scopeName}
            onExit={() => setDrillEntityId(null)}
          />
        ) : (
          <div className="ko-inline-status" role="status" tabIndex={-1} ref={statusRef}>
            {detailState.loading ? 'Laster regnskapet…' : detailState.error}
            {!detailState.loading && <button type="button" onClick={() => setDrillEntityId(null)}>Tilbake til listen</button>}
          </div>
        )
      ) : <div className="ft-utforsk-grid">
        <div>
          <div className="ft-nivaatopp">
            <span className="ft-nivaasum num">{formatKostraValue(scopeSummary[mode], mode)}</span>
            <span className="ft-nivaamerke">
              {rows.length} {level === 'county' ? 'fylker' : 'kommuner'} · {metric.label.toLowerCase()} {year}
            </span>
          </div>
          <div className="ft-tabellhode ko-tabellhode">
            <span />
            <button
              type="button"
              className={sortKey === 'perCapita' ? 'aktiv' : ''}
              aria-pressed={sortKey === 'perCapita'}
              onClick={() => changeSort('perCapita')}
            >Per innb.{sortArrow('perCapita')}</button>
            <button
              type="button"
              className={sortKey === 'share' ? 'aktiv' : ''}
              aria-pressed={sortKey === 'share'}
              onClick={() => changeSort('share')}
            >{signedValues ? 'Andel av utslag' : 'Andel'}{sortArrow('share')}</button>
            <span />
          </div>
          {rows.map((row) => {
            return (
              <button
                type="button"
                className={`ft-utforskrad ${hoverId === row.shape.id ? 'fokus' : ''}`}
                key={row.shape.id}
                data-entity-id={row.entity?.id ?? row.shape.id}
                onMouseEnter={() => onHover(row.shape.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(row.shape.id)}
                onBlur={() => onHover(null)}
                onClick={() => startDrill(row)}
              >
                <span className="ft-utforskmidt">
                  <span className="ft-utforsktittel">
                    <span className="ft-utforsknavn">{row.entity?.name ?? row.shape.name}</span>
                    <span className="ft-merke">{level === 'county' ? 'Fylke' : 'Kommune'}</span>
                  </span>
                  <span className="ft-bar ft-bar--tynn">
                    <span className="ft-bar-fyll" style={{ width: `${Math.abs(row.perCapita ?? 0) / max * 100}%` }} />
                  </span>
                </span>
                <span className="num ft-utforskbelop">{formatKostraValue(row.perCapita, 'perCapita')}</span>
                <span
                  className="num ft-utforskandel"
                  title={signedValues ? 'Andel av summen av absolutte utslag' : undefined}
                >
                  {Number.isFinite(row.share) ? `${populationFormat.format(row.share)} %` : '–'}
                </span>
                <span className="ft-utforskpil">›</span>
              </button>
            )
          })}
        </div>

        <aside className="ft-utforsk-side ko-utforsk-side" aria-live="polite" aria-atomic="true">
          <div className="ko-oppsummering">
            <div className="ft-stikkord">{hoverId ? (level === 'county' ? 'Fylke' : 'Kommune') : 'Sum av kartet'}</div>
            <div className="ft-graftittel">{title}</div>
            <div className="ko-oppsummeringstall num">{formatKostraValue(summary[mode], mode)}</div>
            <div className="ko-innbyggere">
              <span>Innbyggere</span>
              <strong className="num">
                {summary.population == null ? '–' : `ca. ${populationFormat.format(summary.population)}`}
              </strong>
            </div>
            {!summary.complete && (
              <p className="ko-datadekning">
                {summary.availableEntities} av {summary.entities} områder har data. Full sum kan ikke beregnes.
              </p>
            )}
          </div>
          <div className="ft-arealblokk">
            <div className="ft-stikkord">Utvikling over tid</div>
            <div className="ft-kort-graf">
              <LinjeGraf
                serier={history}
                aar={index.years}
                W={356}
                H={160}
                fraNull={metricId !== 'net_result'}
                aksefmt={(value) => formatKostraValue(value, mode)}
                beskrivelse={`${metric.label} for ${title}, ${index.years[0]}–${index.latestYear}`}
              />
            </div>
          </div>
        </aside>
      </div>}
    </section>
  )
}
