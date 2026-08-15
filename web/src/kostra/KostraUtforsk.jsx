import React, { useEffect, useMemo, useRef, useState } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { loadKostraDetail } from '../lib/kostra'
import { sortExplorerRows } from './explorer'
import { formatKostraValue, summarizeKostraEntities, summarizeMunicipalities } from './model'
import KostraInlineUtforsk from './KostraInlineUtforsk'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

function countyAreaName(entity) {
  return entity?.name
    .replace(/ fylkeskommune$/, '')
    .replace(/^Oslo kommune.*$/, 'Oslo')
}

export default function KostraUtforsk({
  index, shapes, entities, metric, metricId, year, mode, hoverId, level, scopeName, onHover,
}) {
  const [sortKey, setSortKey] = useState('perCapita')
  const [sortDirection, setSortDirection] = useState('desc')
  const [accountScope, setAccountScope] = useState('county')
  const [municipalityCountyId, setMunicipalityCountyId] = useState(null)
  const [drillEntityId, setDrillEntityId] = useState(null)
  const [detailState, setDetailState] = useState({ loading: false, detail: null, error: null })
  const sectionRef = useRef(null)
  const statusRef = useRef(null)
  const groupHeadingRef = useRef(null)
  const returnFocusId = useRef(null)
  const enteringGroup = useRef(false)
  const allIds = useMemo(() => shapes.map((shape) => shape.id), [shapes])
  const selectedIds = hoverId ? [hoverId] : allIds
  const scopeSummary = summarizeKostraEntities(index, metricId, year, allIds)
  const summary = summarizeKostraEntities(index, metricId, year, selectedIds)
  const selectedEntity = hoverId ? entities.get(hoverId) : null
  const title = selectedEntity?.name ?? scopeName
  const municipalityScopeAvailable = level === 'county' && metric.category === 'finance'
  const effectiveAccountScope = municipalityScopeAvailable ? accountScope : 'county'
  const effectiveMunicipalityCountyId = municipalityScopeAvailable ? municipalityCountyId : null
  const groupedMunicipalities = effectiveMunicipalityCountyId
    ? [...entities.values()].filter((entity) => entity.kind === 'municipality' && entity.parent_id === effectiveMunicipalityCountyId)
    : null
  const tableShapes = groupedMunicipalities
    ? groupedMunicipalities.map((entity) => ({ id: entity.id, code: entity.code, name: entity.name }))
    : shapes
  const unsortedRows = tableShapes
    .map((shape) => ({
      shape,
      entity: entities.get(shape.id),
      summary: effectiveAccountScope === 'municipalities' && level === 'county' && !effectiveMunicipalityCountyId
        ? summarizeMunicipalities(index, metricId, year, [shape.id])
        : summarizeKostraEntities(index, metricId, year, [shape.id]),
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
  const tableSummary = effectiveMunicipalityCountyId
    ? summarizeKostraEntities(index, metricId, year, groupedMunicipalities.map((entity) => entity.id))
    : effectiveAccountScope === 'municipalities' && level === 'county'
      ? summarizeMunicipalities(index, metricId, year, shapes.map((shape) => shape.id))
      : scopeSummary
  const municipalityView = effectiveAccountScope === 'municipalities' && level === 'county'
  const activeCounty = effectiveMunicipalityCountyId
    ? entities.get(effectiveMunicipalityCountyId)
    : hoverId && level === 'county'
      ? entities.get(hoverId)
      : null
  const explorerCountyIds = effectiveMunicipalityCountyId
    ? [effectiveMunicipalityCountyId]
    : hoverId && level === 'county'
      ? [hoverId]
      : shapes.map((shape) => shape.id)
  const explorerSummary = municipalityView
    ? summarizeMunicipalities(index, metricId, year, explorerCountyIds)
    : summary
  const explorerTitle = municipalityView
    ? activeCounty ? `Kommunene i ${countyAreaName(activeCounty)}` : 'Sum av alle kommuner'
    : title
  const history = [{
    navn: explorerTitle,
    farge: RUST,
    bredde: 2.5,
    punkter: index.years.map((itemYear) => ({
      v: municipalityView
        ? summarizeMunicipalities(index, metricId, itemYear, explorerCountyIds)[mode]
        : summarizeKostraEntities(index, metricId, itemYear, selectedIds)[mode],
    })),
  }]
  const drillEntity = drillEntityId ? entities.get(drillEntityId) : null
  const scopeKey = `${level}:${scopeName}`

  useEffect(() => {
    returnFocusId.current = null
    enteringGroup.current = false
    setAccountScope('county')
    setMunicipalityCountyId(null)
    setDrillEntityId(null)
    setDetailState({ loading: false, detail: null, error: null })
  }, [scopeKey])

  useEffect(() => {
    if (!municipalityScopeAvailable && accountScope === 'municipalities') {
      returnFocusId.current = null
      enteringGroup.current = false
      setAccountScope('county')
      setMunicipalityCountyId(null)
    }
  }, [accountScope, municipalityScopeAvailable])

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
      if (enteringGroup.current && effectiveMunicipalityCountyId) {
        enteringGroup.current = false
        returnFocusId.current = null
        groupHeadingRef.current?.focus()
        return
      }
      const entityId = returnFocusId.current
      returnFocusId.current = null
      requestAnimationFrame(() => {
        sectionRef.current?.querySelector(`[data-entity-id="${entityId}"]`)?.focus()
      })
    }
  }, [drillEntityId, detailState.detail, effectiveMunicipalityCountyId])

  const startDrill = (row) => {
    onHover(null)
    returnFocusId.current = row.entity?.id ?? row.shape.id
    setDetailState({ loading: true, detail: null, error: null })
    setDrillEntityId(row.entity?.id ?? row.shape.id)
  }
  const openTableRow = (row) => {
    if (effectiveAccountScope === 'municipalities' && level === 'county' && !effectiveMunicipalityCountyId) {
      onHover(null)
      returnFocusId.current = row.shape.id
      enteringGroup.current = true
      setMunicipalityCountyId(row.shape.id)
      return
    }
    startDrill(row)
  }
  const exitMunicipalityGroup = () => {
    returnFocusId.current = effectiveMunicipalityCountyId
    setMunicipalityCountyId(null)
  }
  const changeAccountScope = (nextScope) => {
    setAccountScope(nextScope)
    setMunicipalityCountyId(null)
  }
  const changeSort = (key) => {
    setSortDirection((current) => sortKey === key && current === 'desc' ? 'asc' : 'desc')
    setSortKey(key)
  }
  const sortArrow = (key) => sortKey === key ? (sortDirection === 'desc' ? ' ↓' : ' ↑') : ''
  const selectedCounty = effectiveMunicipalityCountyId ? entities.get(effectiveMunicipalityCountyId) : null
  const selectedCountyAreaName = countyAreaName(selectedCounty)
  const inlineScopeName = selectedCounty ? `${selectedCountyAreaName} · kommuner` : scopeName
  const rowBadge = effectiveMunicipalityCountyId || level === 'municipality'
    ? 'Kommune'
    : effectiveAccountScope === 'municipalities'
      ? 'Sum kommuner'
      : 'Fylkeskommune'
  const tableMeta = effectiveMunicipalityCountyId
    ? `${rows.length} kommuner i fylket`
    : effectiveAccountScope === 'municipalities' && level === 'county'
      ? `${tableSummary.entities} kommuner gruppert i ${rows.length} fylker`
      : `${rows.length} ${level === 'county' ? 'fylkeskommuner' : 'kommuner'}`

  return (
    <section className="ft-seksjon ko-utforsk" ref={sectionRef}>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h3>Utforsk kommuner og fylker</h3>
          <p>
            Skill mellom fylkeskommunenes egne regnskaper og kommunene summert per fylke.
            Klikk på et område for å utforske regnskapet videre her, uten å bytte side.
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
            scopeName={inlineScopeName}
            onExit={() => setDrillEntityId(null)}
          />
        ) : (
          <div className="ko-inline-status" role="status" tabIndex={-1} ref={statusRef}>
            {detailState.loading ? 'Laster regnskapet…' : detailState.error}
            {!detailState.loading && <button type="button" onClick={() => setDrillEntityId(null)}>Tilbake til listen</button>}
          </div>
        )
      ) : <>
        {level === 'county' && !effectiveMunicipalityCountyId && (
          <div className="ko-regnskapsvelger">
            <span className="ft-stikkord">Vis i tabellen</span>
            <div className="ft-bytter" aria-label="Velg regnskapsgrunnlag">
              <button
                type="button"
                className={`ft-bytte ${effectiveAccountScope === 'county' ? 'aktiv' : ''}`}
                aria-pressed={effectiveAccountScope === 'county'}
                onClick={() => changeAccountScope('county')}
              >Fylkeskommunen</button>
              <button
                type="button"
                className={`ft-bytte ${effectiveAccountScope === 'municipalities' ? 'aktiv' : ''}`}
                aria-pressed={effectiveAccountScope === 'municipalities'}
                disabled={!municipalityScopeAvailable}
                title={municipalityScopeAvailable ? undefined : 'Kommunesum finnes ikke for fylkeskommunale tjenesteområder'}
                onClick={() => changeAccountScope('municipalities')}
              >Sum kommuner</button>
            </div>
            {!municipalityScopeAvailable && <small>Kommunesum kan velges for økonomiske nøkkeltall.</small>}
          </div>
        )}
        <div className="ft-utforsk-grid">
        <div>
          {selectedCounty && (
            <nav className="ko-inline-smuler" aria-label="Utforskersti">
              <button type="button" onClick={exitMunicipalityGroup}>Sum kommuner</button><span>›</span>
              <span tabIndex={-1} ref={groupHeadingRef}>Kommunene i {selectedCountyAreaName}</span>
            </nav>
          )}
          <div className="ft-nivaatopp">
            <span className="ft-nivaasum num">
              {formatKostraValue(tableSummary[mode], mode)}
            </span>
            <span className="ft-nivaamerke">
              {tableMeta} · {metric.label.toLowerCase()} {year}
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
                className={`ft-utforskrad ${!effectiveMunicipalityCountyId && hoverId === row.shape.id ? 'fokus' : ''}`}
                key={row.shape.id}
                data-entity-id={row.entity?.id ?? row.shape.id}
                onMouseEnter={() => { if (!effectiveMunicipalityCountyId) onHover(row.shape.id) }}
                onMouseLeave={() => { if (!effectiveMunicipalityCountyId) onHover(null) }}
                onFocus={() => { if (!effectiveMunicipalityCountyId) onHover(row.shape.id) }}
                onBlur={() => { if (!effectiveMunicipalityCountyId) onHover(null) }}
                onClick={() => openTableRow(row)}
              >
                <span className="ft-utforskmidt">
                  <span className="ft-utforsktittel">
                    <span className="ft-utforsknavn">
                      {effectiveAccountScope === 'municipalities' && level === 'county' && !effectiveMunicipalityCountyId
                        ? countyAreaName(row.entity)
                        : row.entity?.name ?? row.shape.name}
                    </span>
                    <span className="ft-merke">{rowBadge}</span>
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
            <div className="ft-stikkord">{municipalityView ? 'Kommuneregnskap' : hoverId ? (level === 'county' ? 'Fylkeskommune' : 'Kommune') : 'Sum av kartet'}</div>
            <div className="ft-graftittel">{explorerTitle}</div>
            <div className="ko-oppsummeringstall num">{formatKostraValue(explorerSummary[mode], mode)}</div>
            <div className="ko-innbyggere">
              <span>Innbyggere</span>
              <strong className="num">
                {explorerSummary.population == null ? '–' : `ca. ${populationFormat.format(explorerSummary.population)}`}
              </strong>
            </div>
            {!explorerSummary.complete && (
              <p className="ko-datadekning">
                {explorerSummary.availableEntities} av {explorerSummary.entities} områder har data. Full sum kan ikke beregnes.
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
                beskrivelse={`${metric.label} for ${explorerTitle}, ${index.years[0]}–${index.latestYear}`}
              />
            </div>
          </div>
        </aside>
      </div></>}
    </section>
  )
}
