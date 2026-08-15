import React, { useMemo } from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { RUST } from '../fellestall/design'
import { formatKostraValue, summarizeKostraEntities } from './model'

const populationFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

export default function KostraUtforsk({
  index, shapes, entities, metric, metricId, year, mode, hoverId, level, scopeName, onHover, onOpen,
}) {
  const allIds = useMemo(() => shapes.map((shape) => shape.id), [shapes])
  const selectedIds = hoverId ? [hoverId] : allIds
  const scopeSummary = summarizeKostraEntities(index, metricId, year, allIds)
  const summary = summarizeKostraEntities(index, metricId, year, selectedIds)
  const selectedEntity = hoverId ? entities.get(hoverId) : null
  const title = selectedEntity?.name ?? scopeName
  const rows = shapes
    .map((shape) => ({
      shape,
      entity: entities.get(shape.id),
      summary: summarizeKostraEntities(index, metricId, year, [shape.id]),
    }))
    .sort((a, b) => Math.abs(b.summary[mode] ?? 0) - Math.abs(a.summary[mode] ?? 0))
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.summary[mode] ?? 0)))
  const shareTotal = rows.reduce((sum, row) => sum + Math.abs(row.summary.amount ?? 0), 0)
  const signedValues = rows.some((row) => (row.summary.amount ?? 0) < 0)
  const history = [{
    navn: title,
    farge: RUST,
    bredde: 2.5,
    punkter: index.years.map((itemYear) => ({
      v: summarizeKostraEntities(index, metricId, itemYear, selectedIds)[mode],
    })),
  }]

  return (
    <section className="ft-seksjon ko-utforsk">
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h3>Utforsk kommuner og fylker</h3>
          <p>
            Samme valg som i kartet, rangert som en liste. Hold over et område for å se det alene,
            eller la kartet stå urørt for å se summen av alle områdene som vises.
          </p>
        </div>
      </div>

      <div className="ft-utforsk-grid">
        <div>
          <div className="ft-nivaatopp">
            <span className="ft-nivaasum num">{formatKostraValue(scopeSummary[mode], mode)}</span>
            <span className="ft-nivaamerke">
              {rows.length} {level === 'county' ? 'fylker' : 'kommuner'} · {metric.label.toLowerCase()} {year}
            </span>
          </div>
          <div className="ft-tabellhode ko-tabellhode">
            <span />
            <span>{mode === 'perCapita' ? 'Per innb.' : 'Beløp'}</span>
            <span>{signedValues ? 'Andel av utslag' : 'Andel'}</span>
            <span />
          </div>
          {rows.map((row) => {
            const value = row.summary[mode]
            const share = shareTotal ? Math.abs(row.summary.amount) / shareTotal * 100 : 0
            return (
              <button
                type="button"
                className={`ft-utforskrad ${hoverId === row.shape.id ? 'fokus' : ''}`}
                key={row.shape.id}
                onMouseEnter={() => onHover(row.shape.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(row.shape.id)}
                onBlur={() => onHover(null)}
                onClick={() => onOpen(row.shape)}
              >
                <span className="ft-utforskmidt">
                  <span className="ft-utforsktittel">
                    <span className="ft-utforsknavn">{row.entity?.name ?? row.shape.name}</span>
                    <span className="ft-merke">{level === 'county' ? 'Fylke' : 'Kommune'}</span>
                  </span>
                  <span className="ft-bar ft-bar--tynn">
                    <span className="ft-bar-fyll" style={{ width: `${Math.abs(value ?? 0) / max * 100}%` }} />
                  </span>
                </span>
                <span className="num ft-utforskbelop">{formatKostraValue(value, mode)}</span>
                <span
                  className="num ft-utforskandel"
                  title={signedValues ? 'Andel av summen av absolutte utslag' : undefined}
                >
                  {Number.isFinite(row.summary.amount) ? `${populationFormat.format(share)} %` : '–'}
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
      </div>
    </section>
  )
}
