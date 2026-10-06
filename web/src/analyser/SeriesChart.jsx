import React from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { seriesGraph } from './chart-plan.js'
import { factText, number } from './model.js'
const colors = ['#C5452E', '#14594F', '#858077', '#715196', '#B07712']
export default function SeriesChart({ graph, report }) {
  const data = seriesGraph(graph, report)
  const title = factText(graph.title ?? 'Utviklingen i de valgte seriene', report)
  const props = {
    aar: data.years,
    fraNull: true,
    aksefmt: (v) => number(v, 1),
    akseFont: 12,
    akseMarg: 64,
    bunnMarg: 28,
    beskrivelse: `${title}. ${data.unit}. ${data.series.map((s) => s.label).join(', ')}`,
    serier: data.series.map((s, i) => ({
      navn: factText(s.label, report),
      farge: colors[i],
      punkter: s.values.map((v) => ({ v })),
    })),
  }
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
      <div className="an-chart-wide">
        <LinjeGraf {...props} W={680} H={270} />
      </div>
      <div className="an-chart-compact">
        <LinjeGraf {...props} W={400} H={250} akseFont={14} />
      </div>
      <p className="an-chart-note">
        {data.indexed
          ? 'Seriene er satt til samme startverdi i det første felles året. Kurvene sammenligner vekst, ikke beløp eller størrelser.'
          : `Y-aksen viser ${data.unit} og inkluderer null.`}{' '}
        Bare felles observerte år vises. Samtidig utvikling dokumenterer ikke årsak.
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
