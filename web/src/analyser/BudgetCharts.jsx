import React from 'react'
import { number } from './model'
const money = (n) => `${number(n, 1)} mill. kr`
export function BudgetTotals({ report }) {
  const before = report.rows.reduce((s, r) => s + r.before, 0),
    after = report.rows.reduce((s, r) => s + r.after, 0),
    max = Math.max(before, after)
  return (
    <figure className="an-figure an-budget-figure">
      <figcaption>
        <h3>To budsjetter, samme avgrensning</h3>
        <p>Løpende kroner, uten finansposter og SPU-overføringer.</p>
      </figcaption>
      <svg
        viewBox="0 0 400 220"
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Sammenligning av samlede budsjetter"
      >
        <title>{`${report.beforeLabel}: ${money(before)}. ${report.afterLabel}: ${money(after)}.`}</title>
        {[
          [report.beforeLabel, before],
          [report.afterLabel, after],
        ].map(([label, v], i) => (
          <g key={label}>
            <text x="15" y={35 + i * 100}>
              {label}
            </text>
            <rect
              x="15"
              y={45 + i * 100}
              width={(350 * v) / max}
              height="30"
              fill={i ? '#a84b35' : '#8c8577'}
            />
            <text x="15" y={95 + i * 100}>
              {money(v)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  )
}
export function BudgetChanges({ report }) {
  const rows = [...report.rows]
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .filter((r) => Math.abs(r.change) >= 0.1)
      .slice(0, 10),
    max = Math.max(1, ...rows.map((r) => Math.abs(r.change)))
  return (
    <figure className="an-figure an-budget-figure">
      <figcaption>
        <h3>Postene som flytter mest penger</h3>
        <p>
          Økninger og kutt mellom {report.beforeLabel.toLowerCase()} og{' '}
          {report.afterLabel.toLowerCase()}. Samme kapittel og post følger med ved
          departementsflytting.
        </p>
      </figcaption>
      <svg
        viewBox={`0 0 400 ${Math.max(120, rows.length * 78 + 35)}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="De største endringene per budsjettpost"
      >
        <title>{rows.map((r) => `${r.name}: ${money(r.change)}`).join('. ')}</title>
        <line x1="200" x2="200" y1="0" y2={rows.length * 78} stroke="#8c8577" />
        {rows.map((r, i) => (
          <g key={r.id}>
            <text x="8" y={i * 78 + 20} fontSize="14">
              {r.name.length > 45 ? r.name.slice(0, 42) + '…' : r.name}
            </text>
            <rect
              x={r.change < 0 ? 200 - (180 * Math.abs(r.change)) / max : 200}
              y={i * 78 + 32}
              width={Math.max(1, (180 * Math.abs(r.change)) / max)}
              height="18"
              fill={r.change < 0 ? '#546952' : '#a84b35'}
            />
            <text x="8" y={i * 78 + 68} fontSize="14">
              {money(r.change)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  )
}
export function BudgetEvidence({ report }) {
  const rows = [...report.rows]
    .filter((r) => Math.abs(r.change) >= 0.1)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 20)
  return (
    <section id="faktagrunnlag" className="an-evidence">
      <h2>Tallene bak analysen</h2>
      <p>
        De største endringene, i løpende mill. kroner. Kapittel og post er sammenligningsnøkkelen.
        Hele uttrekket følger med i analysens frosne datagrunnlag.
      </p>
      <div
        className="an-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Endringer per budsjettpost"
      >
        <table>
          <caption>
            {report.beforeLabel} mot {report.afterLabel}
          </caption>
          <thead>
            <tr>
              <th>Post</th>
              <th>{report.beforeLabel}</th>
              <th>{report.afterLabel}</th>
              <th>Endring</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.id}: {r.name}
                </th>
                <td>{number(r.before, 1)}</td>
                <td>{number(r.after, 1)}</td>
                <td>{number(r.change, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function BudgetBridge({ report }) {
  const sorted = [...report.rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
    top = sorted.slice(0, 4)
  const rest = sorted.slice(4).reduce((s, r) => s + r.change, 0)
  let current = 0
  const points = [
    ...top.map((r) => ({ label: r.id, value: r.change, name: r.name })),
    { label: 'Øvrige', value: rest, name: 'Øvrige poster' },
  ].map((r) => {
    const start = current
    current += r.value
    return { ...r, start, end: current }
  })
  const max = Math.max(1, ...points.flatMap((r) => [r.start, r.end])),
    min = Math.min(0, ...points.flatMap((r) => [r.start, r.end]))
  const y = (value) => 30 + (180 * (max - value)) / (max - min),
    scale = 350 / (points.length + 1)
  return (
    <figure className="an-figure an-budget-figure">
      <figcaption>
        <h3>Slik blir endringene til én sum</h3>
        <p>
          De største postene og resten av budsjettet summeres til nettoendringen. Dette viser
          endringen, ikke størrelsen på hele budsjettet.
        </p>
      </figcaption>
      <svg
        viewBox="0 0 400 310"
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Vannfall som avstemmer postendringene til samlet budsjettendring"
      >
        <title>{`Nettoendring: ${money(current)}. ${points.map((r) => `${r.name}: ${money(r.value)}`).join('. ')}`}</title>
        <line x1="10" x2="390" y1={y(0)} y2={y(0)} stroke="#8c8577" />
        {points.map((r, i) => (
          <g key={r.label}>
            <rect
              x={20 + i * scale}
              y={y(Math.max(r.start, r.end))}
              width={scale * 0.65}
              height={Math.max(1, Math.abs(y(r.start) - y(r.end)))}
              fill={r.value < 0 ? '#546952' : '#a84b35'}
            />
            <text x={20 + i * scale} y="240" fontSize="12">
              {r.label}
            </text>
            <text x={20 + i * scale} y="260" fontSize="12">
              {number(r.value, 0)}
            </text>
          </g>
        ))}
        <rect
          x={20 + points.length * scale}
          y={y(Math.max(0, current))}
          width={scale * 0.65}
          height={Math.max(1, Math.abs(y(current) - y(0)))}
          fill="#8c8577"
        />
        <text x={20 + points.length * scale} y="240" fontSize="12">
          Sum
        </text>
        <text x={20 + points.length * scale} y="260" fontSize="12">
          {number(current, 0)}
        </text>
      </svg>
    </figure>
  )
}

export function PoliticalEvidence({ report }) {
  const labels = {
    agreement: 'Budsjettavtale',
    'committee-recommendation': 'Komitéinnstilling',
    vote: 'Dokumentert stemmestøtte',
    'adopted-amendment': 'Vedtatt endringsforslag',
  }
  if (!report.politicalEvidence?.length) return null
  return (
    <section id="politiskgrunnlag" className="an-method">
      <h2>Dokumentasjonen bak partienes rolle</h2>
      <p>Stemmestøtte dokumenterer ikke i seg selv hvem som forhandlet frem en endring.</p>
      {report.politicalEvidence.map((item, i) => (
        <div key={i}>
          <h3>
            {labels[item.kind]} · {item.parties.join(', ')}
          </h3>
          <blockquote>{item.quote}</blockquote>
          <p>
            Berørte poster: {item.recordKeys.join(', ')}. <a href={item.url}>Les kilden ↗</a>
          </p>
        </div>
      ))}
    </section>
  )
}
