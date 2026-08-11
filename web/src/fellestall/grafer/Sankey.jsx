import React from 'react'
import SvgTekst, { kutt } from './SvgTekst'
import { INK, BLEK, PAPIR } from '../design'
import { belopMill } from '../tall'

const W = 1080, H = 520, KOL = 190, MIDT_B = 92, PAD = 6

/** Høyden på hvert bånd, proporsjonal med beløpet, med luft mellom båndene */
function skaler(arr, total) {
  const tilgjengelig = H - PAD * (arr.length - 1)
  return arr.map((a) => ({ ...a, h: Math.max(3, (a.mill / total) * tilgjengelig) }))
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
export default function Sankey({ kilder, mottakere }) {
  const totalK = kilder.reduce((s, k) => s + k.mill, 0)
  const totalM = mottakere.reduce((s, m) => s + m.mill, 0)
  const K = skaler(kilder, totalK)
  const M = skaler(mottakere, totalM)
  const midtX = W / 2 - 46
  const barn = []

  barn.push(<rect key="midt" x={midtX} y={0} width={MIDT_B} height={H} fill={INK} />)
  barn.push(
    <SvgTekst key="m1" x={midtX + MIDT_B / 2} y={H / 2 - 8} fill={PAPIR} size={15} weight={700} anchor="middle" serif>
      Stats-
    </SvgTekst>
  )
  barn.push(
    <SvgTekst key="m2" x={midtX + MIDT_B / 2} y={H / 2 + 10} fill={PAPIR} size={15} weight={700} anchor="middle" serif>
      budsjettet
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

  let ky = 0, midtVenstre = 0
  K.forEach((k, i) => {
    barn.push(band(KOL, ky, k.h, midtX, midtVenstre, k.h, k.farge, `bk${i}`))
    barn.push(<rect key={`rk${i}`} x={KOL - 8} y={ky} width={8} height={k.h} fill={k.farge} />)
    barn.push(...merk('v', ky, k.h, k.navn, k.mill, i))
    ky += k.h + PAD
    midtVenstre += k.h
  })

  let my = 0, midtHoyre = 0
  M.forEach((m, i) => {
    barn.push(band(midtX + MIDT_B, midtHoyre, m.h, W - KOL, my, m.h, m.farge, `bm${i}`))
    barn.push(<rect key={`rm${i}`} x={W - KOL} y={my} width={8} height={m.h} fill={m.farge} />)
    barn.push(...merk('h', my, m.h, m.navn, m.mill, i))
    my += m.h + PAD
    midtHoyre += m.h
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {barn}
    </svg>
  )
}
