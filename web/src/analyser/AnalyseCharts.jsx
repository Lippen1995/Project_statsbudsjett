import React from 'react'
import LinjeGraf from '../fellestall/grafer/LinjeGraf'
import { yearTickIndices } from '../fellestall/grafer/akse'
import { annualChanges, growthMeasures, largestAnnualChange } from './insights'
import { number } from './model'

const changeText = (value) => `${value > 0 ? '+' : ''}${number(value, 1)} %`

export function GrowthComparison({ report }) {
  const measures = growthMeasures(report)
  const min = Math.min(0, ...measures.map((m) => m.value))
  const max = Math.max(0, ...measures.map((m) => m.value))
  const span = max - min || 1
  return (
    <figure className="an-figure">
      <figcaption>
        <h2>Samme regnskap, ulike målestokker</h2>
        <p>
          Prosentvis endring fra {report.start} til {report.end}. Hver justering svarer på et nytt
          spørsmål.
        </p>
      </figcaption>
      <div className="an-growth-comparison">
        {measures.map((m, i) => (
          <div className={`an-growth-row${i === 2 ? ' an-growth-adjusted' : ''}`} key={i}>
            <div className="an-growth-label">
              <span>
                <strong>{m.label}</strong>
                <small>{m.detail}</small>
              </span>
              <b className="num">{changeText(m.value)}</b>
            </div>
            <div className="an-growth-track" aria-hidden="true">
              <span
                className="an-growth-bar"
                style={{
                  left: `${((Math.min(0, m.value) - min) / span) * 100}%`,
                  width: `${(Math.abs(m.value) / span) * 100}%`,
                }}
              />
              <span className="an-growth-zero" style={{ left: `${(-min / span) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="an-chart-note">
        Stolpene viser alternative mål på veksten og starter i null. Prosentene er ikke bidrag som
        kan legges sammen eller trekkes direkte fra hverandre.
      </p>
    </figure>
  )
}

export function RealExpenditureChart({ report }) {
  const props = {
    aar: report.rows.map((row) => row.year),
    fraNull: false,
    aksefmt: (v) => `${number(v / 1000)}k`,
    akseFont: 12,
    akseMarg: 48,
    bunnMarg: 28,
    beskrivelse: `KPI-justerte utgifter per innbygger i ${report.end}-kroner, sammenlignet med nivået i ${report.start}`,
    serier: [
      {
        navn: `Nivå i ${report.start}`,
        farge: '#858077',
        stiplet: true,
        punkter: report.rows.map(() => ({ v: report.rows[0].realPerCapita })),
      },
      {
        navn: 'KPI-justert utgift per innbygger',
        farge: '#C5452E',
        punkter: report.rows.map((row) => ({ v: row.realPerCapita })),
      },
    ],
  }
  return (
    <figure className="an-figure">
      <figcaption>
        <h2>Når endret utgiftsnivået seg?</h2>
        <p>
          Kroner per innbygger, justert til samme prisnivå. Den stiplede linjen holder startårets
          nivå fast.
        </p>
      </figcaption>
      <div className="an-legend">
        <span>
          <i style={{ background: '#C5452E' }} />
          KPI-justert utgift per innbygger
        </span>
        <span>
          <i style={{ background: '#858077' }} />
          Nivå i {report.start}
        </span>
      </div>
      <div className="an-chart-wide">
        <LinjeGraf {...props} W={680} H={270} />
      </div>
      <div className="an-chart-compact">
        <LinjeGraf {...props} W={400} H={240} akseFont={14} />
      </div>
      <p className="an-chart-note">
        Alle beløp er i {report.end}-kroner. Y-aksen er merket i tusenkroner og starter over null
        for å vise endringene. KPI er et mål på konsumpriser, ikke på statens egne kostnader.
      </p>
    </figure>
  )
}

function AnnualPlot({ rows, W }) {
  const changes = annualChanges(rows)
  const largest = largestAnnualChange(rows)
  const low = Math.min(0, ...changes.map((row) => row.change))
  const high = Math.max(0, ...changes.map((row) => row.change))
  const padding = (high - low || 1) * 0.14
  const min = low - padding,
    max = high + padding
  const H = 250,
    left = 54,
    right = 12,
    top = 24,
    bottom = 32
  const fontSize = W <= 400 ? 14 : 12
  const step = (W - left - right) / changes.length
  const x = (i) => left + step * (i + 0.5)
  const y = (value) => top + ((H - top - bottom) * (max - value)) / (max - min)
  const ticks = new Set(yearTickIndices(changes.length))
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Årlig KPI-justert endring per innbygger. Største endring i absoluttverdi: ${changeText(largest.change)} i ${largest.year}.`}
    >
      <desc>{changes.map((row) => `${row.year}: ${changeText(row.change)}`).join('. ')}</desc>
      {[low, (low + high) / 2, high]
        .filter((value, i, all) => all.indexOf(value) === i)
        .map((value) => (
          <g key={value}>
            <line x1={left} x2={W - right} y1={y(value)} y2={y(value)} stroke="#E4DFD5" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize={fontSize} fill="#706A60">
              {number(value, 1)} %
            </text>
          </g>
        ))}
      <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke="#858077" />
      {changes.map((row, i) => (
        <g key={row.year}>
          <title>{`${row.year}: ${changeText(row.change)}`}</title>
          <rect
            x={x(i) - Math.min(30, step * 0.7) / 2}
            y={Math.min(y(0), y(row.change))}
            width={Math.min(30, step * 0.7)}
            height={Math.abs(y(row.change) - y(0))}
            fill={row.change < 0 ? '#14594F' : '#C5452E'}
          />
          {(row.year === largest.year || i === changes.length - 1) && (
            <text
              x={x(i)}
              y={row.change < 0 ? y(row.change) + 16 : y(row.change) - 8}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={600}
              fill="#14161A"
            >
              {changeText(row.change)}
            </text>
          )}
          {ticks.has(i) && (
            <text
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === changes.length - 1 ? 'end' : 'middle'}
              fontSize={fontSize}
              fill="#706A60"
            >
              {row.year}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function AnnualChangeChart({ report }) {
  return (
    <figure className="an-figure">
      <figcaption>
        <h2>Veksten kom ikke i like porsjoner</h2>
        <p>
          Årlig prosentvis endring i KPI-justert utgift per innbygger. Hvert år sammenlignes med
          året før.
        </p>
      </figcaption>
      <div className="an-legend">
        <span>
          <i style={{ background: '#C5452E' }} />
          Økning
        </span>
        <span>
          <i style={{ background: '#14594F' }} />
          Nedgang
        </span>
      </div>
      <div className="an-chart-wide">
        <AnnualPlot rows={report.rows} W={680} />
      </div>
      <div className="an-chart-compact">
        <AnnualPlot rows={report.rows} W={400} />
      </div>
      <p className="an-chart-note">
        Nullinjen skiller økning fra nedgang. Fargene viser retningen på endringen. Stolpene sier
        når endringene skjedde; årsakene må undersøkes med mer detaljerte data.
      </p>
    </figure>
  )
}
