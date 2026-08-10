import React, { useState } from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { PALETT, INK } from '../design'
import { pct } from '../tall'

const W = 356, H = 150

/**
 * Stablet areal, normalisert til 100 % per år: viser hvordan sammensetningen
 * av et nivå har endret seg, ikke hvor mye det har vokst.
 *
 * serier: [{ navn, verdier: [tall per år] }] – maks sju, resten er utenfor
 */
export default function StabletAreal({ serier, aar }) {
  const [hover, setHover] = useState(null)

  if (!serier.length) return <div className="ft-graf-tom">Ingen data</div>

  const totaler = aar.map((_, i) => serier.reduce((s, r) => s + r.verdier[i], 0) || 1)
  const x = (i) => (aar.length > 1 ? (i * W) / (aar.length - 1) : 0)

  // Kumulativ øvre kant per serie, i prosent av årets total
  const kum = aar.map(() => 0)
  const flater = serier.map((serie) => {
    const ovre = serie.verdier.map((v, i) => {
      kum[i] += (v / totaler[i]) * 100
      return kum[i]
    })
    const nedre = ovre.map((v, i) => v - (serie.verdier[i] / totaler[i]) * 100)
    const d =
      'M' + ovre.map((v, i) => `${x(i).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join('L') +
      'L' + nedre.map((v, i) => `${x(i).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).reverse().join('L') + 'Z'
    return d
  })

  const bandW = W / Math.max(1, aar.length - 1)
  const rader =
    hover == null
      ? []
      : serier
          .map((s, si) => ({
            navn: s.navn,
            farge: PALETT[si % PALETT.length],
            andel: (s.verdier[hover] / totaler[hover]) * 100,
          }))
          .filter((r) => r.andel >= 0.5)
          .sort((a, b) => b.andel - a.andel)

  const linjer = rader.map((r) => ({ farge: r.farge, tekst: `${kutt(r.navn, 26)}  ${pct(r.andel)}` }))
  const boksB = Math.max(12, ...linjer.map((l) => l.tekst.length)) * 6.2 + 26
  const boksH = 22 + linjer.length * 15
  const hx = hover == null ? 0 : x(hover)
  const bx = hx + boksB + 8 > W ? Math.max(0, hx - boksB - 8) : hx + 8

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {flater.map((d, si) => (
        <path
          key={`a${si}`}
          d={d}
          fill={PALETT[si % PALETT.length]}
          opacity={0.85}
          style={{ animation: `ftTonInn .7s ${si * 45}ms ease both` }}
        />
      ))}

      {aar.map((a, i) => (
        <rect
          key={`ab${i}`}
          x={x(i) - bandW / 2} y={0} width={bandW} height={H}
          fill="transparent" style={{ cursor: 'crosshair' }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {hover != null && linjer.length > 0 && (
        <>
          <line x1={hx} x2={hx} y1={0} y2={H} stroke="#FFFDF9" strokeWidth={1} strokeDasharray="3 3" />
          <g style={{ pointerEvents: 'none' }}>
            <rect x={bx} y={4} width={boksB} height={boksH} rx={4} fill={INK} opacity={0.96} />
            <SvgTekst x={bx + 11} y={20} size={11} weight={700} fill="#F7F5F0">{aar[hover]}</SvgTekst>
            {linjer.map((l, li) => (
              <g key={`al${li}`}>
                <rect x={bx + 11} y={28 + li * 15} width={8} height={8} fill={l.farge} />
                <SvgTekst x={bx + 25} y={36 + li * 15} size={10} fill="#D8D4CC">{l.tekst}</SvgTekst>
              </g>
            ))}
          </g>
        </>
      )}
    </svg>
  )
}
