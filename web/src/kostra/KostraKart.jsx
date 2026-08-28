import React, { useEffect, useId, useMemo, useState } from 'react'
import {
  choroplethColor,
  countyGroupName,
  displayEntityName,
  findKostraEntities,
  formatKostraValue,
  mapValue,
  municipalityOverviewRows,
  overviewComparisonRows,
  summarizeKostraEntities,
  summarizeMunicipalities,
} from './model'
import KostraDetalj from './KostraDetalj'
import KostraUtforsk from './KostraUtforsk'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

function municipalityEntityTitle(entity) {
  const name = displayEntityName(entity).replace(/\s+kommune$/i, '')
  return name ? `${name} kommune` : ''
}

function focusedViewBox(shapes, fallback) {
  if (!shapes.length) return fallback
  const numbers = shapes.flatMap((shape) => (shape.path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))
  const xs = numbers.filter((_, i) => i % 2 === 0)
  const ys = numbers.filter((_, i) => i % 2 === 1)
  if (!xs.length) return fallback
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = Math.max(8, Math.max(maxX - minX, maxY - minY) * 0.08)
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
}

function InfoTooltip({ label, children }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="ko-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Forklaring av ${label}`}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
          }
        }}
      >i</button>
      <span id={id} role="tooltip" className={`ko-tooltip ${open ? 'apen' : ''}`}>{children}</span>
    </span>
  )
}

export default function KostraKart({
  index, boundaries, countyCode, selectedMunicipalityCode, embedded = false,
}) {
  const [metricId, setMetricId] = useState('expenses')
  const [year, setYear] = useState(index.latestYear)
  const [mode, setMode] = useState('perCapita')
  const [hoverId, setHoverId] = useState(null)
  const [search, setSearch] = useState('')
  const [nationalLevel, setNationalLevel] = useState('county')
  const [keyboardId, setKeyboardId] = useState(null)
  const searchInputId = useId()
  const level = countyCode ? 'municipality' : nationalLevel
  const countyId = countyCode ? `county:${countyCode}` : null
  const selectedMunicipalityId = selectedMunicipalityCode ? `municipality:${selectedMunicipalityCode}` : null
  const entities = useMemo(() => new Map(index.entities.map((entity) => [entity.id, entity])), [index])
  const shapes = useMemo(() => Object.values(boundaries[level] ?? {}).filter(
    (shape) => !countyId || shape.parentId === countyId
  ), [boundaries, level, countyId])
  const metrics = index.metrics.filter((metric) => {
    if (metric.category !== 'service') return true
    return level === 'municipality' ? metric.functionCode?.startsWith('FGK') : metric.functionCode?.startsWith('FGF')
  })

  useEffect(() => {
    if (!metrics.some((metric) => metric.id === metricId)) setMetricId('expenses')
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHoverId(null)
    setSearch('')
    setNationalLevel('county')
  }, [countyId])

  const values = shapes.map((shape) => mapValue(index, metricId, year, shape.id, mode)).filter(Number.isFinite)
  const hovered = hoverId ? entities.get(hoverId) : null
  const selectedMunicipality = selectedMunicipalityId ? entities.get(selectedMunicipalityId) : null
  const focusedEntity = hovered ?? selectedMunicipality
  const county = countyId ? entities.get(countyId) : null
  const selectedShape = selectedMunicipalityId
    ? shapes.find((shape) => shape.id === selectedMunicipalityId)
    : null
  const mainShapes = selectedShape ? [selectedShape] : shapes
  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0]
  const summaryIds = focusedEntity ? [focusedEntity.id] : shapes.map((shape) => shape.id)
  const summary = summarizeKostraEntities(index, metricId, year, summaryIds)
  const municipalitySummary = level === 'county' && metric.category === 'finance'
    ? summarizeMunicipalities(index, metricId, year, summaryIds)
    : null
  const summaryName = displayEntityName(focusedEntity) || displayEntityName(county) || (level === 'county' ? 'Alle fylkeskommuner' : 'Alle kommuner')
  const countyViewBox = level === 'municipality' ? focusedViewBox(shapes, boundaries.viewBox) : boundaries.viewBox
  const viewBox = selectedShape ? focusedViewBox([selectedShape], countyViewBox) : countyViewBox
  const hits = findKostraEntities(index.entities, search)
  const municipalityCount = Object.keys(boundaries.municipality ?? {}).length
  const countyCount = Object.keys(boundaries.county ?? {}).length
  const topCountyIds = hoverId && level === 'county'
    ? [hoverId]
    : Object.keys(boundaries.county ?? {})
  const overviewRows = level === 'county' && !countyCode
    ? overviewComparisonRows(index, year, topCountyIds)
    : []
  const municipalityRows = level === 'municipality' && focusedEntity?.kind === 'municipality'
    ? municipalityOverviewRows(index, year, focusedEntity.id)
    : []
  const overviewName = hovered ? countyGroupName(hovered) : 'Hele Norge'
  const overviewPopulation = overviewRows[0]?.county.population ?? null
  const overviewHasMissingValues = overviewRows.some((row) => row.county[mode] == null || row.municipalities[mode] == null)
  const municipalityOverviewPopulation = municipalityRows[0]?.summary.population ?? null
  const municipalityOverviewHasMissingValues = municipalityRows.some((row) => row.summary[mode] == null)
  const sorted = [...values].sort((a, b) => a - b)
  const legend = sorted.length ? [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.at(-1)] : []
  const Heading = embedded ? 'h2' : 'h1'
  const activeKeyboardId = mainShapes.some((shape) => shape.id === keyboardId) ? keyboardId : mainShapes[0]?.id
  const municipalityTitle = selectedMunicipality ? municipalityEntityTitle(selectedMunicipality) : null

  const open = (shape) => {
    window.location.hash = shape.id.startsWith('county:')
      ? `kostra/fylke/${shape.id.split(':')[1]}`
      : `kostra/kommune/${shape.code}`
  }

  return (
    <>
      <header className={`ko-hero ${embedded ? 'ko-hero--integrert' : ''}`}>
        <div className="ft-kicker">KOSTRA · Kommune- og fylkesregnskap · {index.years[0]}–{index.latestYear}</div>
        <Heading>{municipalityTitle || (county ? `${displayEntityName(county)}, kommune for kommune` : 'Slik bruker kommunene pengene')}</Heading>
        <p className="ft-ingress">
          Velg et nøkkeltall og klikk deg fra Norge til fylke og kommune. Alle tall er hentet fra SSB,
          normalisert lokalt og sammenlignbare med landet og KOSTRA-gruppen.
        </p>
        <div className="ko-smuler" aria-label="Brødsmuler">
          <a href="#kostra">Norge</a>
          {county && <><span>›</span>{selectedMunicipality
            ? <a href={`#kostra/fylke/${countyCode}`}>{displayEntityName(county)}</a>
            : <span aria-current="page">{displayEntityName(county)}</span>}</>}
          {selectedMunicipality && <><span>›</span><span aria-current="page">{municipalityTitle}</span></>}
        </div>
      </header>

      <section className="ft-seksjon ko-kartseksjon">
        <div className="ko-verktoy">
          <label>
            <span className="ft-stikkord">Sorter etter</span>
            <select className="ko-select" value={metricId} onChange={(event) => setMetricId(event.target.value)}>
              <optgroup label="Økonomi">
                {metrics.filter((item) => item.category === 'finance').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
              <optgroup label="Tjenesteområder">
                {metrics.filter((item) => item.category === 'service').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
            </select>
          </label>
          <label>
            <span className="ft-stikkord">År</span>
            <select className="ko-select" value={year} onChange={(event) => setYear(+event.target.value)}>
              {index.years.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div>
            <span className="ft-stikkord">Vis som</span>
            <div className="ft-bytter">
              <button className={`ft-bytte ${mode === 'perCapita' ? 'aktiv' : ''}`} onClick={() => setMode('perCapita')}>Per innbygger</button>
              <button className={`ft-bytte ${mode === 'amount' ? 'aktiv' : ''}`} onClick={() => setMode('amount')}>Totalt</button>
            </div>
          </div>
          <div className="ko-sokfelt">
            <label className="ft-stikkord" htmlFor={searchInputId}>Finn fylke eller kommune</label>
            <input id={searchInputId} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk etter navn" />
            {hits.length > 0 && (
              <div className="ko-soktreff">
                {hits.map((entity) => (
                  <a key={entity.id} href={entity.kind === 'county' ? `#kostra/fylke/${entity.id.split(':')[1]}` : `#kostra/kommune/${entity.code}`}>
                    <span>{displayEntityName(entity)}</span>
                    <small>{entity.kind === 'county' ? 'Fylke' : 'Kommune'}</small>
                  </a>
                ))}
              </div>
            )}
          </div>
          {!countyCode && (
            <button
              type="button"
              className="ko-kartnivaa"
              onClick={() => {
                setHoverId(null)
                setNationalLevel((current) => current === 'county' ? 'municipality' : 'county')
              }}
            >{level === 'county' ? `Vis alle ${municipalityCount} kommuner` : `Vis ${countyCount} fylker`}</button>
          )}
        </div>

        <div
          className="ko-kartgrid"
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setHoverId(null)
          }}
        >
          <div className="ko-kartflate">
            {selectedMunicipality && (
              <a
                className="ko-fylkeinnfelt"
                href={`#kostra/fylke/${countyCode}`}
                aria-label={`Tilbake til kommuneoversikten i ${displayEntityName(county)}`}
              >
                <svg viewBox={countyViewBox} role="img" aria-label={`${municipalityTitle} markert i ${displayEntityName(county)}`}>
                  <g fillRule="evenodd">
                    {shapes.map((shape) => (
                      <path
                        key={shape.id}
                        d={shape.path}
                        fill={choroplethColor(mapValue(index, metricId, year, shape.id, mode), values)}
                        className={shape.id === selectedMunicipalityId ? 'valgt' : ''}
                      />
                    ))}
                  </g>
                </svg>
              </a>
            )}
            <svg className="ko-hovedkart" viewBox={viewBox} role="img" aria-label={`${metric.label} i ${year}, ${county?.name ?? 'Norge'}`}>
              <g fillRule="evenodd">
                {mainShapes.map((shape, shapeIndex) => {
                  const value = mapValue(index, metricId, year, shape.id, mode)
                  return (
                    <path
                      key={shape.id}
                      d={shape.path}
                      fill={choroplethColor(value, values)}
                      className={[hoverId === shape.id ? 'aktiv' : '', selectedMunicipalityId === shape.id ? 'valgt' : ''].filter(Boolean).join(' ')}
                      data-shape-index={shapeIndex}
                      tabIndex={activeKeyboardId === shape.id ? 0 : -1}
                      role="button"
                      aria-label={`${displayEntityName(entities.get(shape.id)) || shape.name}: ${formatKostraValue(value, mode)}`}
                      onMouseEnter={() => setHoverId(shape.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => {
                        setKeyboardId(shape.id)
                        setHoverId(shape.id)
                      }}
                      onClick={() => open(shape)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          open(shape)
                          return
                        }
                        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
                          ? 1
                          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                            ? -1
                            : 0
                        if (direction || event.key === 'Home' || event.key === 'End') {
                          event.preventDefault()
                          const nextIndex = event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? mainShapes.length - 1
                              : (shapeIndex + direction + mainShapes.length) % mainShapes.length
                          const nextShape = mainShapes[nextIndex]
                          setKeyboardId(nextShape.id)
                          setHoverId(nextShape.id)
                          event.currentTarget.ownerSVGElement
                            ?.querySelector(`[data-shape-index="${nextIndex}"]`)
                            ?.focus()
                        }
                      }}
                    />
                  )
                })}
              </g>
            </svg>
            <div className="ko-legende" aria-label="Kartforklaring">
              <span>Lavere</span>
              <i />
              <i />
              <i />
              <i />
              <i />
              <span>Høyere</span>
              {legend.length > 0 && <small>{legend.map((value) => formatKostraValue(value, mode)).join(' · ')}</small>}
            </div>
          </div>
          <aside
            className={`ko-kartinfo ${overviewRows.length || municipalityRows.length ? 'ko-kartinfo--tabell' : ''}`}
            aria-live={overviewRows.length || municipalityRows.length ? undefined : 'polite'}
            aria-atomic={overviewRows.length || municipalityRows.length ? undefined : 'true'}
          >
            {overviewRows.length ? <>
              <div className="ft-stikkord">Regnskapsoversikt · {year}</div>
              <div className="ft-kort-tittel">{overviewName}</div>
              <table className="ko-sammenstilling">
                <caption className="sr-only">Regnskapsoversikt for {overviewName} i {year}. Fylkeskommunen sammenlignet med summen av kommunene.</caption>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Regnskapspost</span></th>
                    <th scope="col">Fylkeskommunen</th>
                    <th scope="col">Sum av kommuner</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewRows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <span className="ko-sammenstilling-etikett">
                          <span>{row.label}</span>
                          <InfoTooltip label={row.label}>{row.description}</InfoTooltip>
                        </span>
                      </th>
                      <td className="num">{formatKostraValue(row.county[mode], mode)}</td>
                      <td className="num">{formatKostraValue(row.municipalities[mode], mode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ko-innbyggere">
                <span>Innbyggere</span>
                <strong className="num">{overviewPopulation == null ? '–' : `ca. ${populationFormat.format(overviewPopulation)}`}</strong>
              </div>
              {overviewHasMissingValues && <p className="ko-datadekning">En tankestrek betyr at full sum ikke kan beregnes fordi ett eller flere områder mangler data.</p>}
              <p className="ft-kort-tekst">
                Kolonnene er separate regnskaper og legges ikke sammen. <strong>Oslo er den eneste enheten som både er kommune og fylkeskommune.</strong>
                {hovered ? ' Klikk på fylket for å se kommunene.' : ''}
              </p>
            </> : municipalityRows.length ? <>
              <div className="ft-stikkord">Kommunens regnskap · {year}</div>
              <div className="ft-kort-tittel">{displayEntityName(focusedEntity)}</div>
              <table className="ko-sammenstilling ko-sammenstilling--kommune">
                <caption className="sr-only">Regnskapsoversikt for {municipalityEntityTitle(focusedEntity)} i {year}.</caption>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Regnskapspost</span></th>
                    <th scope="col">Kommunen</th>
                  </tr>
                </thead>
                <tbody>
                  {municipalityRows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <span className="ko-sammenstilling-etikett">
                          <span>{row.label}</span>
                          <InfoTooltip label={row.label}>{row.description}</InfoTooltip>
                        </span>
                      </th>
                      <td className="num">{formatKostraValue(row.summary[mode], mode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ko-innbyggere">
                <span>Innbyggere</span>
                <strong className="num">{municipalityOverviewPopulation == null ? '–' : `ca. ${populationFormat.format(municipalityOverviewPopulation)}`}</strong>
              </div>
              {municipalityOverviewHasMissingValues && <p className="ko-datadekning">En tankestrek betyr at kommunen mangler data for denne regnskapsposten.</p>}
              <p className="ft-kort-tekst">
                Dette er kun kommunens eget regnskap. {selectedMunicipalityId === focusedEntity.id
                  ? 'Regnskapet er åpnet under kartet.'
                  : 'Klikk på kommunen for å utforske regnskapet videre under kartet.'}
              </p>
            </> : <>
            <div className="ft-stikkord">
              {level === 'county'
                ? hovered ? 'Fylkeskommunens regnskap' : 'Sum av fylkeskommuneregnskapene'
                : hovered ? 'Kommune' : 'Sum av kartet'}
            </div>
            <div className="ft-kort-tittel">{summaryName}</div>
            <div className="ft-kort-belop num">{formatKostraValue(summary[mode], mode)}</div>
            <div className="ft-kort-under">{metric.label.toLowerCase()} · {year}</div>
            {!summary.complete && (
              <p className="ko-datadekning">
                {summary.availableEntities} av {summary.entities} {level === 'county' ? 'fylkeskommuner' : 'kommuner'} har data.
                Full sum kan ikke beregnes.
              </p>
            )}
            {municipalitySummary && (
              <div className="ko-kommunesum">
                <span>Sum av kommuneregnskapene</span>
                <strong className="num">{formatKostraValue(municipalitySummary[mode], mode)}</strong>
                <small>
                  {municipalitySummary.complete
                    ? `${municipalitySummary.entities} kommuner i ${hovered ? 'fylket' : 'Norge'}`
                    : `${municipalitySummary.availableEntities} av ${municipalitySummary.entities} kommuner har data`}
                </small>
              </div>
            )}
            <div className="ko-innbyggere">
              <span>Innbyggere</span>
              <strong className="num">{summary.population == null ? '–' : `ca. ${populationFormat.format(summary.population)}`}</strong>
            </div>
            <p className="ft-kort-tekst">
              {level === 'county' && municipalitySummary
                ? `${hovered ? 'Fylkeskommunen og kommunene i fylket' : 'Fylkeskommunene og kommunene'} er separate regnskaper og legges ikke sammen.${hovered ? ' Klikk for å se kommunene.' : ''}`
                : !summary.complete
                ? 'Valgt regnskapsgrunnlag har manglende data for dette året.'
                : hovered
                ? `Klikk for å ${level === 'county' ? 'se kommunene i fylket' : 'åpne regnskapet og sammenligningene'}.`
                : `${summary.entities} ${level === 'county' ? 'fylkeskommuner' : 'kommuner'} er summert. Per innbygger er befolkningsvektet.`}
            </p>
            {county && <a className="ko-handling" href={`#kostra/fylke/${countyCode}/detaljer`}>Se fylkeskommunens regnskap →</a>}
            </>}
          </aside>
        </div>
      </section>

      {selectedMunicipality ? (
        <KostraDetalj index={index} kind="municipality" code={selectedMunicipality.code} embedded />
      ) : (
        <KostraUtforsk
          index={index}
          shapes={shapes}
          entities={entities}
          metric={metric}
          metricId={metricId}
          year={year}
          mode={mode}
          hoverId={hoverId}
          level={level}
          scopeName={displayEntityName(county) || (level === 'county' ? 'Alle fylkeskommuner' : 'Alle kommuner')}
          onHover={setHoverId}
        />
      )}
    </>
  )
}
