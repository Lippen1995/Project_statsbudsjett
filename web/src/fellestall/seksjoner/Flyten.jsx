import React, { useState } from 'react'
import Sankey from '../grafer/Sankey'
import { RUST, visNavn } from '../design'
import { barn, rot } from '../kompakt'
import { kartValg } from '../kartvalg'
import { belopMill, pct } from '../tall'
import { flytKilder, flytRader, flytOmrade } from '../flyttall'

export default function Flyten({ data, aar: globalAar, skjulFin }) {
  const [valg, setValg] = useState(null)
  const [utSti, setUtSti] = useState([])
  const opsjoner = kartValg(data)
  const valgt = opsjoner.find((o) => o.aar === valg?.aar && o.si === valg?.si)
    ?? opsjoner.find((o) => o.aar === globalAar && o.si === 0) ?? opsjoner[0]
  const { aar, si, navn } = valgt
  const aarValg = [...new Set(opsjoner.map((o) => o.aar))]
  const fokus = utSti.at(-1)
  const omrade = fokus ? flytOmrade(data, fokus, aar, si, skjulFin) : null
  const kilder = omrade?.kilder ?? flytRader(flytKilder(data, skjulFin), aar, si, skjulFin)
  const under = fokus ? barn(fokus, skjulFin) : rot(data, 'utgifter', skjulFin)
  const mottakere = flytRader(under.length ? under : [fokus], aar, si, skjulFin, RUST)
    .map((r) => ({ ...r, kanNed: r.node.i !== fokus?.i }))
  if (omrade?.rest < 0) mottakere.push({ navn: 'Netto til felles finansiering', mill: -omrade.rest,
    farge: '#6B6A66', kanNed: false })
  if (omrade?.tilbakebetaling > 0) mottakere.push({ navn: 'Tilbakebetaling av områdeinntekter', mill: omrade.tilbakebetaling,
    farge: '#6B6A66', kanNed: false })
  const bytt = (o) => { setValg(o); setUtSti([]) }
  return (
    <section id="flyten" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h2>Fra inntekt til utgift</h2>
          <p>
            Figuren viser {navn.toLowerCase()} for {aar}, i løpende kroner.
            Til venstre ser du skatter, andre inntekter og overføringen fra Oljefondet;
            til høyre statens utgifter. Klikk på en utgift for å se kapitler og poster –
            inntektssiden følger området du åpner. Bruk knappene over figuren for å gå tilbake.
          </p>
        </div>
      </div>
      <div className="ft-velgerpar ft-kart-valg">
        <label className="ft-velger">
          <span className="ft-velgerlabel">År</span>
          <select aria-label="År" className="ft-select" value={aar} onChange={(e) => {
            const y = Number(e.target.value)
            bytt(opsjoner.find((o) => o.aar === y && o.si === si)
              ?? opsjoner.find((o) => o.aar === y && o.si === 0)
              ?? opsjoner.find((o) => o.aar === y && o.si === 2)
              ?? opsjoner.find((o) => o.aar === y))
          }}>{aarValg.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label className="ft-velger">
          <span className="ft-velgerlabel">Tallgrunnlag</span>
          <select aria-label="Tallgrunnlag" className="ft-select" value={si} onChange={(e) => bytt({ aar, si: Number(e.target.value) })}>
            {opsjoner.filter((o) => o.aar === aar).map((o) => <option key={o.si} value={o.si}>{o.navn}</option>)}
          </select>
        </label>
      </div>
      <div className="ft-smuler ft-flyt-nav">
        <button type="button" className={`ft-pille ${!fokus ? 'aktiv' : ''}`} onClick={() => setUtSti([])}>Hele staten</button>
        {utSti.map((n, i) => <button type="button" key={`${n.i}-${i}`} className={`ft-pille ${i === utSti.length - 1 ? 'aktiv' : ''}`} onClick={() => setUtSti(utSti.slice(0, i + 1))}>{visNavn(n)}</button>)}
      </div>
      {omrade && <div className="ft-flyt-oppsummering" aria-live="polite">
        <strong>{visNavn(fokus)}</strong> · Utgifter{omrade.kreditering > 0 ? ' (netto)' : ''}: {belopMill(omrade.utgift)} kr.
        {' '}Inntekter på området{omrade.avgiftsAndel > 0 ? ' og beregnet avgiftsandel' : ''}: {belopMill(omrade.inntekt)} kr.
        {' '}{omrade.rest >= 0 ? 'Felles finansiering' : 'Netto til felles finansiering'}: {belopMill(Math.abs(omrade.rest))} kr.
      </div>}
      <div className="ft-flyt-smuler">
        <div className="ft-stikkord">{fokus ? 'Inntekter og finansiering på området' : 'Inntekter'}</div>
        <div className="ft-stikkord">{fokus ? `Utgifter · ${visNavn(fokus)}` : 'Utgifter'}</div>
      </div>
      <div className="ft-sankey">
        {kilder.length && mottakere.length ? <Sankey
          kilder={kilder} mottakere={mottakere}
          midtLabel={si === 0 ? 'Regnskap' : 'Budsjett'} aar={aar} tallgrunnlag={navn}
          balansert={Boolean(omrade)}
          onMottaker={(node) => setUtSti([...utSti, node])}
        /> : <p>Ingen positive beløp på dette nivået for {navn.toLowerCase()} {aar}.</p>}
      </div>
      <p className="ft-brodtekst">
        {omrade
          ? 'Inntekter på samme departement eller tilhørende inntektskapittel vises sammen med utgiftene. Resten vises som felles finansiering fra skatter og Oljefondet. Restposten er et beregnet finansieringsbehov, ikke et bokført underskudd eller en dokumentert øremerking.'
          : 'Klikk på en utgift for å se områdets inntekter og behov for felles finansiering. I oversikten skaleres inntekter og utgifter hver for seg; innenfor et valgt område summerer begge sider til samme beløp.'}
        {omrade?.avgiftsAndel > 0 && <> Trygde- og arbeidsgiveravgift er fordelt etter områdets andel av de samlede folketrygdutgiftene (kapittel 2500–2799): {pct(omrade.avgiftsAndel * 100, 1)}. Dette er en beregnet fordeling, ikke inntekter bokført på hver ytelse.</>}
        {(omrade?.kreditering > 0 || omrade?.tilbakebetaling > 0) && ' Negative utgifter vises som inntektsføring på venstre side, og negative områdeinntekter som tilbakebetaling på høyre side. Oppsummeringen viser nettobeløp.'}
        {omrade?.fordeltPost && ' På postnivå fordeles inntekter fra tilhørende kapittel etter postens andel av kapittelets utgifter; like postnumre brukes ikke som kobling.'}
        {skjulFin ? ' Finanstransaksjoner og overføringen til Oljefondet er utelatt fra utgiftene.' : ''}
      </p>
    </section>
  )
}
