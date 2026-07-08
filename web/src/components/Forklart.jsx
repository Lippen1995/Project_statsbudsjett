import React, { useMemo, useState } from 'react'
import { filtrerNoder, sumVerdi } from '../lib/data'
import { forklarDepartement, forklarInntekt } from '../lib/forklaringer'
import './Forklart.css'

const NB0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

/** kr per innbygger, avrundet til nærmeste hundrelapp for lesbarhet */
function perInnbygger(millKr, folk) {
  if (!folk) return null
  const kr = (millKr * 1_000_000) / folk
  return Math.round(kr / 100) * 100
}
const krFmt = (kr) => (kr == null ? '–' : NB0.format(kr) + ' kr')

/** Summer bladnodene i et filtrert hierarki for ett år */
function totalFor(hierarki, aar) {
  return hierarki.reduce((s, n) => s + (sumVerdi(n, aar, 'regnskap') ?? 0), 0)
}

export default function Forklart({ data, onAapneUtforsk }) {
  const { meta, befolkning } = data
  const regnskapsAar = meta.regnskap_aar
  const [aar, setAar] = useState(meta.siste_regnskap_aar)
  const fjor = aar - 1
  const harFjor = regnskapsAar.includes(fjor)
  const folk = befolkning?.[aar]

  const filtrertUtg = useMemo(() => filtrerNoder(data.utgifter, { skjulFin: true }), [data.utgifter])
  const filtrertInnt = useMemo(() => filtrerNoder(data.inntekter, { skjulFin: true }), [data.inntekter])

  const totalUtg = useMemo(() => totalFor(filtrertUtg, aar), [filtrertUtg, aar])
  const totalInn = useMemo(() => totalFor(filtrertInnt, aar), [filtrertInnt, aar])

  // --- Hvor går pengene? (departementsnivå) --------------------------------
  const utgRader = useMemo(() => filtrertUtg
    .map(d => {
      const mill = sumVerdi(d, aar, 'regnskap') ?? 0
      return {
        node: d,
        mill,
        perPerson: perInnbygger(mill, folk),
        andel: totalUtg ? (mill / totalUtg) * 100 : 0,
        forklaring: forklarDepartement(d.id),
      }
    })
    .filter(r => r.mill > 0)
    .sort((a, b) => b.mill - a.mill), [filtrertUtg, aar, folk, totalUtg])

  // --- Hva har endra seg? (største endringer mot i fjor) -------------------
  const endringer = useMemo(() => {
    if (!harFjor) return null
    const rader = filtrertUtg.map(d => {
      const na = sumVerdi(d, aar, 'regnskap') ?? 0
      const da = sumVerdi(d, fjor, 'regnskap') ?? 0
      return {
        node: d,
        delta: na - da,
        pct: da ? ((na - da) / Math.abs(da)) * 100 : null,
        perPersonDelta: perInnbygger(na - da, folk),
        forklaring: forklarDepartement(d.id),
      }
    }).filter(r => Math.abs(r.delta) >= 1)
    const opp = [...rader].sort((a, b) => b.delta - a.delta).slice(0, 4)
    const ned = [...rader].sort((a, b) => a.delta - b.delta).slice(0, 4).filter(r => r.delta < 0)
    return { opp, ned }
  }, [filtrertUtg, aar, fjor, harFjor, folk])

  // --- Hvor kommer pengene fra? (inntektskapittel, flatt) ------------------
  const innRader = useMemo(() => {
    const kapitler = []
    for (const dept of filtrertInnt) {
      for (const kap of dept.children ?? []) kapitler.push({ kap, dept })
    }
    const rader = kapitler
      .map(({ kap, dept }) => ({
        node: kap,
        dept,
        mill: sumVerdi(kap, aar, 'regnskap') ?? 0,
        forklaring: forklarInntekt(kap.tag),
      }))
      .filter(r => r.mill > 0)
      .sort((a, b) => b.mill - a.mill)

    const topp = rader.slice(0, 8)
    const restMill = rader.slice(8).reduce((s, r) => s + r.mill, 0)
    return { topp, restMill }
  }, [filtrertInnt, aar])

  const balanse = totalInn - totalUtg
  const utgPerPerson = perInnbygger(totalUtg, folk)
  const innPerPerson = perInnbygger(totalInn, folk)
  const balansePerPerson = perInnbygger(balanse, folk)

  return (
    <div className="forklart">
      <section className="fk-intro panel">
        <div className="fk-intro-tekst">
          <h2>Statsbudsjettet – forklart for folk flest</h2>
          <p>
            Staten samler inn og bruker enorme summer på dine vegne. Her er tallene
            regnet om til <strong>kroner per innbygger</strong>, så det blir mulig å
            kjenne igjen størrelsene. Klikk på et område for å grave dypere.
          </p>
        </div>
        <div className="fk-aarsvelger" role="group" aria-label="Velg regnskapsår">
          <span className="fk-aar-label">Regnskapsår</span>
          <div className="fk-aar-knapper">
            {regnskapsAar.slice(-6).map(y => (
              <button key={y} className={`fk-aar-knapp ${y === aar ? 'aktiv' : ''}`}
                onClick={() => setAar(y)} aria-pressed={y === aar}>
                {y}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Hero: per innbygger */}
      <section className="fk-hero">
        <HeroKort tone="teal" tittel="Staten fikk inn" perPerson={innPerPerson}
          undertekst={`${aar} · per innbygger`} />
        <HeroKort tone="rust" tittel="Staten brukte" perPerson={utgPerPerson}
          undertekst={`≈ ${krFmt(utgPerPerson != null ? Math.round(utgPerPerson / 12 / 100) * 100 : null)} i måneden`} />
        <div className={`fk-hero-kort fk-hero-kort--balanse ${balanse >= 0 ? 'positiv' : 'negativ'}`}>
          <div className="fk-hero-tittel">{balanse >= 0 ? 'Til overs' : 'Måtte låne/dekke inn'}</div>
          <div className="fk-hero-tall num">{balanse >= 0 ? '+' : '−'}{krFmt(Math.abs(balansePerPerson))}</div>
          <div className="fk-hero-under">per innbygger i {aar}</div>
        </div>
      </section>
      <p className="fk-hero-note">
        Tallene er statens egne regnskapstall, delt på {NB0.format(folk ?? 0)} innbyggere.
        Oljefondet og rene finanstransaksjoner er holdt utenfor, så dette er pengene som
        faktisk går til tjenester og overføringer.
      </p>

      {/* Hvor går pengene */}
      <section className="fk-seksjon panel">
        <div className="fk-seksjon-topp">
          <h3>Hvor går pengene?</h3>
          <span className="fk-seksjon-sum">{krFmt(utgPerPerson)} per innbygger</span>
        </div>
        <ul className="fk-liste">
          {utgRader.map(r => (
            <li key={r.node.id}>
              <button className="fk-rad" onClick={() => onAapneUtforsk('utgifter', [r.node])}>
                <span className="fk-ikon" aria-hidden>{r.forklaring?.ikon ?? '📁'}</span>
                <span className="fk-rad-midt">
                  <span className="fk-rad-tittel">
                    {r.forklaring?.kort ?? r.node.navn}
                    <span className="fk-andel">{r.andel.toFixed(0)} %</span>
                  </span>
                  <span className="fk-rad-tekst">{r.forklaring?.tekst ?? r.node.navn}</span>
                  <span className="fk-bar-spor">
                    <span className="fk-bar fk-bar--rust" style={{ width: `${Math.min(r.andel, 100)}%` }} />
                  </span>
                </span>
                <span className="fk-rad-hoyre">
                  <span className="fk-perperson num">{krFmt(r.perPerson)}</span>
                  <span className="fk-perperson-lab">per innbygger</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Hva har endra seg */}
      {endringer && (
        <section className="fk-seksjon panel">
          <div className="fk-seksjon-topp">
            <h3>Hva har endra seg?</h3>
            <span className="fk-seksjon-sum">{aar} mot {fjor} · løpende kroner</span>
          </div>
          <div className="fk-endring-grid">
            <div className="fk-endring-kol">
              <h4 className="fk-endring-tittel fk-opp">Økte mest ▲</h4>
              {endringer.opp.map(r => <EndringRad key={r.node.id} r={r} onAapne={onAapneUtforsk} />)}
            </div>
            <div className="fk-endring-kol">
              <h4 className="fk-endring-tittel fk-ned">Kuttet mest ▼</h4>
              {endringer.ned.length === 0
                ? <p className="fk-tom">Ingen områder ble kuttet dette året.</p>
                : endringer.ned.map(r => <EndringRad key={r.node.id} r={r} onAapne={onAapneUtforsk} />)}
            </div>
          </div>
        </section>
      )}

      {/* Hvor kommer pengene fra */}
      <section className="fk-seksjon panel">
        <div className="fk-seksjon-topp">
          <h3>Hvor kommer pengene fra?</h3>
          <span className="fk-seksjon-sum">{krFmt(innPerPerson)} per innbygger</span>
        </div>
        <ul className="fk-liste">
          {innRader.topp.map(r => {
            const perPerson = perInnbygger(r.mill, folk)
            const andel = totalInn ? (r.mill / totalInn) * 100 : 0
            return (
              <li key={r.node.id}>
                <button className="fk-rad" onClick={() => onAapneUtforsk('inntekter', [r.dept, r.node])}>
                  <span className="fk-ikon" aria-hidden>{r.forklaring?.ikon ?? '💠'}</span>
                  <span className="fk-rad-midt">
                    <span className="fk-rad-tittel">
                      {r.forklaring?.kort ?? r.node.navn}
                      <span className="fk-andel">{andel.toFixed(0)} %</span>
                    </span>
                    <span className="fk-rad-tekst">{r.forklaring?.tekst ?? r.node.navn}</span>
                    <span className="fk-bar-spor">
                      <span className="fk-bar fk-bar--teal" style={{ width: `${Math.min(andel, 100)}%` }} />
                    </span>
                  </span>
                  <span className="fk-rad-hoyre">
                    <span className="fk-perperson num">{krFmt(perPerson)}</span>
                    <span className="fk-perperson-lab">per innbygger</span>
                  </span>
                </button>
              </li>
            )
          })}
          {innRader.restMill > 0 && (
            <li>
              <div className="fk-rad fk-rad--rest">
                <span className="fk-ikon" aria-hidden>➕</span>
                <span className="fk-rad-midt">
                  <span className="fk-rad-tittel">Andre inntekter og avgifter</span>
                  <span className="fk-rad-tekst">Mindre skatter, avgifter, gebyrer og renteinntekter.</span>
                </span>
                <span className="fk-rad-hoyre">
                  <span className="fk-perperson num">{krFmt(perInnbygger(innRader.restMill, folk))}</span>
                  <span className="fk-perperson-lab">per innbygger</span>
                </span>
              </div>
            </li>
          )}
        </ul>
      </section>

      <p className="fk-metode">
        Tall fra Statsregnskapet (DFØ) og folkemengde fra SSB. Beløp er avrundet og i
        løpende kroner (ikke justert for prisvekst). «Per innbygger» er totalen delt på
        antall innbyggere – ikke det hver enkelt betaler eller mottar.
        Vil du se de eksakte tallene og hver enkelt post? Bruk fanen <em>Utforsk</em>.
      </p>
    </div>
  )
}

function HeroKort({ tone, tittel, perPerson, undertekst }) {
  return (
    <div className={`fk-hero-kort fk-hero-kort--${tone}`}>
      <div className="fk-hero-tittel">{tittel}</div>
      <div className="fk-hero-tall num">{krFmt(perPerson)}</div>
      <div className="fk-hero-under">{undertekst}</div>
    </div>
  )
}

function EndringRad({ r, onAapne }) {
  const opp = r.delta >= 0
  return (
    <button className="fk-endring-rad" onClick={() => onAapne('utgifter', [r.node])}>
      <span className="fk-ikon" aria-hidden>{r.forklaring?.ikon ?? '📁'}</span>
      <span className="fk-endring-navn">{r.forklaring?.kort ?? r.node.navn}</span>
      <span className={`fk-endring-tall num ${opp ? 'fk-opp' : 'fk-ned'}`}>
        {opp ? '+' : '−'}{krFmt(Math.abs(r.perPersonDelta))}
        {r.pct != null && <span className="fk-endring-pct">{opp ? '+' : ''}{r.pct.toFixed(0)} %</span>}
      </span>
    </button>
  )
}
