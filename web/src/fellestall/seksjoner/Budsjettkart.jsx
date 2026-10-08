import React, { useState } from 'react'
import Treemap from '../grafer/Treemap'
import LinjeGraf from '../grafer/LinjeGraf'
import { KORT, OMTALE, NIVAANAVN, RUST, visNavn } from '../design'
import { verdi, barn, sumRot, perInnbygger } from '../kompakt'
import { belopMill, kr } from '../tall'
import { kartValg, kartHistorikk } from '../kartvalg'
import { oljeGrafSerier } from '../oljetall'

/** Maks antall flater før kartet blir uleselig – resten er for små å se */
const MAKS_FLATER = 40

/**
 * Hele budsjettet som ett kart. Hver flate er ett område, arealet er beløpet,
 * og et klikk går ett nivå ned: departement → kapittel → post.
 */
export default function Budsjettkart({ data, aar: globalAar, uRot, skjulFin }) {
  const [valg, setValg] = useState(null)
  const opsjoner = kartValg(data)
  const valgt = opsjoner.find((o) => o.aar === valg?.aar && o.si === valg?.si)
    ?? opsjoner.find((o) => o.aar === globalAar && o.si === 0) ?? opsjoner[0]
  const { aar, si, navn: serienavn } = valgt
  const aarValg = [...new Set(opsjoner.map((o) => o.aar))]
  const historikk = kartHistorikk(opsjoner, valgt)
  const aarListe = historikk.map((o) => o.aar)
  const totalUtg = sumRot(uRot, aar, si)
  const folk = data.befolkning?.[aar] ?? data.prisvekstAnslag?.befolkning?.[aar]
  const folkAnslag = !data.befolkning?.[aar] && folk > 0
  const [sti, setSti] = useState([])
  const [hover, setHover] = useState(null)

  const nivaa = sti.length ? barn(sti[sti.length - 1], skjulFin) : uRot
  const items = nivaa
    .map((n) => ({ node: n, verdi: verdi(n, aar, si), navn: visNavn(n), kanNed: barn(n, skjulFin).length > 0 }))
    .filter((i) => i.verdi > 0)
    .sort((a, b) => b.verdi - a.verdi)
    .slice(0, MAKS_FLATER)

  // Panelet viser det man peker på, ellers nivået man står på, ellers totalen
  const info = hover ?? sti[sti.length - 1] ?? null
  const infoVerdi = info ? verdi(info, aar, si) : totalUtg
  const grafRader = historikk.map((o) => ({ ...o, budsjett: o.si !== 0,
    belop: info ? verdi(info, o.aar, o.si) : sumRot(uRot, o.aar, o.si) }))

  const infoTekst = info
    ? OMTALE[info.i] ||
      [info.om, info.ka].filter(Boolean).join(' › ') ||
      info.pt ||
      `Del av ${sti[sti.length - 1]?.n ?? 'statens utgifter'}.`
    : `${skjulFin ? 'Utgifter utenom finanstransaksjoner og overføringen til Oljefondet.' : 'Utgifter inkludert finanstransaksjoner og overføringen til Oljefondet.'} Hold musepekeren over en flate for detaljer.`

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
          <h2>Statens utgifter på ett kart</h2>
          <p>
            Kartet viser {serienavn.toLowerCase()} for {aar}, i løpende kroner.
            Velg år og tallgrunnlag for å utforske regnskap og de ulike budsjettformene.
            Hver flates størrelse viser beløpet. Klikk for å gå ett nivå ned –
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

      <div className="ft-velgerpar ft-kart-valg">
        <label className="ft-velger">
          <span className="ft-velgerlabel">År</span>
          <select aria-label="År" className="ft-select" value={aar} onChange={(e) => {
            const y = Number(e.target.value)
            setValg(opsjoner.find((o) => o.aar === y && o.si === si)
              ?? opsjoner.find((o) => o.aar === y && o.si === 0)
              ?? opsjoner.find((o) => o.aar === y && o.si === 2)
              ?? opsjoner.find((o) => o.aar === y))
            setSti([]); setHover(null)
          }}>
            {aarValg.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="ft-velger">
          <span className="ft-velgerlabel">Tallgrunnlag</span>
          <select aria-label="Tallgrunnlag" className="ft-select" value={si} onChange={(e) => {
            setValg({ aar, si: Number(e.target.value) }); setSti([]); setHover(null)
          }}>
            {opsjoner.filter((o) => o.aar === aar).map((o) => <option key={o.si} value={o.si}>{o.navn}</option>)}
          </select>
        </label>
      </div>

      <div className="ft-kart-grid">
        <div className="ft-kart-flate">
          <Treemap
            items={items}
            merke={`${serienavn} ${aar}`}
            hover={hover}
            onHover={setHover}
            onVelg={(node) => { setSti([...sti, node]); setHover(node) }}
          />
        </div>
        <aside className="ft-kort ft-kart-panel">
          <div className="ft-stikkord">{serienavn} {aar} · {info ? (NIVAANAVN[info.l] ?? '') : 'Alle utgifter'}</div>
          <div className="ft-kort-tittel">{info ? visNavn(info) : 'Statens samlede utgifter'}</div>
          <div className="ft-kort-belop num">{belopMill(infoVerdi)}</div>
          {folk > 0 && <div className="ft-kort-under num">{kr(perInnbygger(infoVerdi, folk))} per innbygger{folkAnslag ? ' (SSBs befolkningsanslag)' : ''}</div>}
          <hr className="ft-skille" />
          <p className="ft-kort-tekst">{infoTekst}</p>
          <div className="ft-kort-graf">
            <LinjeGraf
              serier={oljeGrafSerier(grafRader, 'belop', RUST)}
              beskrivelse={`Utvikling for ${info ? visNavn(info) : 'alle utgifter'}, regnskap og budsjetter i millioner kroner. Valgt tallgrunnlag: ${serienavn} ${aar}`}
              tips={(i) => ({
                tittel: `${grafRader[i].aar} · ${grafRader[i].navn}`,
                linjer: [{ farge: RUST, tekst: `${belopMill(grafRader[i].belop)} kr` }],
              })}
              aar={aarListe}
              W={236}
              H={110}
            />
          </div>
          <div className="ft-kort-fot">
            Utvikling {aarListe[0]}–{aarListe[aarListe.length - 1]}. Heltrukket: regnskap.
            Stiplet: budsjett. Valgt år viser {serienavn.toLowerCase()}; øvrige år viser
            regnskap eller siste tilgjengelige budsjett. Pek på grafen for år og tallgrunnlag.
          </div>
        </aside>
      </div>
    </section>
  )
}
