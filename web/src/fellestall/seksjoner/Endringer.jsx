import React, { useState } from 'react'
import Vannfall from '../grafer/Vannfall'
import { visNavn } from '../design'
import { verdi, barn, perInnbygger } from '../kompakt'
import { belopMill, kr, pct } from '../tall'

const SERIENAVN = ['Regnskap', 'Saldert budsjett', 'Revidert budsjett']

/** Endringer under en million kroner er støy på dette nivået */
const TERSKEL = 1

/**
 * Hva som økte og hva som ble kuttet mellom to valgte tall – to regnskapsår,
 * eller regnskap mot budsjett. Vannfallet viser hvordan de største bevegelsene
 * bygger opp den samlede endringen, og kan brytes ned nivå for nivå.
 */
export default function Endringer({ data, aar, uRot, skjulFin, onAapneUtforsk }) {
  const [fraValg, setFraValg] = useState(null)
  const [tilValg, setTilValg] = useState(null)
  const [sti, setSti] = useState([])
  const [rest, setRest] = useState(null)

  // Bare kombinasjoner av år og serie som faktisk har tall
  const opsjoner = []
  for (const y of data.meta.budsjett_aar) {
    for (let si = 0; si < 3; si++) {
      if (uRot.some((n) => verdi(n, y, si) !== 0)) {
        opsjoner.push({ verdi: `${y}:${si}`, navn: `${SERIENAVN[si]} ${y}`, aar: y, si })
      }
    }
  }
  if (opsjoner.length < 2) return null

  const finn = (v, standard) => opsjoner.find((o) => o.verdi === v) ?? standard
  const fra = finn(fraValg, opsjoner.find((o) => o.verdi === `${aar - 1}:0`) ?? opsjoner[0])
  const til = finn(tilValg, opsjoner.find((o) => o.verdi === `${aar}:0`) ?? opsjoner[opsjoner.length - 1])

  let noder = sti.length ? barn(sti[sti.length - 1], skjulFin) : uRot
  if (rest) noder = noder.filter((n) => rest.includes(n.i))

  const endr = noder
    .map((n) => {
      const na = verdi(n, til.aar, til.si)
      const da = verdi(n, fra.aar, fra.si)
      return { node: n, navn: visNavn(n), delta: na - da, pct: da ? ((na - da) / Math.abs(da)) * 100 : null }
    })
    .filter((r) => Math.abs(r.delta) >= TERSKEL)
    .sort((a, b) => b.delta - a.delta)

  const folkTil = data.befolkning?.[til.aar] ?? data.befolkning?.[aar]

  const drill = (node, nyRest) => {
    if (nyRest) { setRest(nyRest.map((n) => n.i)); return }
    if (barn(node, skjulFin).length) { setSti([...sti, node]); setRest(null) }
    else onAapneUtforsk('utgifter', [...sti, node])
  }

  const smuler = [
    { navn: 'Alle områder', aktiv: !sti.length && !rest, klikk: () => { setSti([]); setRest(null) } },
    ...sti.map((n, i) => ({
      navn: visNavn(n),
      aktiv: i === sti.length - 1 && !rest,
      klikk: () => { setSti(sti.slice(0, i + 1)); setRest(null) },
    })),
    ...(rest ? [{ navn: 'Øvrige', aktiv: true, klikk: () => {} }] : []),
  ]

  const rad = (r, opp) => (
    <button key={r.node.i} type="button" className="ft-endrrad" onClick={() => drill(r.node)}>
      <span className="ft-endrnavn">{r.navn}</span>
      <span className="ft-endrtall">
        <span>
          <span className={`num ft-endrdelta ${opp ? 'opp' : 'ned'}`}>
            {(opp ? '+' : '') + kr(perInnbygger(r.delta, folkTil))}
          </span>
          {r.pct != null && <span className="ft-endrpct num">{(opp ? '+' : '') + pct(r.pct, 1)}</span>}
        </span>
        <span className="ft-endrmrd num">{(opp ? '+' : '−') + belopMill(Math.abs(r.delta))} kr</span>
      </span>
    </button>
  )

  const inneTekst = sti.length
    ? `${visNavn(sti[sti.length - 1])}: ${fra.navn.toLowerCase()} mot ${til.navn.toLowerCase()}. Klikk videre for å bryte ned enda et nivå.`
    : `${fra.navn} mot ${til.navn.charAt(0).toLowerCase() + til.navn.slice(1)}, i løpende kroner. Søylene viser hvordan de største bevegelsene bygger opp den samlede endringen. Klikk på et område for å utforske det.`

  return (
    <section id="endringer" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstopp">
        <div className="ft-seksjonstekst">
          <h2>Hva økte, hva ble kuttet</h2>
          <p>{inneTekst}</p>
        </div>
        <div className="ft-velgerpar">
          <label className="ft-velger">
            <span className="ft-velgerlabel">Fra</span>
            <select className="ft-select" value={fra.verdi} onChange={(e) => setFraValg(e.target.value)}>
              {opsjoner.map((o) => <option key={o.verdi} value={o.verdi}>{o.navn}</option>)}
            </select>
          </label>
          <span className="ft-velgermot">mot</span>
          <label className="ft-velger">
            <span className="ft-velgerlabel">Til</span>
            <select className="ft-select" value={til.verdi} onChange={(e) => setTilValg(e.target.value)}>
              {opsjoner.map((o) => <option key={o.verdi} value={o.verdi}>{o.navn}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="ft-smuler ft-smuler--flat">
        {smuler.map((b, i) => (
          <button key={i} type="button" className={`ft-smule ${b.aktiv ? 'aktiv' : ''}`} onClick={b.klikk}>
            {i > 0 && <span className="ft-smulepil">›</span>}
            {b.navn}
          </button>
        ))}
      </div>

      <div className="ft-grafflate">
        <Vannfall endr={endr} onDrill={drill} />
      </div>

      <div className="ft-endrkolonner">
        <div>
          <div className="ft-kolonnetittel opp">Økte mest</div>
          {endr.slice(0, 5).map((r) => rad(r, true))}
        </div>
        <div>
          <div className="ft-kolonnetittel ned">Ble kuttet mest</div>
          {endr.filter((r) => r.delta < 0).slice(-5).reverse().map((r) => rad(r, false))}
        </div>
      </div>
    </section>
  )
}
