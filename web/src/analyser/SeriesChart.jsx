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
        forecastFrom={report.kind === 'oil-funds' ? report.forecastFrom : undefined}
        series={data.series.map((s, i) => ({ ...s, label: factText(s.label, report), color: colors[i] }))} />
      <p className="an-chart-note">
        {data.indexed
          ? 'Seriene er satt til samme startverdi i det første felles året. Stolpene sammenligner vekst, ikke beløp eller størrelser.'
          : `Y-aksen viser ${data.unit} og inkluderer null.`}{' '}
        {report.kind === 'oil-funds'
          ? 'Nøkkeltallene inkluderer anslag og budsjettforslag. Lyse stolper med stiplet kant viser anslagsårene. Faste priser følger Finansdepartementets prisjustering.'
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
