import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadAll, hentDetaljer as hentDetaljerRaa } from '../lib/data'
import { kompaktData, kompaktDetaljer, verdi, rot, sumRot, sumFondsoverforing, perInnbygger, tellPoster, detaljFil } from './kompakt'
import { SEKSJONER, PETRO, RUST, INK, kapNr } from './design'
import { kr, pct } from './tall'
import { useAvslor, useAktivSeksjon } from './bruk'
import Prisvekst from './seksjoner/Prisvekst'
import Budsjettkart from './seksjoner/Budsjettkart'
import Flyten from './seksjoner/Flyten'
import HvorPengeneGaar from './seksjoner/HvorPengeneGaar'
import Endringer from './seksjoner/Endringer'
import Oljefondet from './seksjoner/Oljefondet'
import DinAndel from './seksjoner/DinAndel'
import Utforsk from './seksjoner/Utforsk'
import OmTallene from './seksjoner/OmTallene'
import './fellestall.css'

const SEKSJON_IDER = SEKSJONER.map((s) => s.id)

/** Statslånemidler er finansiering, ikke en inntekt staten kan bruke */
const STATSLAAN = 5999

const START_UTFORSK = {
  side: 'utgifter', serie: 0, aar: null, modus: 'lopende',
  sti: [], fokus: null, pinnet: null, sok: '',
}

export default function Fellestall() {
  const [data, setData] = useState(null)
  const [feil, setFeil] = useState(null)
  const [aar, setAar] = useState(null)
  const [skjulFin, setSkjulFin] = useState(true)
  const [utforsk, setUtforsk] = useState(START_UTFORSK)
  const [detaljer, setDetaljer] = useState({})
  const lasterRef = useRef({})

  const aktivSeksjon = useAktivSeksjon(SEKSJON_IDER)
  useAvslor(data)

  // Papirfargen må ligge på body, ellers slår index.css sin bakgrunn gjennom
  // i overscroll-området
  useEffect(() => {
    document.body.classList.add('ft-body')
    return () => document.body.classList.remove('ft-body')
  }, [])

  useEffect(() => {
    loadAll()
      .then((raa) => {
        const d = kompaktData(raa)
        setData(d)
        setAar(d.meta.siste_regnskap_aar)
      })
      .catch((e) => setFeil(e.message))
  }, [])

  /** Last artskontodetaljer for departementet en post hører til, én gang per fil */
  const hentDetaljer = useCallback((postId) => {
    const fil = detaljFil(postId)
    if (detaljer[fil] != null) return Promise.resolve(detaljer[fil])
    if (lasterRef.current[fil]) return lasterRef.current[fil]
    const jobb = hentDetaljerRaa(postId)
      .then((raa) => {
        const k = kompaktDetaljer(raa)
        setDetaljer((forrige) => ({ ...forrige, [fil]: k }))
        return k
      })
      .catch(() => null)
    lasterRef.current[fil] = jobb
    return jobb
  }, [detaljer])

  // Står vi på en post, trenger vi detaljfilen for å vise artskontoene
  useEffect(() => {
    const siste = utforsk.sti[utforsk.sti.length - 1]
    if (siste?.l === 'p' && detaljer[detaljFil(siste.i)] === undefined) hentDetaljer(siste.i)
  }, [utforsk.sti, detaljer, hentDetaljer])

  const oppdaterUtforsk = useCallback((endring) => {
    setUtforsk((forrige) => ({ ...forrige, ...endring }))
  }, [])

  const aapneUtforsk = useCallback((side, sti) => {
    setUtforsk((forrige) => ({ ...forrige, side, sti, fokus: sti[sti.length - 1] ?? null, sok: '' }))
    const el = document.getElementById('utforsk')
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' })
  }, [])

  const avledet = useMemo(() => {
    if (!data || !aar) return null

    const uRot = rot(data, 'utgifter', skjulFin)
    const totalUtg = sumRot(uRot, aar)
    const folk = data.befolkning?.[aar] ?? null

    /**
     * Inntektene klassifiseres etter kapittelnummer: 5501–5599 og 5700 er
     * skatter og avgifter, petroleumskapitlene spares i fondet, 5999 er
     * statslånemidler, og resten er gebyrer, renter og utbytte.
     */
    let skatterOgAvgifter = 0, petro = 0, andreInntekter = 0
    const skattKapitler = []
    for (const dept of data.inntekter) {
      for (const kap of dept.c ?? []) {
        if (kap.f || kap.x) continue
        const v = verdi(kap, aar)
        if (v <= 0) continue
        const nr = +kapNr(kap.t)
        if (PETRO.has(String(nr))) { petro += v; continue }
        if (nr === STATSLAAN) continue
        if ((nr >= 5501 && nr <= 5599) || nr === 5700) {
          skatterOgAvgifter += v
          skattKapitler.push({ node: kap, mill: v })
        } else {
          andreInntekter += v
        }
      }
    }

    const fondUt = sumFondsoverforing(data.inntekter, aar)
    const fondInngang = data.fondsverdi?.[String(aar - 1)] ?? null

    const utg = uRot
      .map((n) => ({ node: n, mill: verdi(n, aar) }))
      .filter((r) => r.mill > 0)
      .sort((a, b) => b.mill - a.mill)

    return {
      uRot, totalUtg, folk, utg, petro, fondUt,
      inntektsbilde: { skattKapitler, andreInntekter, fondUt },
      nokkeltall: [
        { navn: 'Staten brukte, per innbygger', verdi: kr(perInnbygger(totalUtg, folk)), farge: RUST },
        { navn: 'Skatter og avgifter dekket', verdi: pct(totalUtg ? (skatterOgAvgifter / totalUtg) * 100 : 0), farge: INK },
        { navn: 'Oljepengebruken dekket', verdi: pct(totalUtg ? (fondUt / totalUtg) * 100 : 0), farge: INK },
        { navn: 'Hentet fra Oljefondet', verdi: kr(perInnbygger(fondUt, folk)), farge: INK },
        { navn: 'Uttak av fondets verdi', verdi: fondInngang ? pct((fondUt / fondInngang) * 100, 1) : '–', farge: INK },
      ],
      antallPoster: tellPoster(data.utgifter) + tellPoster(data.inntekter),
    }
  }, [data, aar, skjulFin])

  if (feil) {
    return (
      <div className="ft-melding">
        <h2>Datafeil</h2>
        <p>{feil}</p>
        <p>Kjør <code>make etl</code> for å laste ned data fra DFØ og SSB.</p>
      </div>
    )
  }

  if (!data || !avledet) return <div className="ft-melding"><p>Laster data …</p></div>

  const { meta } = data
  const aarListe = meta.regnskap_aar

  const navLenker = SEKSJONER.map((s, i) => ({
    ...s,
    nr: String(i + 1).padStart(2, '0'),
    aktiv: aktivSeksjon === s.id,
  }))

  const aarVelger = (
    <select className="ft-select" value={aar} onChange={(e) => setAar(+e.target.value)} aria-label="Regnskapsår">
      {aarListe.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  )

  const merke = (
    <a href="#" className="ft-merke-lenke">
      <div className="ft-logo">Fellestall<span>.no</span></div>
      <div className="ft-slagord">En oversikt over norske statsfinanser</div>
    </a>
  )

  return (
    <div className="ft">
      <a className="ft-hopp" href="#hovedinnhold">Hopp til innholdet</a>
      <div className="ft-layout">
        <aside className="ft-sidemeny">
          {merke}
          <label className="ft-aarblokk">
            <span className="ft-aarlabel">Regnskapsår</span>
            {aarVelger}
          </label>
          <nav className="ft-nav">
            {navLenker.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={`ft-navlenke ${n.aktiv ? 'aktiv' : ''}`}>
                <span className="ft-navnr num">{n.nr}</span>
                <span>{n.navn}</span>
              </a>
            ))}
          </nav>
          <div className="ft-sidefot">
            <a href="#om-tallene">Om tallene</a>
          </div>
        </aside>

        <div className="ft-hovedspalte" id="hovedinnhold">
          <div className="ft-toppbar">
            <div className="ft-toppbar-inner">
              {merke}
              <label className="ft-toppaar">
                <span className="ft-stikkord">År</span>
                {aarVelger}
              </label>
              <nav className="ft-toppnav">
                {navLenker.map((n) => (
                  <a key={n.id} href={`#${n.id}`} className={`ft-toppnavlenke ${n.aktiv ? 'aktiv' : ''}`}>
                    {n.navn}
                  </a>
                ))}
                <a href="#om-tallene">Om tallene</a>
              </nav>
            </div>
          </div>

          <header className="ft-hero">
            <div className="ft-kicker">
              Statsbudsjettet og statsregnskapet · {aarListe[0]}–{meta.siste_budsjett_aar}
            </div>
            <h1>Hvor blir det av skattepengene?</h1>
            <div className="ft-hero-grid">
              <p className="ft-ingress">
                Hvert år fører staten regnskap over hver eneste krone, fordelt på 16 departementer, flere
                hundre kapitler og tusenvis av poster. Tallene er offentlige, men de er skrevet for
                revisorer. Her er de samme tallene, normalisert til én modell og regnet om til noe man kan
                kjenne igjen: kroner per innbygger, andeler, og utviklingen over tid. Du kan bla deg fra
                helheten helt ned til den enkelte posten.
              </p>
              <div className="ft-femtall">
                <div className="ft-stikkord">Året i fem tall</div>
                {avledet.nokkeltall.map((k) => (
                  <div key={k.navn} className="ft-femtall-rad">
                    <span>{k.navn}</span>
                    <span className="num" style={{ color: k.farge }}>{k.verdi}</span>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <Prisvekst data={data} uRot={avledet.uRot} aarListe={aarListe} />

          <Budsjettkart
            data={data}
            aar={aar}
            aarListe={aarListe}
            uRot={avledet.uRot}
            totalUtg={avledet.totalUtg}
            skjulFin={skjulFin}
            folk={avledet.folk}
          />

          <Flyten inntektsbilde={avledet.inntektsbilde} uRot={avledet.uRot} aar={aar} />

          <HvorPengeneGaar
            utg={avledet.utg}
            totalUtg={avledet.totalUtg}
            folk={avledet.folk}
            aar={aar}
            onAapneUtforsk={aapneUtforsk}
          />

          <Endringer
            data={data}
            aar={aar}
            uRot={avledet.uRot}
            skjulFin={skjulFin}
            onAapneUtforsk={aapneUtforsk}
          />

          <Oljefondet
            data={data}
            aar={aar}
            aarListe={aarListe}
            petro={avledet.petro}
            fondUt={avledet.fondUt}
            folk={avledet.folk}
          />

          <DinAndel
            data={data}
            aar={aar}
            utg={avledet.utg}
            totalUtg={avledet.totalUtg}
            folk={avledet.folk}
          />

          <Utforsk
            data={data}
            aarListe={aarListe}
            globalAar={aar}
            u={utforsk}
            setU={oppdaterUtforsk}
            skjulFin={skjulFin}
            setSkjulFin={(v) => {
              setSkjulFin(v)
              oppdaterUtforsk({ sti: [], fokus: null })
            }}
            detaljer={detaljer}
            hentDetaljer={hentDetaljer}
          />

          <OmTallene meta={meta} antallPoster={avledet.antallPoster} />
        </div>
      </div>

      <footer className="ft-fot">
        <div className="ft-fot-grid">
          <div>
            <div className="ft-logo ft-logo--lys">Fellestall<span>.no</span></div>
            <div className="ft-fot-slagord">En oversikt over norske statsfinanser</div>
            <p className="ft-fot-tekst">Statsbudsjettet og statsregnskapet, normalisert og forklart.</p>
            <div className="ft-fot-dato">
              Sist oppdatert{' '}
              {new Date(meta.oppdatert).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div>
            <div className="ft-stikkord">Innhold</div>
            <div className="ft-fot-lenker">
              {SEKSJONER.map((s) => <a key={s.id} href={`#${s.id}`}>{s.navn}</a>)}
            </div>
          </div>
          <div>
            <div className="ft-stikkord">Kilder</div>
            <div className="ft-fot-lenker">
              <a href="#om-tallene">Metode og kilder</a>
              <a href="https://statsregnskapet.dfo.no" rel="noreferrer">DFØ Statsregnskapet</a>
              <a href="https://www.ssb.no" rel="noreferrer">SSB</a>
              <a href="https://www.nbim.no" rel="noreferrer">NBIM</a>
            </div>
          </div>
          <div>
            <div className="ft-stikkord">Om siden</div>
            {/*
              Tekstsidene er egne HTML-filer i public/, ikke ruter i appen: en
              tilgjengelighetserklæring som krever JavaScript for å leses ville
              motsi seg selv. Derfor vanlige lenker, ikke hash-navigasjon.
            */}
            <div className="ft-fot-lenker">
              <a href="personvern.html">Personvern</a>
              <a href="vilkar.html">Vilkår og kilder</a>
              <a href="tilgjengelighet.html">Tilgjengelighet</a>
            </div>
          </div>
        </div>
        <div className="ft-fot-linje">
          <span>
            Uavhengig, privat prosjekt – ikke tilknyttet noen offentlig etat.
            Tall fra DFØ Statsregnskapet (NLOD) · SSB (CC BY 4.0) · NBIM
          </span>
          <span>Ingen informasjonskapsler</span>
        </div>
      </footer>
    </div>
  )
}
