import React from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { INK, BLEK, PAPIR } from '../design'
import { belopMill } from '../tall'

const W = 1080, H = 520, KOL = 190, MIDT_B = 92, PAD = 6

/** Høyden på hvert bånd, proporsjonal med beløpet, med luft mellom båndene */
function skaler(arr, total, fellesPlass = null) {
  const tilgjengelig = fellesPlass ?? H - PAD * (arr.length - 1)
  return arr.map((a) => ({ ...a, h: Math.max(fellesPlass == null ? 3 : 0, (a.mill / total) * tilgjengelig) }))
}

/** Ett bånd fra venstre til høyre, som en kubisk kurve med rett venstre- og høyrekant */
function band(x1, y1, h1, x2, y2, h2, farge, key) {
  const cx = (x1 + x2) / 2
  return (
    <path
      key={key}
      fill={farge}
      opacity={0.34}
      style={{ animation: 'ftTonInn .9s ease both' }}
      d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${cx},${y2 + h2} ${cx},${y1 + h1} ${x1},${y1 + h1} Z`}
    />
  )
}

/**
 * Inntektskilder til venstre, statsbudsjettet i midten, departementene til
 * høyre. Båndene er skalert hver for seg på sin side: begge sider fyller hele
 * høyden, slik at fordelingen innenfor hver side er det man sammenligner.
 */
export default function Sankey({ kilder, mottakere, midtLabel = 'Regnskap', aar, tallgrunnlag, onKilde, onMottaker, balansert = false }) {
  const totalK = kilder.reduce((s, k) => s + k.mill, 0)
  const totalM = mottakere.reduce((s, m) => s + m.mill, 0)
  const total = Math.max(totalK, totalM)
  const fellesPlass = balansert ? H - PAD * (Math.max(kilder.length, mottakere.length) - 1) : null
  const K = skaler(kilder, balansert ? total : totalK, fellesPlass)
  const M = skaler(mottakere, balansert ? total : totalM, fellesPlass)
  const midtX = W / 2 - 46
  const barn = []

  barn.push(<rect key="midt" x={midtX} y={0} width={MIDT_B} height={H} fill={INK} />)
  barn.push(
    <SvgTekst key="m1" x={midtX + MIDT_B / 2} y={H / 2 - 8} fill={PAPIR} size={15} weight={700} anchor="middle" serif>
      {midtLabel}
    </SvgTekst>
  )
  barn.push(
    <SvgTekst key="m2" x={midtX + MIDT_B / 2} y={H / 2 + 10} fill={PAPIR} size={15} weight={700} anchor="middle" serif>
      {aar}
    </SvgTekst>
  )

  /**
   * Navn og beløp på to linjer krever et bånd som er høyt nok. Er båndet
   * tynnere, settes navn og beløp på én linje – ellers kolliderer labelene til
   * nabobåndene.
   */
  const TO_LINJER = 30

  const merk = (side, y, h, navn, mill, i) => {
    const høyre = side === 'h'
    const x = høyre ? W - KOL + 16 : KOL - 16
    const anchor = høyre ? 'start' : 'end'
    const nøkkel = høyre ? 'm' : 'k'
    if (h >= TO_LINJER) {
      return [
        <SvgTekst key={`t${nøkkel}${i}`} x={x} y={y + h / 2 - 4} anchor={anchor} size={12} weight={600}>
          {kutt(navn, 30)}
        </SvgTekst>,
        <SvgTekst key={`v${nøkkel}${i}`} x={x} y={y + h / 2 + 11} anchor={anchor} size={10} fill={BLEK}>
          {belopMill(mill)} kr
        </SvgTekst>,
      ]
    }
    return [
      <SvgTekst key={`t${nøkkel}${i}`} x={x} y={y + h / 2 + 4} anchor={anchor} size={11} weight={600}>
        {kutt(navn, 24)} <tspan fill={BLEK} fontWeight={500}>{belopMill(mill)}</tspan>
      </SvgTekst>,
    ]
  }

  // Et lite beløp skal ha riktig båndbredde uten at teksten kolliderer med naboen.
  const etiketter = (rader) => {
    let y = 0, forrige = -Infinity
    const labels = rader.map((r) => {
      const halv = r.h >= TO_LINJER ? 15 : 9
      const sentrum = y + r.h / 2
      const pos = Math.max(sentrum, forrige + halv)
      forrige = pos + halv
      y += r.h + PAD
      return { sentrum, pos, halv }
    })
    let slutt = H
    for (let i = labels.length - 1; i >= 0; i--) {
      labels[i].pos = Math.min(labels[i].pos, slutt - labels[i].halv)
      slutt = labels[i].pos - labels[i].halv
    }
    return labels
  }
  const kLabels = etiketter(K), mLabels = etiketter(M)
  const felt = (r, i, side, y, midtY) => {
    const inn = side === 'v'
    const aapne = inn ? onKilde : onMottaker
    const klikkbar = r.kanNed && aapne
    const label = (inn ? kLabels : mLabels)[i]
    return <g data-side={side} key={`${side}${r.node?.i ?? i}`} role={klikkbar ? 'button' : 'img'}
      tabIndex={klikkbar ? 0 : undefined}
      aria-label={`${r.navn}: ${belopMill(r.mill)} kroner${klikkbar ? '. Åpne kapitler og poster.' : ''}`}
      className={klikkbar ? 'ft-sankey-node' : undefined}
      onClick={() => klikkbar && aapne(r.node)}
      onKeyDown={(e) => {
        if (klikkbar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); aapne(r.node) }
      }}>
      <title>{r.navn}: {belopMill(r.mill)} kr{klikkbar ? ' – klikk for detaljer' : ''}</title>
      <rect x={inn ? 0 : midtX + MIDT_B} y={y} width={inn ? midtX : W - midtX - MIDT_B} height={r.h} fill="transparent" />
      {inn ? band(KOL, y, r.h, midtX, midtY, r.h, r.farge, `b${side}${i}`)
        : band(midtX + MIDT_B, midtY, r.h, W - KOL, y, r.h, r.farge, `b${side}${i}`)}
      <rect x={inn ? KOL - 8 : W - KOL} y={y} width={8} height={r.h} fill={r.farge} />
      {Math.abs(label.pos - label.sentrum) > 2 && <line
        x1={inn ? KOL - 8 : W - KOL + 8} y1={label.sentrum}
        x2={inn ? KOL - 13 : W - KOL + 13} y2={label.pos}
        stroke={BLEK} strokeWidth={.7} style={{ pointerEvents: 'none' }} />}
      {merk(side, label.pos - r.h / 2, r.h, r.kortnavn ?? r.navn, r.mill, i)}
    </g>
  }
  let ky = 0, midtVenstre = 0
  K.forEach((k, i) => {
    barn.push(felt(k, i, 'v', ky, midtVenstre))
    ky += k.h + PAD
    midtVenstre += k.h
  })
  let my = 0, midtHoyre = 0
  M.forEach((m, i) => {
    barn.push(felt(m, i, 'h', my, midtHoyre))
    my += m.h + PAD
    midtHoyre += m.h
  })

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      role="group"
      aria-label={
        `Flyt fra inntekt til utgift. ${tallgrunnlag} ${aar}. Inn: ` +
        kilder.map((k) => `${k.navn} ${belopMill(k.mill)} kroner`).join(', ') +
        '. Ut: ' + mottakere.map((m) => `${m.navn} ${belopMill(m.mill)} kroner`).join(', ') + '.'
      }
    >
      {barn}
    </svg>
  )
}
