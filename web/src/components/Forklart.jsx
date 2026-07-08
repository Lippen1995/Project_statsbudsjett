import React, { useMemo, useState } from 'react'
import { filtrerNoder, sumVerdi } from '../lib/data'
import { forklarDepartement, forklarInntekt } from '../lib/forklaringer'
import './Forklart.css'

const NB0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

// Petroleumsinntekter (skatt, SDØE, CO2-avgift, Equinor-utbytte). Disse går
// rett inn i Oljefondet – de er ikke penger staten bruker på budsjettet.
const PETRO = new Set(['5507', '5508', '5440', '5445', '5446', '5685'])
function kapNr(tag) { return String(tag ?? '').match(/\d{3,4}/)?.[0] ?? '' }
const erPetro = (tag) => PETRO.has(kapNr(tag))
const erLaan = (tag) => kapNr(tag) === '5999'   // statslånemidler = finansiering, ikke inntekt

/** kr per innbygger, avrundet til nærmeste hundrelapp for lesbarhet */
function perInnbygger(millKr, folk) {
  if (!folk) return null
  return Math.round((millKr * 1_000_000) / folk / 100) * 100
}
const krFmt = (kr) => (kr == null ? '–' : NB0.format(kr) + ' kr')

function totalFor(hierarki, aar) {
  return hierarki.reduce((s, n) => s + (sumVerdi(n, aar, 'regnskap') ?? 0), 0)
}

/** Sum av kapitler med et gitt flagg (transfer = Oljefonds-overføring) */
function sumFlagg(hierarki, flagg, aar) {
  let s = 0
  for (const dept of hierarki) {
    for (const kap of dept.children ?? []) if (kap[flagg]) s += sumVerdi(kap, aar, 'regnskap') ?? 0
  }
  return s
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

  // Utgifter = tjenester og overføringer (Oljefonds-sparing er allerede filtrert bort)
  const totalUtg = useMemo(() => totalFor(filtrertUtg, aar), [filtrertUtg, aar])

  // Inntektskapitler delt i: ordinære (skatt/avgift), olje (spares) og lån
  const innByKat = useMemo(() => {
    let ordinaer = 0, petro = 0
    const ordRader = []
    for (const dept of filtrertInnt) {
      for (const kap of dept.children ?? []) {
        const v = sumVerdi(kap, aar, 'regnskap') ?? 0
        if (v <= 0) continue
        if (erPetro(kap.tag)) { petro += v; continue }
        if (erLaan(kap.tag)) continue          // lån = finansiering, ikke inntekt
        ordinaer += v
        ordRader.push({ node: kap, dept, mill: v, forklaring: forklarInntekt(kap.tag) })
      }
    }
    ordRader.sort((a, b) => b.mill - a.mill)
    return { ordinaer, petro, ordRader }
  }, [filtrertInnt, aar])

  // Oljefondet: hva som spares inn (Kap. 2800) og hva som tas ut (Kap. 5800)
  const fondUttak = useMemo(() => sumFlagg(data.inntekter, 'transfer', aar), [data.inntekter, aar])
  const fondInn = useMemo(() => sumFlagg(data.utgifter, 'transfer', aar), [data.utgifter, aar])

  // Uttaksprosent (handlingsregelen): uttaket målt mot fondets verdi ved
  // INNGANGEN til året = verdien ved utgangen av året før.
  const fondVerdiInngang = data.fondsverdi?.[String(aar - 1)] ?? null
  const uttaksprosent = fondVerdiInngang ? (fondUttak / fondVerdiInngang) * 100 : null

  // Finansiering av utgiftene: skatt + oljepengebruk (+ resten = lån/annet)
  const skattAndel = totalUtg ? (innByKat.ordinaer / totalUtg) * 100 : 0
  const fondAndel = totalUtg ? (fondUttak / totalUtg) * 100 : 0
  const restAndel = Math.max(0, 100 - skattAndel - fondAndel)

  // --- Hvor går pengene? (departementsnivå) --------------------------------
  const utgRader = useMemo(() => filtrertUtg
    .map(d => {
      const mill = sumVerdi(d, aar, 'regnskap') ?? 0
      return {
        node: d, mill,
        perPerson: perInnbygger(mill, folk),
        andel: totalUtg ? (mill / totalUtg) * 100 : 0,
        forklaring: forklarDepartement(d.id),
      }
    })
    .filter(r => r.mill > 0)
    .sort((a, b) => b.mill - a.mill), [filtrertUtg, aar, folk, totalUtg])

  // --- Hva har endra seg? (utgifter, mot i fjor) ---------------------------
  const endringer = useMemo(() => {
    if (!harFjor) return null
    const rader = filtrertUtg.map(d => {
      const na = sumVerdi(d, aar, 'regnskap') ?? 0
      const da = sumVerdi(d, fjor, 'regnskap') ?? 0
      return {
        node: d, delta: na - da,
        pct: da ? ((na - da) / Math.abs(da)) * 100 : null,
        perPersonDelta: perInnbygger(na - da, folk),
        forklaring: forklarDepartement(d.id),
      }
    }).filter(r => Math.abs(r.delta) >= 1)
    const opp = [...rader].sort((a, b) => b.delta - a.delta).slice(0, 4)
    const ned = [...rader].sort((a, b) => a.delta - b.delta).slice(0, 4).filter(r => r.delta < 0)
    return { opp, ned }
  }, [filtrertUtg, aar, fjor, harFjor, folk])

  // --- Hvor kommer pengene fra? (skatt + oljepengebruk) --------------------
  const innRader = useMemo(() => {
    const fondRad = fondUttak > 0
      ? { node: { id: 'fond-uttak', navn: 'Overføring fra Oljefondet', tag: 'Kap. 5800' },
          mill: fondUttak, forklaring: forklarInntekt('Kap. 5800'), erFond: true }
      : null
    const alle = [...innByKat.ordRader, ...(fondRad ? [fondRad] : [])]
      .sort((a, b) => b.mill - a.mill)
    const topp = alle.slice(0, 8)
    const restMill = alle.slice(8).reduce((s, r) => s + r.mill, 0)
    return { topp, restMill }
  }, [innByKat, fondUttak])

  const finansiering = innByKat.ordinaer + fondUttak

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

      {/* Slik betales statens regninger */}
      <section className="fk-finans panel">
        <div className="fk-seksjon-topp">
          <h3>Slik betales statens regninger</h3>
          <span className="fk-seksjon-sum">{aar} · per innbygger</span>
        </div>
        <div className="fk-finans-tall">
          <div className="fk-finans-kort fk-finans-kort--utg">
            <div className="fk-hero-tittel">Staten brukte</div>
            <div className="fk-hero-tall num">{krFmt(perInnbygger(totalUtg, folk))}</div>
            <div className="fk-hero-under">på tjenester og overføringer</div>
          </div>
          <div className="fk-finans-hoyre">
            <div className="fk-finans-bar" role="img"
              aria-label={`Skatt ${skattAndel.toFixed(0)} prosent, Oljefondet ${fondAndel.toFixed(0)} prosent`}>
              <span className="fk-seg fk-seg--skatt" style={{ width: `${skattAndel}%` }} />
              <span className="fk-seg fk-seg--fond" style={{ width: `${fondAndel}%` }} />
              {restAndel > 0.4 && <span className="fk-seg fk-seg--rest" style={{ width: `${restAndel}%` }} />}
            </div>
            <div className="fk-finans-legend">
              <span><i className="fk-dot fk-dot--skatt" />Skatter og avgifter (utenom olje) · <b>{skattAndel.toFixed(0)} %</b> · {krFmt(perInnbygger(innByKat.ordinaer, folk))}</span>
              <span><i className="fk-dot fk-dot--fond" />Oljepengebruk (fra Oljefondet) · <b>{fondAndel.toFixed(0)} %</b> · {krFmt(perInnbygger(fondUttak, folk))}</span>
              {restAndel > 0.4 && <span><i className="fk-dot fk-dot--rest" />Lån og annen finansiering · <b>{restAndel.toFixed(0)} %</b></span>}
            </div>
          </div>
        </div>
        <p className="fk-finans-note">
          <strong>Uten oljepengene går staten i minus.</strong> Skatter og avgifter dekker bare
          rundt {skattAndel.toFixed(0)} % av utgiftene. Resten fylles i hovedsak av en overføring fra
          Oljefondet – det er dette som kalles «oljepengebruken». Derfor er det{' '}
          <em>ikke</em> et reelt overskudd på statsbudsjettet uten Oljefondet.
        </p>
      </section>

      {/* Oljefondet: inn vs ut */}
      <section className="fk-fond panel">
        <div className="fk-seksjon-topp">
          <h3>🛢️ Oljepengene – inn og ut av Oljefondet</h3>
          <span className="fk-seksjon-sum">{aar} · per innbygger</span>
        </div>
        <div className="fk-fond-flyt">
          <div className="fk-fond-boks">
            <div className="fk-fond-lab">Olje- og gassinntekter</div>
            <div className="fk-fond-verdi num">{krFmt(perInnbygger(innByKat.petro, folk))}</div>
            <div className="fk-fond-sub">skatt, SDØE og utbytte</div>
          </div>
          <div className="fk-fond-pil" aria-hidden>→ spares i →</div>
          <div className="fk-fond-boks fk-fond-boks--fond">
            <div className="fk-fond-lab">Oljefondet 🏦</div>
            <div className="fk-fond-sub">verdens største statlige fond – sparing for framtidige generasjoner</div>
          </div>
          <div className="fk-fond-pil" aria-hidden>→ tar ut →</div>
          <div className="fk-fond-boks fk-fond-boks--ut">
            <div className="fk-fond-lab">Til statsbudsjettet</div>
            <div className="fk-fond-verdi num">{krFmt(perInnbygger(fondUttak, folk))}</div>
            <div className="fk-fond-sub">oljepengebruk</div>
            {uttaksprosent != null && (
              <div className="fk-uttak-merke">
                ≈ <b className="num">{uttaksprosent.toFixed(1).replace('.', ',')} %</b> av fondets verdi
              </div>
            )}
          </div>
        </div>
        <p className="fk-finans-note">
          Oljeinntektene går inn i fondet – de brukes ikke direkte på budsjettet. Hvor mye staten
          tar ut, styres av <strong>handlingsregelen</strong>: over tid skal man bare bruke den
          forventede avkastningen, om lag 3 % av fondets verdi.
          {uttaksprosent != null && (
            <>
              {' '}I {aar} tok staten ut <strong>{uttaksprosent.toFixed(1).replace('.', ',')} %</strong> av
              fondets verdi ved inngangen til året – {uttaksprosent <= 3
                ? 'under rettesnoren på 3 %, så fondet vokste videre.'
                : 'over rettesnoren på 3 %, altså en ekstra stor oljepengebruk dette året.'}
            </>
          )}
        </p>
      </section>

      {/* Hvor går pengene */}
      <section className="fk-seksjon panel">
        <div className="fk-seksjon-topp">
          <h3>Hvor går pengene?</h3>
          <span className="fk-seksjon-sum">{krFmt(perInnbygger(totalUtg, folk))} per innbygger</span>
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
          <span className="fk-seksjon-sum">{krFmt(perInnbygger(finansiering, folk))} per innbygger</span>
        </div>
        <ul className="fk-liste">
          {innRader.topp.map(r => {
            const perPerson = perInnbygger(r.mill, folk)
            const andel = finansiering ? (r.mill / finansiering) * 100 : 0
            const klikk = r.erFond
              ? () => onAapneUtforsk('inntekter', [], { skjulFin: false })
              : () => onAapneUtforsk('inntekter', [r.dept, r.node])
            return (
              <li key={r.node.id}>
                <button className={`fk-rad ${r.erFond ? 'fk-rad--fond' : ''}`} onClick={klikk}>
                  <span className="fk-ikon" aria-hidden>{r.forklaring?.ikon ?? '💠'}</span>
                  <span className="fk-rad-midt">
                    <span className="fk-rad-tittel">
                      {r.forklaring?.kort ?? r.node.navn}
                      <span className="fk-andel">{andel.toFixed(0)} %</span>
                    </span>
                    <span className="fk-rad-tekst">{r.forklaring?.tekst ?? r.node.navn}</span>
                    <span className="fk-bar-spor">
                      <span className={`fk-bar ${r.erFond ? 'fk-bar--gold' : 'fk-bar--teal'}`}
                        style={{ width: `${Math.min(andel, 100)}%` }} />
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
        løpende kroner (ikke justert for prisvekst). Oljeinntektene vises separat fordi de
        i praksis spares i Oljefondet; «hvor pengene kommer fra» viser derfor skatter og
        avgifter pluss den faktiske oljepengebruken (overføringen fra fondet), som er det som
        finansierer budsjettet. Små finansieringsposter (lån, avdrag) er utelatt, så tallene
        kan avvike noen prosent fra å gå nøyaktig i null. «Per innbygger» er totalen delt på
        antall innbyggere. Vil du se hver enkelt post? Bruk fanen <em>Utforsk</em>.
      </p>
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
