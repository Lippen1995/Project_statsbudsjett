import React, { useEffect, useMemo, useState } from 'react'
import { choroplethColor, formatKostraValue, mapValue, summarizeKostraEntities, summarizeMunicipalities } from './model'
import KostraUtforsk from './KostraUtforsk'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

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

export default function KostraKart({ index, boundaries, countyCode, embedded = false }) {
  const [metricId, setMetricId] = useState('expenses')
  const [year, setYear] = useState(index.latestYear)
  const [mode, setMode] = useState('perCapita')
  const [hoverId, setHoverId] = useState(null)
  const [search, setSearch] = useState('')
  const level = countyCode ? 'municipality' : 'county'
  const countyId = countyCode ? `county:${countyCode}` : null
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
  }, [countyId])

  const values = shapes.map((shape) => mapValue(index, metricId, year, shape.id, mode)).filter(Number.isFinite)
  const hovered = hoverId ? entities.get(hoverId) : null
  const county = countyId ? entities.get(countyId) : null
  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0]
  const summaryIds = hoverId ? [hoverId] : shapes.map((shape) => shape.id)
  const summary = summarizeKostraEntities(index, metricId, year, summaryIds)
  const municipalitySummary = level === 'county' && metric.category === 'finance'
    ? summarizeMunicipalities(index, metricId, year, summaryIds)
    : null
  const summaryName = hovered?.name ?? (county?.name ?? 'Alle fylkeskommuner')
  const viewBox = level === 'municipality' ? focusedViewBox(shapes, boundaries.viewBox) : boundaries.viewBox
  const hits = search.trim().length >= 2
    ? [...entities.values()].filter((entity) => entity.kind === level && entity.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []
  const sorted = [...values].sort((a, b) => a - b)
  const legend = sorted.length ? [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.at(-1)] : []
  const Heading = embedded ? 'h2' : 'h1'

  const open = (shape) => {
    window.location.hash = shape.id.startsWith('county:')
      ? `kostra/fylke/${shape.id.split(':')[1]}`
      : `kostra/kommune/${shape.code}`
  }

  return (
    <>
      <header className={`ko-hero ${embedded ? 'ko-hero--integrert' : ''}`}>
        <div className="ft-kicker">KOSTRA · Kommune- og fylkesregnskap · {index.years[0]}–{index.latestYear}</div>
        <Heading>{county ? `${county.name}, kommune for kommune` : 'Slik bruker kommunene pengene'}</Heading>
        <p className="ft-ingress">
          Velg et nøkkeltall og klikk deg fra Norge til fylke og kommune. Alle tall er hentet fra SSB,
          normalisert lokalt og sammenlignbare med landet og KOSTRA-gruppen.
        </p>
        <div className="ko-smuler" aria-label="Brødsmuler">
          <a href="#kostra">Norge</a>
          {county && <><span>›</span><span aria-current="page">{county.name}</span></>}
        </div>
      </header>

      <section className="ft-seksjon ko-kartseksjon">
        <div className="ko-verktoy">
          <label>
            <span className="ft-stikkord">Nøkkeltall</span>
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
          <label className="ko-sokfelt">
            <span className="ft-stikkord">Finn {level === 'county' ? 'fylke' : 'kommune'}</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk etter navn" />
            {hits.length > 0 && (
              <div className="ko-soktreff">
                {hits.map((entity) => (
                  <a key={entity.id} href={entity.kind === 'county' ? `#kostra/fylke/${entity.id.split(':')[1]}` : `#kostra/kommune/${entity.code}`}>
                    {entity.name}
                  </a>
                ))}
              </div>
            )}
          </label>
        </div>

        <div className="ko-kartgrid">
          <div className="ko-kartflate">
            <svg viewBox={viewBox} role="img" aria-label={`${metric.label} i ${year}, ${county?.name ?? 'Norge'}`}>
              <g fillRule="evenodd">
                {shapes.map((shape) => {
                  const value = mapValue(index, metricId, year, shape.id, mode)
                  return (
                    <path
                      key={shape.id}
                      d={shape.path}
                      fill={choroplethColor(value, values)}
                      className={hoverId === shape.id ? 'aktiv' : ''}
                      tabIndex="0"
                      role="button"
                      aria-label={`${shape.name}: ${formatKostraValue(value, mode)}`}
                      onMouseEnter={() => setHoverId(shape.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(shape.id)}
                      onBlur={() => setHoverId(null)}
                      onClick={() => open(shape)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') open(shape) }}
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
          <aside className="ko-kartinfo" aria-live="polite" aria-atomic="true">
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
          </aside>
        </div>
      </section>

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
        scopeName={county?.name ?? 'Alle fylkeskommuner'}
        onHover={setHoverId}
      />
    </>
  )
}
