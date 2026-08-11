import React, { useState } from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { RUST, GRONN, INK, BLEK } from '../design'
import { belopMill, medFortegn } from '../tall'

const W = 1080, H = 300, MT = 28, MB = 62

/**
 * Vannfallsdiagram: de største bevegelsene stables fra venstre, hver stolpe
 * starter der den forrige sluttet, og siste stolpe er summen.
 *
 * endr: [{ node, navn, delta }] sortert med største økning først
 * onDrill: (node) => void for én stolpe, (null, noder) => void for «Øvrige»
 */
export default function Vannfall({ endr, onDrill }) {
  const [fokus, setFokus] = useState(null)
  const topp = endr.slice(0, 6).concat(endr.filter((r) => r.delta < 0).slice(-4))
  const sett = new Set(topp.map((r) => r.node.i))
  const restRader = endr.filter((r) => !sett.has(r.node.i))
  const rest = restRader.reduce((s, r) => s + r.delta, 0)

  const stolper = topp
    .map((r) => ({ navn: r.navn, v: r.delta, node: r.node }))
    .concat(rest ? [{ navn: 'Øvrige', v: rest, rest: restRader.map((r) => r.node) }] : [])

  if (!stolper.length) return <div className="ft-graf-tom">Ingen endringer å vise</div>

  let lop = 0
  const punkter = stolper.map((b) => {
    const start = lop
    lop += b.v
    return { ...b, start, slutt: lop }
  })
  const sum = punkter.length ? punkter[punkter.length - 1].slutt : 0

  const alle = punkter.flatMap((p) => [p.start, p.slutt]).concat([0, sum])
  const maks = Math.max(...alle), min = Math.min(...alle)
  const y = (v) => MT + (H - MT - MB) * (1 - (v - min) / (maks - min || 1))
  const kol = (W - 8) / (punkter.length + 1)
  const bw = kol * 0.62
  const xFor = (i) => 4 + i * kol + (kol - bw) / 2

  const xs = xFor(punkter.length)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={
        `Vannfallsdiagram over endringer. Samlet ${medFortegn(sum, belopMill(Math.abs(sum)))} kroner. ` +
        punkter.slice(0, 6).map((p) => `${p.navn} ${medFortegn(p.v, belopMill(Math.abs(p.v)))}`).join('. ')
      }
    >
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#DCD6CB" strokeWidth={1} />

      {punkter.map((p, i) => {
        const x = xFor(i)
        const topY = y(Math.max(p.start, p.slutt))
        const h = Math.abs(y(p.start) - y(p.slutt))
        const klikk = p.node ? () => onDrill(p.node) : p.rest ? () => onDrill(null, p.rest) : undefined
        return (
          <g key={`p${i}`}>
            {/* Stiplet forbindelse fra forrige stolpes topp */}
            {i > 0 && (
              <line
                x1={xFor(i - 1) + bw} x2={x} y1={y(p.start)} y2={y(p.start)}
                stroke="#C9C4BA" strokeWidth={1} strokeDasharray="2 3"
              />
            )}
            {/* Usynlig treffflate over hele kolonnen, så tynne stolper er klikkbare */}
            {klikk && (
              <rect
                x={4 + i * kol} y={MT} width={kol} height={H - MT - MB}
                fill="transparent" style={{ cursor: 'pointer' }} onClick={klikk}
                tabIndex={0}
                role="button"
                aria-label={`${p.navn}: ${medFortegn(p.v, belopMill(Math.abs(p.v)))} kroner. Åpne for å bryte ned.`}
                onFocus={() => setFokus(i)}
                onBlur={() => setFokus(null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); klikk() } }}
              >
                <title>{p.navn}</title>
              </rect>
            )}
            {/* Fokusramme, siden outline ikke tegnes likt på SVG i alle nettlesere */}
            {fokus === i && (
              <rect
                x={4 + i * kol + 1} y={MT + 1} width={kol - 2} height={H - MT - MB - 2}
                fill="none" stroke={INK} strokeWidth={2} strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <rect
              x={x} y={topY} width={bw} height={Math.max(2, h)}
              fill={p.v >= 0 ? RUST : GRONN}
              style={{ cursor: klikk ? 'pointer' : 'default' }}
              onClick={klikk}
            />
            <SvgTekst x={x + bw / 2} y={topY - 8} size={10} weight={600} fill={p.v >= 0 ? RUST : GRONN} anchor="middle">
              {medFortegn(p.v, belopMill(Math.abs(p.v)))}
            </SvgTekst>
            <SvgTekst x={x + bw / 2} y={H - MB + 18} size={11} fill={BLEK} anchor="middle">
              {kutt(p.navn, 15)}
            </SvgTekst>
          </g>
        )
      })}

      <line
        x1={xFor(punkter.length - 1) + bw} x2={xs} y1={y(sum)} y2={y(sum)}
        stroke="#C9C4BA" strokeWidth={1} strokeDasharray="2 3"
      />
      <rect x={xs} y={y(Math.max(sum, 0))} width={bw} height={Math.max(2, Math.abs(y(sum) - y(0)))} fill={INK} />
      <SvgTekst x={xs + bw / 2} y={y(Math.max(sum, 0)) - 8} size={11} weight={700} anchor="middle">
        {medFortegn(sum, belopMill(Math.abs(sum)))}
      </SvgTekst>
      <SvgTekst x={xs + bw / 2} y={H - MB + 18} size={11} fill={INK} weight={600} anchor="middle">
        Samlet endring
      </SvgTekst>
    </svg>
  )
}
