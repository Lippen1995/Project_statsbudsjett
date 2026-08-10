import React from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { PALETT } from '../design'
import { belopMill, pct } from '../tall'

const TW = 820, TH = 460

/**
 * Squarified treemap: deler listen i to omtrent like store halvdeler og
 * legger dem ved siden av hverandre langs den lengste aksen, rekursivt.
 * Gir flater nærmere kvadrater enn en enkel skivedeling, som er lettere å
 * sammenligne visuelt.
 */
export function treemapLayout(items, x, y, w, h) {
  const ut = []
  const rec = (list, X, Y, W, H) => {
    if (!list.length) return
    if (list.length === 1) { ut.push({ ...list[0], x: X, y: Y, w: W, h: H }); return }
    const sum = list.reduce((s, i) => s + i.verdi, 0)
    let acc = 0, i = 0
    while (i < list.length - 1 && acc + list[i].verdi < sum / 2) { acc += list[i].verdi; i++ }
    const a = list.slice(0, i || 1), b = list.slice(i || 1)
    const frac = sum ? a.reduce((s, k) => s + k.verdi, 0) / sum : 0.5
    if (W >= H) { rec(a, X, Y, W * frac, H); rec(b, X + W * frac, Y, W * (1 - frac), H) }
    else { rec(a, X, Y, W, H * frac); rec(b, X, Y + H * frac, W, H * (1 - frac)) }
  }
  if (items.reduce((s, i) => s + i.verdi, 0) > 0) rec(items, x, y, w, h)
  return ut
}

/**
 * items: [{ node, verdi, navn, kanNed }] – sortert, største først
 */
export default function Treemap({ items, hover, onHover, onVelg }) {
  const felt = treemapLayout(items, 0, 0, TW, TH)
  const total = items.reduce((s, i) => s + i.verdi, 0)

  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" style={{ display: 'block' }}>
      {felt.map((f, i) => (
        <g
          key={f.node.i}
          style={{ cursor: f.kanNed ? 'pointer' : 'default' }}
          onMouseEnter={() => onHover(f.node)}
          onClick={() => f.kanNed && onVelg(f.node)}
        >
          <rect
            x={f.x + 0.5} y={f.y + 0.5}
            width={Math.max(0, f.w - 1)} height={Math.max(0, f.h - 1)}
            fill={PALETT[i % PALETT.length]}
            opacity={hover?.i === f.node.i ? 1 : 0.88}
            style={{ animation: `ftTonInn .5s ${i * 28}ms ease both`, transition: 'opacity .25s' }}
          />
          {f.w > 74 && f.h > 34 && (
            <SvgTekst x={f.x + 10} y={f.y + 21} fill="#fff" size={f.w > 180 ? 13 : 11} weight={600}>
              {kutt(f.navn, Math.floor(f.w / 7))}
            </SvgTekst>
          )}
          {f.w > 74 && f.h > 52 && (
            <SvgTekst x={f.x + 10} y={f.y + 38} fill="rgba(255,255,255,.8)" size={10}>
              {belopMill(f.verdi)} · {pct(total ? (f.verdi / total) * 100 : 0)}
            </SvgTekst>
          )}
          <title>{f.navn}</title>
        </g>
      ))}
    </svg>
  )
}
