import React from 'react'
import AnalysisBars from './AnalysisBars'
import { annualChanges, growthMeasures } from './insights'
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
  return <figure className="an-figure">
    <figcaption><h2>Når endret utgiftsnivået seg?</h2><p>Kroner per innbygger, justert til {report.end}-priser.</p></figcaption>
    <AnalysisBars years={report.rows.map(r => r.year)} label={`KPI-justerte utgifter per innbygger i ${report.end}-kroner`}
      series={[{ label: 'KPI-justert utgift per innbygger', values: report.rows.map(r => r.realPerCapita) }]} />
    <p className="an-chart-note">Y-aksen viser hele kroner og starter i null. KPI måler konsumpriser, ikke statens egne kostnader.</p>
  </figure>
}

function AnnualPlot({ rows }) {
  const changes = annualChanges(rows)
  return <AnalysisBars years={changes.map(r => r.year)} label="Årlig KPI-justert endring per innbygger, prosent"
    series={[{ label: 'Årlig endring, prosent', values: changes.map(r => r.change) }]} />
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
          Årlig endring
        </span>
      </div>
      <AnnualPlot rows={report.rows} />
      <p className="an-chart-note">
        Nullinjen skiller økning fra nedgang. Stolpene sier
        når endringene skjedde; årsakene må undersøkes med mer detaljerte data.
      </p>
    </figure>
  )
}
