import React from 'react'
import Sankey from '../grafer/Sankey'
import { RUST, GULL, BLAA, kapNr, visNavn } from '../design'
import { verdi } from '../kompakt'

/** Kapitlene som er store nok til å stå med eget navn i flyten */
const STORE = new Set(['5501', '5521', '5700'])

/** Så mange departementer vises hver for seg; resten samles i én strøm */
const MAKS_MOTTAKERE = 9

/**
 * Fra inntekt til utgift. Skatter og avgifter dekker ikke hele regningen –
 * differansen er den regelstyrte overføringen fra Oljefondet.
 */
export default function Flyten({ inntektsbilde, uRot, aar }) {
  const { skattKapitler, andreInntekter, fondUt } = inntektsbilde

  let andreSkatter = 0
  const kilder = []
  for (const k of skattKapitler) {
    if (STORE.has(kapNr(k.node.t))) kilder.push({ navn: k.node.n, mill: k.mill, farge: BLAA })
    else andreSkatter += k.mill
  }
  if (andreSkatter > 0) kilder.push({ navn: 'Andre skatter og avgifter', mill: andreSkatter, farge: '#5F7A3E' })
  if (andreInntekter > 0) kilder.push({ navn: 'Gebyrer, renter og utbytte', mill: andreInntekter, farge: '#6B6A66' })
  if (fondUt > 0) kilder.push({ navn: 'Overføring fra Oljefondet', mill: fondUt, farge: GULL })
  kilder.sort((a, b) => b.mill - a.mill)

  const alle = uRot
    .map((n) => ({ navn: visNavn(n), mill: verdi(n, aar), farge: RUST }))
    .filter((m) => m.mill > 0)
    .sort((a, b) => b.mill - a.mill)
  const mottakere = alle.slice(0, MAKS_MOTTAKERE)
  const rest = alle.slice(MAKS_MOTTAKERE).reduce((s, m) => s + m.mill, 0)
  if (rest > 0) mottakere.push({ navn: 'Øvrige departementer', mill: rest, farge: '#96442D' })

  if (!kilder.length || !mottakere.length) return null

  return (
    <section id="flyten" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h2>Fra inntekt til utgift</h2>
          <p>
            Skatter og avgifter dekker ikke hele regningen. Differansen hentes fra Oljefondet.
            Til høyre går pengene ut igjen, fordelt på departementene.
          </p>
        </div>
      </div>
      <div className="ft-kort ft-sankey">
        <Sankey kilder={kilder} mottakere={mottakere} />
      </div>
    </section>
  )
}
