import React from 'react'
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, Bar, Cell, ReferenceLine } from 'recharts'
import { oljeGrafSerier } from '../oljetall'
import { GULL } from '../design'
import { belopMill, n0 } from '../tall'

const FRA = '#91B5C5'
const NETTO = '#91B99B'
const NEGATIV = '#D99382'

function StromTips({ active, payload }) {
  const rad = payload?.[0]?.payload
  if (!active || !rad) return null
  return <div className="ft-stromtips">
    <strong>{rad.aar} · {rad.type}</strong>
    <p>Innskudd til fondet: {belopMill(rad.innskudd)} kr</p>
    <p>Overføringer fra fondet: {belopMill(rad.overforing)} kr</p>
    <p><strong>Netto inn i fondet: {belopMill(rad.netto)} kr</strong></p>
  </div>
}

export default function FondStromGraf({ rader }) {
  if (!rader.length) return null
  const punkter = rader.map((r) => ({ ...r }))
  const linjer = [['innskudd', 'Innskudd til fondet', GULL], ['overforing', 'Overføringer fra fondet', FRA]].flatMap(([felt, navn, farge]) =>
    oljeGrafSerier(rader, felt, farge).map((serie, i) => {
      const key = `${felt}${i}`
      punkter.forEach((p, j) => { p[key] = serie.punkter[j].v })
      return { key, navn, farge, stiplet: serie.stiplet }
    }))
  return <div className="ft-fondgraf ft-stromgraf">
    <h3>Innskudd, overføringer og netto til Oljefondet</h3>
    <p className="ft-fondnote">Milliarder kroner, løpende priser. Linjer leses på venstre akse; nettostolper på høyre akse.</p>
    <div className="ft-stromgraf-flate">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={punkter} margin={{ top: 12, right: 4, bottom: 8, left: 4 }} accessibilityLayer>
          <CartesianGrid stroke="#3A3C42" vertical={false} />
          <XAxis dataKey="aar" stroke="#A8A49B" tick={{ fontSize: 12 }} minTickGap={20} />
          <YAxis yAxisId="strom" stroke="#D8D4CC" tick={{ fontSize: 12 }} tickFormatter={(v) => n0.format(v / 1000)} width={56} domain={[0, 'auto']} />
          <YAxis yAxisId="netto" orientation="right" stroke={NETTO} tick={{ fontSize: 12 }} tickFormatter={(v) => n0.format(v / 1000)} width={56} />
          <Tooltip content={<StromTips />} />
          <ReferenceLine yAxisId="netto" y={0} stroke={NETTO} strokeDasharray="3 3" />
          <Bar yAxisId="netto" dataKey="netto" name="Netto inn i fondet" maxBarSize={36} isAnimationActive={false}>
            {punkter.map((r) => <Cell key={r.aar} fill={r.netto < 0 ? NEGATIV : NETTO} fillOpacity={r.budsjett ? 0.35 : 0.65} />)}
          </Bar>
          {linjer.map((l) => <Line key={l.key} yAxisId="strom" dataKey={l.key} name={l.navn} stroke={l.farge} strokeWidth={2.5} strokeDasharray={l.stiplet ? '6 4' : undefined} dot={{ r: 3 }} isAnimationActive={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <p className="ft-fondnote ft-fondlegend">
      <span><i style={{ background: GULL }} />Innskudd til fondet · venstre akse</span>
      <span><i style={{ background: FRA }} />Overføringer fra fondet · venstre akse</span>
      <span><i className="ft-stromlegend-stolpe" style={{ background: NETTO }} />Netto inn i fondet · høyre akse</span>
    </p>
    <p className="ft-fondnote">Netto = innskudd minus overføringer. Positive stolper viser netto innskudd; negative stolper viser netto uttak. Heltrukne linjer og mørkere stolper viser regnskap; stiplede linjer og lysere stolper viser siste felles budsjettversjon. Kilde: DFØ, kapittel 2800 og 5800. Netto inkluderer ikke avkastning eller verdiendringer i fondet.</p>
    <details className="ft-fonddetaljer">
      <summary>Vis tallene bak grafen</summary>
      <div className="ft-fondtabell-wrap"><table className="ft-fondtabell">
        <caption>Pengestrømmer i milliarder kroner</caption>
        <thead><tr><th scope="col">År og grunnlag</th><th scope="col">Innskudd</th><th scope="col">Overføringer</th><th scope="col">Netto</th></tr></thead>
        <tbody>{rader.map((r) => <tr key={r.aar}><th scope="row">{r.aar} · {r.type}</th>{['innskudd', 'overforing', 'netto'].map((felt) => <td key={felt}>{n0.format(r[felt] / 1000)}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </div>
}
