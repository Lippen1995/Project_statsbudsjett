import React from 'react'
import AnalysisBars, { analysisColors as colors } from './AnalysisBars'
import { seriesGraph } from './chart-plan.js'
import { factText, number } from './model.js'
export default function SeriesChart({ graph, report }) {
  const data = seriesGraph(graph, report)
  const title = factText(graph.title ?? 'Utviklingen i de valgte seriene', report)
  return (
    <figure className="an-figure">
      <figcaption>
        <h2>{title}</h2>
        {graph.description && <p>{factText(graph.description, report)}</p>}
        <p>
          {data.years[0]}–{data.years.at(-1)} ·{' '}
          {data.indexed ? `Indeks: ${data.baseYear} = 100` : data.unit}
        </p>
      </figcaption>
      <div className="an-legend">
        {data.series.map((s, i) => (
          <span key={i}>
            <i style={{ background: colors[i] }} />
            {factText(s.label, report)}
          </span>
        ))}
      </div>
      <AnalysisBars years={data.years} label={`${title}. ${data.unit}`}
        chartType={graph.chartType} axis={graph.axis}
        forecastFrom={report.kind === 'oil-funds' ? report.forecastFrom : undefined}
        series={data.series.map((s, i) => ({ ...s, label: factText(s.label, report), color: colors[i] }))} />
      <div className="an-chart-endpoints">
        {data.series.map((s, i) => <span key={i}><i style={{ background: colors[i] }} />
          <strong>{factText(s.label, report)}</strong>: {number(s.values[0], 1)} → {number(s.values.at(-1), 1)} {data.unit}
        </span>)}
      </div>
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
      <details className="an-table-scroll an-evidence">
        <summary>Se tallene i grafen</summary>
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
