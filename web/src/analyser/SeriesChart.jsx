import React, { useState } from 'react'
import AnalysisBars, { analysisColors as colors } from './AnalysisBars'
import { seriesGraph } from './chart-plan.js'
import { factText, number } from './model.js'
export default function SeriesChart({ graph, report }) {
  const [activeSeries, setActiveSeries] = useState(0)
  const data = seriesGraph(graph, report)
  const units = [...new Set(data.series.map(s => s.unit))]
  const indexUnit = units.length === 1 ? (units[0] === 'mill. kr' ? 'løpende kroner' : units[0]) : ''
  const title = factText(graph.title ?? 'Utviklingen i de valgte seriene', report)
  return (
    <figure className="an-figure">
      <figcaption>
        <h2>{title}</h2>
        <p>
          {data.years[0]}–{data.years.at(-1)} ·{' '}
          {data.indexed ? `Indeks: ${data.baseYear} = 100${indexUnit ? ` · ${indexUnit}` : ''}` : data.unit}
          {graph.axis === 'focused' && <span className="an-axis-label"> · Avkortet Y-akse</span>}
        </p>
      </figcaption>
      <div className="an-legend">
        {data.series.map((s, i) => graph.annotation && data.series.length > 1 ?
          <button type="button" key={i} className={i === activeSeries ? 'is-active' : ''}
            aria-pressed={i === activeSeries} aria-label={`Vis endringspil for ${factText(s.label, report)}`}
            onClick={() => setActiveSeries(i)} style={{ '--series-color': colors[i] }}>
            <i style={{ background: colors[i] }} />{factText(s.label, report)}
          </button> : <span key={i}><i style={{ background: colors[i] }} />{factText(s.label, report)}</span>)}
      </div>
      <AnalysisBars years={data.years} label={`${title}. ${data.unit}`}
        chartType={graph.chartType} axis={graph.axis} annotation={graph.annotation} activeSeries={activeSeries}
        forecastFrom={report.kind === 'oil-funds' ? report.forecastFrom : undefined}
        series={data.series.map((s, i) => ({ ...s, label: factText(s.label, report), color: colors[i] }))} />
      <details className="an-table-scroll an-evidence">
        <summary>Tall og kilder</summary>
        {graph.description && <p className="an-chart-note">{factText(graph.description, report)}</p>}
        {graph.annotation && <p className="an-chart-note">Pilen viser samlet prosentvis endring fra første til siste år, ikke årlig vekst eller en estimert trend.</p>}
      <p className="an-chart-note">
        {data.indexed
          ? 'Seriene er satt til samme startverdi i det første felles året. Seriene sammenligner vekst, ikke beløp eller størrelser.'
          : `Y-aksen viser ${data.unit}.`}{' '}
        {graph.axis === 'focused' ? 'Y-aksen er avkortet for å vise endringene tydeligere. Les aksens tall; linjens høyde er ikke et mål på vekst fra null. ' : 'Y-aksen inkluderer null. '}
        {report.kind === 'oil-funds' 
          ? 'Nøkkeltallene inkluderer anslag og budsjettforslag. Stiplede linjer eller lyse stolper viser anslagsårene. Faste priser følger Finansdepartementets prisjustering.'
          : 'Bare felles observerte år vises.'}{' '}
        Samtidig utvikling dokumenterer ikke årsak.
      </p>
      <p className="an-chart-note">
        {data.series.map((s) => `${factText(s.label, report)}: ${s.source}, ${s.unit}`).join(' · ')}
      </p>
        <table>
          <caption>
            {title} ({data.unit})
          </caption>
          <thead>
            <tr>
              <th scope="col">År</th>
              {data.series.map((s, i) => (
                <th key={i} scope="col">
                  {factText(s.label, report)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.years.map((y, i) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {data.series.map((s, j) => (
                  <td key={j} className="num">
                    {number(s.values[i], 2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
