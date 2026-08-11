import React from 'react'
import LinjeGraf from '../grafer/LinjeGraf'
import StabletAreal from '../grafer/StabletAreal'
import { RUST, GRONN, BLEK, NIVAANAVN, visNavn } from '../design'
import { verdi, barn, rot, artskontoTre, detaljFil, sumRot } from '../kompakt'
import { belopMill, kr, pct, n0, n1 } from '../tall'

const SERIER = ['Regnskap', 'Saldert budsjett', 'Revidert budsjett']

/** Kortere søk enn dette gir for mange treff til å være nyttig */
const MIN_SOK = 2
const MAKS_TREFF = 60

/** Så mange serier får plass i arealgrafen før den blir grøt */
const MAKS_AREAL = 7

/** Last ned radene som vises, semikolonseparert for norsk Excel */
function lastNedCSV(rader, filnavn, aar) {
  const linjer = [['navn', 'tag', 'niva', 'belop_mill_kr', 'aar'].join(';')].concat(
    rader.map((r) =>
      [r.node.n.replace(/;/g, ','), r.node.t ?? '', r.node.l, String(r.verdi).replace('.', ','), aar].join(';')
    )
  )
  // BOM slik at Excel leser æøå riktig
  const blob = new Blob(['﻿' + linjer.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filnavn
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * Analyseverktøyet: samme datagrunnlag uten forenklinger, fra departement ned
 * til artskonto. Tilstanden ligger i Fellestall, slik at de andre seksjonene
 * kan åpne verktøyet ferdig drillet på et område.
 */
export default function Utforsk({
  data, aarListe, globalAar, u, setU, skjulFin, setSkjulFin, detaljer, hentDetaljer,
}) {
  const si = [0, 1, 2].includes(u.serie) ? u.serie : 0
  const aar = data.meta.budsjett_aar.includes(u.aar) ? u.aar : globalAar
  const erUtg = u.side === 'utgifter'
  const folk = data.befolkning?.[aar] ?? data.befolkning?.[globalAar]

  const skaler = (v) => (u.modus === 'person' && folk ? (v * 1e6) / folk : v)
  const fmt = (v) => (u.modus === 'person' ? kr(Math.round(skaler(v))) : `${belopMill(v)} kr`)

  const rotN = rot(data, u.side, skjulFin)
  const sisteNode = u.sti.length ? u.sti[u.sti.length - 1] : null

  let gjeldende
  if (!sisteNode) gjeldende = rotN
  else if (sisteNode.l === 'p') gjeldende = artskontoTre(sisteNode, detaljer[detaljFil(sisteNode.i)])
  else gjeldende = barn(sisteNode, skjulFin)

  const venterDetaljer = sisteNode?.l === 'p' && !gjeldende.length
  const sok = u.sok.trim().toLowerCase()

  let rader
  if (sok.length >= MIN_SOK) {
    const treff = []
    const gaa = (node, sti) => {
      if (`${node.n} ${node.t ?? ''}`.toLowerCase().includes(sok)) treff.push({ node, sti })
      barn(node, skjulFin).forEach((k) => gaa(k, [...sti, node]))
    }
    rotN.forEach((n) => gaa(n, []))
    rader = treff
      .slice(0, MAKS_TREFF)
      .map((t) => ({ node: t.node, verdi: verdi(t.node, aar, si, skjulFin), sti: t.sti }))
      .sort((a, b) => Math.abs(b.verdi) - Math.abs(a.verdi))
  } else {
    rader = gjeldende
      .map((n) => ({ node: n, verdi: verdi(n, aar, si, skjulFin), sti: u.sti }))
      // Artskontonivået har mange rader nær null – de skjules for lesbarhet
      .filter((r) => sisteNode?.l !== 'p' || Math.abs(r.verdi) >= 0.05)
      .sort((a, b) => Math.abs(b.verdi) - Math.abs(a.verdi))
  }

  const total = rader.reduce((t, r) => t + r.verdi, 0)
  const maks = Math.max(...rader.map((r) => Math.abs(r.verdi)), 1)
  const farge = erUtg ? RUST : GRONN

  /**
   * Artskonto finnes bare i regnskapet, og en post uten detaljer skal ikke se
   * drillbar ut. harDetaljer fra ETL-en avgjør uten å måtte laste filen først.
   */
  const harArtskonto = (node) => {
    if (si !== 0) return false
    if (node.hd != null) return !!node.hd
    const det = detaljer[detaljFil(node.i)]
    return det === undefined ? true : !!det?.poster?.[node.i]
  }

  const velgRad = (r) => {
    const grunnSti = sok.length >= MIN_SOK ? r.sti : u.sti
    if (r.node.l === 'p') {
      setU({ fokus: r.node, sok: '', sti: grunnSti })
      if (si !== 0) return
      hentDetaljer(r.node.i).then((det) => {
        if (det?.poster?.[r.node.i]) setU({ sti: [...grunnSti, r.node], fokus: r.node })
      })
      return
    }
    const kanNed = (r.node.c?.length ?? 0) > 0
    setU({
      sti: kanNed || sok.length >= MIN_SOK ? [...grunnSti, r.node] : grunnSti,
      fokus: r.node,
      sok: '',
    })
  }

  const ental = rader.length === 1
  const enhet = !sisteNode
    ? 'departementer'
    : sisteNode.l === 'd' ? (ental ? 'kapittel' : 'kapitler')
    : sisteNode.l === 'k' ? (ental ? 'post' : 'poster')
    : sisteNode.l === 'p' ? (ental ? 'kontoklasse' : 'kontoklasser')
    : (ental ? 'artskonto' : 'artskontoer')

  const fokus = u.fokus ?? sisteNode
  const serieFor = (node, serieIdx) =>
    aarListe.map((y) => ({
      v: node ? verdi(node, y, serieIdx, skjulFin) : sumRot(rotN, y, serieIdx),
    }))
  const tilVisning = (punkter) => punkter.map((p) => ({ v: u.modus === 'person' ? skaler(p.v) : p.v }))

  const graf = [
    { farge: RUST, punkter: tilVisning(serieFor(fokus, 0)) },
    { farge: BLEK, bredde: 1.5, stiplet: true, punkter: tilVisning(serieFor(fokus, 1)) },
  ]
  if (u.pinnet) graf.push({ farge: GRONN, punkter: tilVisning(serieFor(u.pinnet, 0)) })

  const grafTittel = fokus ? visNavn(fokus) : erUtg ? 'Alle utgifter' : 'Alle inntekter'
  const grafFmt = (v) => (v == null ? '–' : u.modus === 'person' ? kr(Math.round(v)) : `${belopMill(v)} kr`)

  // Årlig vekstrate (geometrisk snitt) for regnskapsserien som vises
  const gp = graf[0].punkter
    .map((p, i) => ({ v: p.v, aar: aarListe[i] }))
    .filter((p) => p.v != null && p.v !== 0)
  let cagr = '–', cagrFarge = BLEK, cagrPeriode = ''
  if (gp.length > 1) {
    const f = gp[0], l = gp[gp.length - 1]
    const rate = (Math.pow(Math.abs(l.v) / Math.abs(f.v), 1 / (l.aar - f.aar)) - 1) * 100
    cagr = (rate >= 0 ? '+' : '−') + n1.format(Math.abs(rate)) + ' %'
    cagrFarge = rate >= 0 ? RUST : GRONN
    cagrPeriode = `${f.aar}–${l.aar}`
  }

  // Arealgrafen viser sammensetningen av nivået man står på, over hele perioden
  const arealNoder = (gjeldende.length ? gjeldende : rotN)
    .map((n) => ({ node: n, sum: aarListe.reduce((s, y) => s + verdi(n, y, 0, skjulFin), 0) }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, MAKS_AREAL)
    .map((t) => ({
      navn: visNavn(t.node),
      verdier: aarListe.map((y) => Math.max(0, verdi(t.node, y, 0, skjulFin))),
    }))

  const arealTekst =
    (u.sti.length
      ? `${sisteNode.t ?? sisteNode.n}${sisteNode.l === 'p' ? ' fordelt på artskonto' : ' fordelt på underposter'}`
      : erUtg ? 'Departementenes andel av utgiftene' : 'Inntektskildenes fordeling') +
    `, ${aarListe[0]}–${aarListe[aarListe.length - 1]}`

  const smuler = [
    { navn: erUtg ? 'Alle utgifter' : 'Alle inntekter', aktiv: !u.sti.length, klikk: () => setU({ sti: [], fokus: null }) },
    ...u.sti.map((n, i) => ({
      navn: n.t ?? n.n,
      aktiv: i === u.sti.length - 1,
      klikk: () => setU({ sti: u.sti.slice(0, i + 1), fokus: u.sti[i] }),
    })),
  ]

  return (
    <section id="utforsk" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h2>Utforsk hver krone</h2>
          <p>
            Samme datagrunnlag, uten forenklinger: departement → kapittel → post → artskonto. Velg om du
            vil se regnskapet eller budsjettet, søk på tvers, sammenlign to områder, og se utviklingen
            fra {aarListe[0]}.
          </p>
        </div>
      </div>

      <div className="ft-verktoylinje">
        <div className="ft-bytter">
          <button
            type="button"
            className={`ft-bytte ${erUtg ? 'aktiv' : ''}`}
            onClick={() => setU({ side: 'utgifter', sti: [], fokus: null, pinnet: null })}
          >
            Utgifter
          </button>
          <button
            type="button"
            className={`ft-bytte ${erUtg ? '' : 'aktiv'}`}
            onClick={() => setU({ side: 'inntekter', sti: [], fokus: null, pinnet: null })}
          >
            Inntekter
          </button>
        </div>

        <div className="ft-seriegruppe">
          <div className="ft-serieknapper">
            {SERIER.map((navn, i) => (
              <button
                key={navn}
                type="button"
                className={`ft-bytte ${i === si ? 'aktiv' : ''}`}
                onClick={() => {
                  // Artskontonivåene finnes bare i regnskapet – trim stien ved bytte
                  let ny = u.sti.filter((n) => n.l !== 'kl' && n.l !== 'ak')
                  if (i !== 0 && ny[ny.length - 1]?.l === 'p') ny = ny.slice(0, -1)
                  setU({ serie: i, sti: ny, fokus: ny[ny.length - 1] ?? null })
                }}
              >
                {navn}
              </button>
            ))}
          </div>
          <label className="ft-aarvalg">
            <span className="ft-skjult">År</span>
            <select className="ft-select" value={aar} onChange={(e) => setU({ aar: +e.target.value })}>
              {data.meta.budsjett_aar.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div className="ft-bytter">
          {[{ id: 'lopende', navn: 'Mill. kr' }, { id: 'person', navn: 'Per innbygger' }].map((m) => (
            <button
              key={m.id}
              type="button"
              className={`ft-bytte ${u.modus === m.id ? 'aktiv' : ''}`}
              onClick={() => setU({ modus: m.id })}
            >
              {m.navn}
            </button>
          ))}
        </div>

        <label className="ft-avkryss">
          <input type="checkbox" checked={skjulFin} onChange={(e) => setSkjulFin(e.target.checked)} />
          Skjul finanstransaksjoner og fondsoverføringer
        </label>

        <input
          className="ft-sok"
          type="search"
          placeholder="Søk i alle poster…"
          aria-label="Søk i alle poster"
          value={u.sok}
          onChange={(e) => setU({ sok: e.target.value })}
        />
        <button
          type="button"
          className="ft-knapp"
          onClick={() =>
            lastNedCSV(
              rader,
              `statsregnskapet-${u.side}-${SERIER[si].toLowerCase().replace(/ /g, '-')}-${aar}.csv`,
              aar
            )
          }
        >
          Last ned CSV
        </button>
      </div>

      <div className="ft-utforsk-grid">
        <div>
          <div className="ft-smuler ft-smuler--flat">
            {smuler.map((b, i) => (
              <button key={i} type="button" className={`ft-smule ${b.aktiv ? 'aktiv' : ''}`} onClick={b.klikk}>
                {i > 0 && <span className="ft-smulepil">›</span>}
                {b.navn}
              </button>
            ))}
          </div>

          <div className="ft-nivaatopp">
            <span className="ft-nivaasum num">{fmt(total)}</span>
            <span className="ft-nivaamerke">
              {sok.length >= MIN_SOK
                ? `${rader.length} treff`
                : `${rader.length} ${enhet} · ${SERIER[si].toLowerCase()} ${aar}`}
            </span>
          </div>

          {rader.map((r) => {
            const kanNed = r.node.l === 'p' ? harArtskonto(r.node) : (r.node.c?.length ?? 0) > 0
            const merke =
              r.node.l === 'p' ? (r.node.pt ?? 'Post')
              : r.node.l === 'k' ? (r.node.om ?? 'Kapittel')
              : (NIVAANAVN[r.node.l] ?? 'Departement')
            return (
              <button
                key={r.node.i}
                type="button"
                className={`ft-utforskrad ${u.fokus?.i === r.node.i ? 'fokus' : ''}`}
                onClick={() => velgRad(r)}
              >
                <span className="ft-utforskmidt">
                  <span className="ft-utforsktittel">
                    <span className="ft-utforsknavn">{r.node.n}</span>
                    {r.node.t && <span className="ft-utforsktag num">{r.node.t}</span>}
                    <span className="ft-merke">{merke.length > 34 ? merke.slice(0, 34) + '…' : merke}</span>
                  </span>
                  <span className="ft-bar ft-bar--tynn">
                    <span
                      className="ft-bar-fyll"
                      style={{ width: `${((Math.abs(r.verdi) / maks) * 100).toFixed(1)}%`, background: farge }}
                    />
                  </span>
                </span>
                <span className="num ft-utforskbelop">{fmt(r.verdi)}</span>
                <span className="num ft-utforskandel">{pct(total ? Math.abs((r.verdi / total) * 100) : 0, 1)}</span>
                <span className="ft-utforskpil">{kanNed ? '›' : ''}</span>
              </button>
            )
          })}

          {!rader.length && (
            <p className="ft-tommelding">
              {venterDetaljer
                ? 'Henter artskontoene for denne posten …'
                : sok.length >= MIN_SOK
                  ? 'Ingen treff.'
                  : 'Ingen underliggende data for dette året.'}
            </p>
          )}
        </div>

        <aside className="ft-utforsk-side">
          <div>
            <div className="ft-stikkord ft-stikkord--rad">Utvikling over tid</div>
            <div className="ft-nivaatopp">
              <span className="ft-graftittel">{grafTittel}</span>
              <span className="ft-cagr">
                <span className="num" style={{ color: cagrFarge }}>{cagr}</span>
                <span className="ft-cagrperiode">årlig {cagrPeriode}</span>
              </span>
            </div>
            <div className="ft-kort-graf">
              <LinjeGraf
                serier={graf}
                aar={aarListe}
                W={356}
                H={160}
                aksefmt={(v) => (u.modus === 'person' ? n0.format(v) : belopMill(v))}
                tips={(i) => {
                  const r = graf[0].punkter[i]?.v
                  const sa = graf[1].punkter[i]?.v
                  const pi = graf[2]?.punkter[i]?.v
                  const avvik = r && sa ? ((r - sa) / Math.abs(sa)) * 100 : null
                  return {
                    tittel: `${aarListe[i]} · ${grafTittel}`,
                    linjer: [
                      { farge: RUST, tekst: `Regnskap: ${grafFmt(r)}` },
                      { farge: BLEK, tekst: `Saldert: ${grafFmt(sa)}` },
                      avvik != null
                        ? { farge: 'transparent', tekst: `${avvik >= 0 ? '+' : '−'}${pct(Math.abs(avvik), 1)} mot budsjett` }
                        : null,
                      pi != null ? { farge: GRONN, tekst: `${visNavn(u.pinnet)}: ${grafFmt(pi)}` } : null,
                    ],
                  }
                }}
              />
            </div>
            <div className="ft-tegnforklaring ft-tegnforklaring--liten">
              <span><span className="ft-strek" style={{ background: RUST }} />Regnskap</span>
              <span><span className="ft-strek" style={{ background: BLEK }} />Saldert budsjett</span>
              <span><span className="ft-strek" style={{ background: GRONN }} />{u.pinnet ? visNavn(u.pinnet) : 'Sammenlign'}</span>
            </div>
            <button
              type="button"
              className="ft-knapp ft-knapp--luft"
              disabled={!u.pinnet && !fokus}
              onClick={() => setU({ pinnet: u.pinnet ? null : fokus })}
            >
              {u.pinnet ? 'Fjern sammenligning' : 'Fest til sammenligning'}
            </button>
          </div>

          <div className="ft-arealblokk">
            <div className="ft-stikkord">Sammensetning over tid</div>
            <div className="ft-kort-graf">
              <StabletAreal serier={arealNoder} aar={aarListe} />
            </div>
            <p className="ft-kort-fot">{arealTekst}</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
