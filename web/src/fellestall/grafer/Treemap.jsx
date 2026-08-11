import React, { useState } from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { PALETT, INK } from '../design'
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
export default function Treemap({ items, hover, onHover, onVelg, merke = 'Alle utgifter' }) {
  const [fokus, setFokus] = useState(null)
  const felt = treemapLayout(items, 0, 0, TW, TH)
  const total = items.reduce((s, i) => s + i.verdi, 0)
  const andel = (v) => (total ? (v / total) * 100 : 0)

  return (
    <svg
      viewBox={`0 0 ${TW} ${TH}`}
      width="100%"
      style={{ display: 'block' }}
      role="img"
      aria-label={
        `Budsjettkart: ${merke} fordelt på ${items.length} områder. ` +
        items.slice(0, 5).map((i) => `${i.navn} ${belopMill(i.verdi)} kroner, ${pct(andel(i.verdi))}`).join('. ') +
        (items.length > 5 ? `. Og ${items.length - 5} mindre områder.` : '')
      }
    >
      {felt.map((f, i) => (
        <g
          key={f.node.i}
          style={{ cursor: f.kanNed ? 'pointer' : 'default' }}
          tabIndex={0}
          role={f.kanNed ? 'button' : 'img'}
          aria-label={`${f.navn}: ${belopMill(f.verdi)} kroner, ${pct(andel(f.verdi))} av ${merke.toLowerCase()}${f.kanNed ? '. Åpne for å se nivået under.' : ''}`}
          onMouseEnter={() => onHover(f.node)}
          onFocus={() => { setFokus(f.node.i); onHover(f.node) }}
          onBlur={() => setFokus(null)}
          onClick={() => f.kanNed && onVelg(f.node)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            if (f.kanNed) onVelg(f.node)
          }}
        >
          {/* Flisen er heldekkende. Den var tidligere dempet til 88 % i ro og
              full ved hover, men ftTonInn ender på opacity: 1 og overstyrer
              attributtet, så dempingen viste seg bare for dem som ber om
              redusert bevegelse – og da falt hvit tekst på flisen til 4,1:1.
              Hover markeres i stedet med et mørkt sjikt over flisen, som bare
              kan øke kontrasten mot teksten. */}
          <rect
            x={f.x + 0.5} y={f.y + 0.5}
            width={Math.max(0, f.w - 1)} height={Math.max(0, f.h - 1)}
            fill={PALETT[i % PALETT.length]}
            style={{ animation: `ftTonInn .5s ${i * 28}ms ease both` }}
          />
          <rect
            x={f.x + 0.5} y={f.y + 0.5}
            width={Math.max(0, f.w - 1)} height={Math.max(0, f.h - 1)}
            fill={INK}
            opacity={hover?.i === f.node.i ? 0.14 : 0}
            style={{ transition: 'opacity .25s', pointerEvents: 'none' }}
          />
          {fokus === f.node.i && (
            <>
              <rect
                x={f.x + 2.5} y={f.y + 2.5}
                width={Math.max(0, f.w - 5)} height={Math.max(0, f.h - 5)}
                fill="none" stroke={INK} strokeWidth={3} style={{ pointerEvents: 'none' }}
              />
              <rect
                x={f.x + 2.5} y={f.y + 2.5}
                width={Math.max(0, f.w - 5)} height={Math.max(0, f.h - 5)}
                fill="none" stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }}
              />
            </>
          )}
          {f.w > 74 && f.h > 34 && (
            <SvgTekst x={f.x + 10} y={f.y + 21} fill="#fff" size={f.w > 180 ? 13 : 11} weight={600}>
              {kutt(f.navn, Math.floor(f.w / 7))}
            </SvgTekst>
          )}
          {/* Beløpet var hvitt med 80 % dekkevne. Det er pent, men gjennomskinnet
              blander inn flisefargen, og kontrasten faller til 2,6–4,4:1 på over
              halvparten av flisene. Hierarkiet holdes i vekten i stedet, så
              fargen kan være heldekkende. */}
          {f.w > 74 && f.h > 52 && (
            <SvgTekst x={f.x + 10} y={f.y + 38} fill="#fff" size={10} weight={400}>
              {belopMill(f.verdi)} · {pct(total ? (f.verdi / total) * 100 : 0)}
            </SvgTekst>
          )}
          <title>{f.navn}</title>
        </g>
      ))}
    </svg>
  )
}
