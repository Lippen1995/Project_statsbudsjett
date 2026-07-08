import React, { useState, useMemo } from 'react'
import { partiFarge, partiKort } from '../lib/partier'
import './Stortinget.css'

/**
 * Stortingets behandling av budsjettet: budsjettsaker per sesjon, med
 * voteringer og partifordeling (for/mot). Skjules helt hvis politikk mangler.
 */
export default function Stortinget({ politikk }) {
  const sesjoner = useMemo(
    () => politikk ? Object.keys(politikk).sort().reverse() : [],
    [politikk]
  )
  const [valgtSesjon, setValgtSesjon] = useState(sesjoner[0] ?? null)
  const [apenSak, setApenSak] = useState(null)

  if (!politikk || sesjoner.length === 0) return null

  const sesjon = valgtSesjon ?? sesjoner[0]
  const saker = politikk[sesjon] ?? []

  return (
    <section className="panel stortinget-panel">
      <div className="st-header">
        <div>
          <h2 className="st-tittel">Stortingets behandling av budsjettet</h2>
          <p className="st-undertittel">
            Hvordan partiene stemte · kilde: data.stortinget.no
          </p>
        </div>
        <label className="st-sesjonvelger">
          Sesjon
          <select value={sesjon} onChange={e => { setValgtSesjon(e.target.value); setApenSak(null) }}>
            {sesjoner.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {saker.length === 0 && (
        <p className="st-tom">Ingen budsjettsaker registrert for {sesjon}.</p>
      )}

      <div className="st-saker">
        {saker.map(sak => {
          const apen = apenSak === sak.id
          const antallVot = sak.voteringer?.length ?? 0
          return (
            <div key={sak.id} className="st-sak">
              <button
                className="st-sak-header"
                onClick={() => setApenSak(apen ? null : sak.id)}
                aria-expanded={apen}
              >
                <span className="st-sak-pil">{apen ? '▾' : '▸'}</span>
                <span className="st-sak-tittel">{sak.tittel}</span>
                <span className="st-sak-antall">{antallVot} voteringer</span>
              </button>
              {apen && (
                <div className="st-voteringer">
                  {antallVot === 0 && <p className="st-tom">Ingen voteringer.</p>}
                  {sak.voteringer.map(v => (
                    <Votering key={v.votering_id} v={v} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Votering({ v }) {
  const forParter = Object.entries(v.parti_for ?? {}).sort((a, b) => b[1] - a[1])
  const motParter = Object.entries(v.parti_mot ?? {}).sort((a, b) => b[1] - a[1])
  const total = (v.antall_for ?? 0) + (v.antall_mot ?? 0)
  const forAndel = total ? ((v.antall_for ?? 0) / total) * 100 : 0
  const harFordeling = forParter.length || motParter.length

  return (
    <div className="st-votering">
      <div className="st-vot-topp">
        <span className="st-vot-tema">{v.tema || 'Votering'}</span>
        <span className={`st-vedtatt ${v.vedtatt ? 'ja' : 'nei'}`}>
          {v.vedtatt ? 'Vedtatt' : 'Falt'}
        </span>
      </div>

      {v.akklamasjon ? (
        <p className="st-akklamasjon">Avgjort ved akklamasjon (ingen opptelling)</p>
      ) : (
        <>
          <div className="st-bar" role="img"
            aria-label={`${v.antall_for} for, ${v.antall_mot} mot`}>
            <div className="st-bar-for" style={{ width: `${forAndel}%` }} />
            <div className="st-bar-mot" style={{ width: `${100 - forAndel}%` }} />
          </div>
          <div className="st-bar-tall num">
            <span className="st-for">{v.antall_for ?? 0} for</span>
            <span className="st-mot">{v.antall_mot ?? 0} mot</span>
          </div>
        </>
      )}

      {!v.akklamasjon && (harFordeling ? (
        <div className="st-partier">
          <div className="st-parti-kol">
            <span className="st-kol-tittel">For</span>
            {forParter.map(([p, n]) => <PartiChip key={p} parti={p} antall={n} />)}
            {!forParter.length && <span className="st-ingen">–</span>}
          </div>
          <div className="st-parti-kol">
            <span className="st-kol-tittel">Mot</span>
            {motParter.map(([p, n]) => <PartiChip key={p} parti={p} antall={n} />)}
            {!motParter.length && <span className="st-ingen">–</span>}
          </div>
        </div>
      ) : (
        <p className="st-ingen-fordeling">Partifordeling ikke tilgjengelig (reconcilerte ikke)</p>
      ))}
    </div>
  )
}

function PartiChip({ parti, antall }) {
  return (
    <span className="st-parti-chip" title={`${parti}: ${antall}`}>
      <span className="st-parti-dot" style={{ background: partiFarge(parti) }} />
      {partiKort(parti)} <span className="st-parti-n num">{antall}</span>
    </span>
  )
}
