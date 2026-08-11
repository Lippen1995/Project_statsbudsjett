import React, { useState } from 'react'
import Treemap from '../grafer/Treemap'
import LinjeGraf from '../grafer/LinjeGraf'
import { KORT, OMTALE, NIVAANAVN, RUST, visNavn } from '../design'
import { verdi, barn, sumRot, perInnbygger } from '../kompakt'
import { belopMill, kr } from '../tall'

/** Maks antall flater før kartet blir uleselig – resten er for små å se */
const MAKS_FLATER = 40

/**
 * Hele budsjettet som ett kart. Hver flate er ett område, arealet er beløpet,
 * og et klikk går ett nivå ned: departement → kapittel → post.
 */
export default function Budsjettkart({ data, aar, aarListe, uRot, totalUtg, skjulFin, folk }) {
  const [sti, setSti] = useState([])
  const [hover, setHover] = useState(null)

  const nivaa = sti.length ? barn(sti[sti.length - 1], skjulFin) : uRot
  const items = nivaa
    .map((n) => ({ node: n, verdi: verdi(n, aar), navn: visNavn(n), kanNed: barn(n, skjulFin).length > 0 }))
    .filter((i) => i.verdi > 0)
    .sort((a, b) => b.verdi - a.verdi)
    .slice(0, MAKS_FLATER)

  // Panelet viser det man peker på, ellers nivået man står på, ellers totalen
  const info = hover ?? sti[sti.length - 1] ?? null
  const infoVerdi = info ? verdi(info, aar) : totalUtg

  const infoTekst = info
    ? OMTALE[info.i] ||
      [info.om, info.ka].filter(Boolean).join(' › ') ||
      info.pt ||
      `Del av ${sti[sti.length - 1]?.n ?? 'statsbudsjettet'}.`
    : 'Utgifter utenom finanstransaksjoner og overføringen til Oljefondet. Hold musepekeren over en flate for detaljer.'

  const smuler = [
    { navn: 'Alle utgifter', aktiv: sti.length === 0, klikk: () => { setSti([]); setHover(null) } },
    ...sti.map((n, i) => ({
      navn: KORT[n.i] ?? n.t ?? n.n,
      aktiv: i === sti.length - 1,
      klikk: () => { setSti(sti.slice(0, i + 1)); setHover(null) },
    })),
  ]

  return (
    <section id="kartet" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstopp ft-seksjonstopp--bunn">
        <div className="ft-seksjonstekst">
          <h2>Hele budsjettet på ett kart</h2>
          <p>
            Hver flate er ett område. Størrelsen er beløpet i {aar}. Klikk for å gå ett nivå ned –
            departement, kapittel, post.
          </p>
        </div>
        <div className="ft-smuler">
          {smuler.map((b, i) => (
            <button
              key={i}
              type="button"
              className={`ft-pille ${b.aktiv ? 'aktiv' : ''}`}
              onClick={b.klikk}
            >
              {b.navn}
            </button>
          ))}
        </div>
      </div>

      <div className="ft-kart-grid">
        <div className="ft-kart-flate">
          <Treemap
            items={items}
            hover={hover}
            onHover={setHover}
            onVelg={(node) => { setSti([...sti, node]); setHover(node) }}
          />
        </div>
        <aside className="ft-kort ft-kart-panel">
          <div className="ft-stikkord">{info ? (NIVAANAVN[info.l] ?? '') : 'Alle utgifter'}</div>
          <div className="ft-kort-tittel">{info ? visNavn(info) : 'Statens samlede utgifter'}</div>
          <div className="ft-kort-belop num">{belopMill(infoVerdi)}</div>
          <div className="ft-kort-under num">{kr(perInnbygger(infoVerdi, folk))} per innbygger</div>
          <hr className="ft-skille" />
          <p className="ft-kort-tekst">{infoTekst}</p>
          <div className="ft-kort-graf">
            <LinjeGraf
              serier={[{
                farge: RUST,
                punkter: aarListe.map((y) => ({ v: info ? verdi(info, y) : sumRot(uRot, y) })),
              }]}
              aar={aarListe}
              W={236}
              H={80}
            />
          </div>
          <div className="ft-kort-fot">Utvikling {aarListe[0]}–{data.meta.siste_regnskap_aar}</div>
        </aside>
      </div>
    </section>
  )
}
