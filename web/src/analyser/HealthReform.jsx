import React, { useMemo, useState } from 'react'
import { healthScenario } from './health-scenario.js'
import { number } from './model.js'

const money = value => `${number(value / 1e6, 0)} mill. kr`

export function HealthScenario({ report, graph }) {
  const base = report.healthPolicy.scenario
  const [timeSaving, setTimeSaving] = useState(base.timeSaving)
  const [realization, setRealization] = useState(base.realization)
  const [cashShare, setCashShare] = useState(base.cashShare)
  const [upfrontCost, setUpfrontCost] = useState(base.upfrontCost)
  const assumptions = { ...base, timeSaving, realization, cashShare, upfrontCost }
  const result = useMemo(() => healthScenario(assumptions), [timeSaving, realization, cashShare, upfrontCost])
  const final = result.rows.at(-1)
  const slider = (label, value, set, min, max, step, display) => (
    <label>
      <span>{label}<strong>{display(value)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => set(Number(e.target.value))} />
    </label>
  )
  return <figure className="an-health-scenario">
    <figcaption>
      <h3>{graph.title || 'Test dine egne antakelser'}</h3>
      <p>{graph.description || 'Utredningen har ikke et samlet spareanslag. Kalkulatoren viser hva ulike antakelser gjør med kapasitet og kontantstrøm.'}</p>
    </figcaption>
    <div className="an-health-controls">
      {slider('Tid frigjort i RHF-leddet', timeSaving, setTimeSaving, 0, .5, .01, v => `${number(v * 100, 0)} %`)}
      {slider('Andel som faktisk kan realiseres', realization, setRealization, 0, 1, .05, v => `${number(v * 100, 0)} %`)}
      {slider('Andel tatt ut som kontantkutt', cashShare, setCashShare, 0, 1, .05, v => `${number(v * 100, 0)} %`)}
      {slider('Engangskostnad til omstilling', upfrontCost, setUpfrontCost, 0, 2000000000, 50000000, money)}
    </div>
    <div className="an-health-results" aria-live="polite">
      <div><span>Frigjort kapasitet</span><strong>{number(final.capacityFte, 1)} årsverk</strong></div>
      <div><span>Kontantbesparelse i siste år</span><strong>{money(final.staffCashSaving)}</strong></div>
      <div><span>Netto nåverdi</span><strong>{money(result.npv)}</strong></div>
      <div><span>Break-even</span><strong>{result.breakEvenYear === null ? 'Ikke innen perioden' : `År ${result.breakEvenYear}`}</strong></div>
    </div>
    <p className="an-chart-note">{result.warning} Kapasitet og kontantkutt telles ikke dobbelt.</p>
  </figure>
}

export function HealthPolitics({ policy }) {
  return <section className="an-evidence" id="politisk-forankring">
    <h2>Hvem står bak – og hvem stritter imot?</h2>
    <p>Reaksjonene gjelder ulike deler av utredningen. Ingen av aktørene nedenfor er ført som tilhengere eller motstandere av hele pakken.</p>
    <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Politisk forankring for helsereformen">
      <table style={{ whiteSpace: 'normal' }}>
        <thead><tr><th scope="col">Aktør</th><th scope="col">Dokumentert posisjon</th><th scope="col">Status</th></tr></thead>
        <tbody>{policy.politics.map(row => <tr key={row.actor}>
          <th scope="row">{row.actor}</th><td>{row.position}</td><td>{row.status}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}
