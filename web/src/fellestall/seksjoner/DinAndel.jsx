import React, { useMemo, useState } from 'react'
import { SATS, PERSONPOST, RUST, GRONN, BLAA, kapNr, visNavn } from '../design'
import { perInnbygger } from '../kompakt'
import { belopMill, kr, pct, n0, lesTall } from '../tall'

const STANDARD_LONN = 700000

/** Beregn skatt på en bruttolønn med satsene i SATS, fordelt på mottaker */
function beregnSkatt(brutto) {
  const minstefradrag = Math.min(brutto * SATS.minstefradrag, SATS.minstefradragMaks)
  const alminnelig = Math.max(0, brutto - minstefradrag - SATS.personfradrag)
  const inntektsskatt = (alminnelig * SATS.alminnelig) / 100

  // Trinnskatten er marginal: hvert trinn gjelder bare inntekten over grensen
  let trinnskatt = 0
  SATS.trinn.forEach(([grense, sats], i) => {
    const neste = SATS.trinn[i + 1]?.[0] ?? Infinity
    trinnskatt += Math.max(0, Math.min(brutto, neste) - grense) * sats
  })

  // Trygdeavgiften trappes opp fra nedre grense, slik at den ikke gir et hopp
  const trygd =
    brutto <= SATS.trygdGrense
      ? 0
      : Math.min(brutto * SATS.trygd, (brutto - SATS.trygdGrense) * SATS.trygdOpptrapping)

  return {
    kommune: (inntektsskatt * SATS.kommune) / SATS.alminnelig,
    fylke: (inntektsskatt * SATS.fylke) / SATS.alminnelig,
    felles: (inntektsskatt * SATS.felles) / SATS.alminnelig,
    trinnskatt,
    trygd,
  }
}

/**
 * Hva staten får av lønnen din, og hva statens del brukes til.
 *
 * Skatten kan overstyres med et faktisk beløp; fordelingen skaleres da
 * proporsjonalt, slik at forholdet mellom mottakerne bevares.
 */
export default function DinAndel({ data, aar, utg, totalUtg, folk }) {
  const [brutto, setBrutto] = useState(STANDARD_LONN)
  const [overstyrt, setOverstyrt] = useState(null)

  // Skatt fra privatpersoner i regnskapet – til sammenligning med modellen
  const person = useMemo(() => {
    let sum = 0
    const deler = []
    for (const dept of data.inntekter) {
      for (const kap of dept.c ?? []) {
        const poster = PERSONPOST[kapNr(kap.t)]
        if (!poster) continue
        for (const post of kap.c ?? []) {
          const nr = String(post.t ?? '').match(/\d+/)?.[0]
          if (!poster.includes(nr)) continue
          const v = post.s?.[aar]?.[0] ?? 0
          if (!v) continue
          sum += v
          deler.push({ navn: post.n, mill: v })
        }
      }
    }
    deler.sort((a, b) => b.mill - a.mill)
    return { sum, deler }
  }, [data.inntekter, aar])

  const modell = beregnSkatt(brutto)
  const modellSum = Object.values(modell).reduce((s, v) => s + v, 0)
  const betalt = overstyrt ?? Math.round(modellSum)
  const skala = modellSum ? betalt / modellSum : 0

  const del = {}
  for (const [k, v] of Object.entries(modell)) del[k] = v * skala
  const tilStat = del.felles + del.trinnskatt + del.trygd

  const topptrinn = [...SATS.trinn].reverse().find(([g]) => brutto > g)
  const marginal =
    brutto > SATS.trygdGrense
      ? (topptrinn ? topptrinn[1] * 100 : 0) + SATS.alminnelig + SATS.trygd * 100
      : 0

  const mottakere = [
    { navn: 'Staten', belop: tilStat, farge: RUST, tekst: 'Fellesskatt, trinnskatt og trygdeavgift' },
    { navn: 'Kommunen din', belop: del.kommune, farge: GRONN, tekst: 'Skattøre 12,75 % av alminnelig inntekt' },
    { navn: 'Fylkeskommunen', belop: del.fylke, farge: BLAA, tekst: 'Skattøre 2,65 % av alminnelig inntekt' },
  ]

  const komponenter = [
    { navn: 'Trygdeavgift til folketrygden', til: 'Staten', belop: del.trygd },
    { navn: 'Trinnskatt', til: 'Staten', belop: del.trinnskatt },
    { navn: 'Fellesskatt av alminnelig inntekt', til: 'Staten', belop: del.felles },
    { navn: 'Inntektsskatt til kommunen', til: 'Kommunen', belop: del.kommune },
    { navn: 'Inntektsskatt til fylkeskommunen', til: 'Fylkeskommunen', belop: del.fylke },
  ]

  const storsteAndel = utg.length && totalUtg ? utg[0].mill / totalUtg : 0

  return (
    <section id="din-andel" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h2>Hva staten får av lønnen din</h2>
          <p>
            Skatten din deles mellom tre mottakere. Kommunen og fylkeskommunen får en fast andel av
            alminnelig inntekt; resten – fellesskatt, trinnskatt og trygdeavgift – går til staten. Legg inn
            lønnen din, så regner vi ut fordelingen og viser hva statens del brukes til.
          </p>
        </div>
      </div>

      <div className="ft-skatt-grid">
        <div className="ft-skattpanel">
          <label className="ft-stikkord" htmlFor="ft-brutto">Bruttolønn i året</label>
          <div className="ft-skattfelt">
            <input
              id="ft-brutto"
              type="text"
              inputMode="numeric"
              value={n0.format(brutto)}
              onChange={(e) => { setBrutto(lesTall(e.target.value)); setOverstyrt(null) }}
            />
            <span>kr</span>
          </div>
          <input
            type="range" min={0} max={2000000} step={10000} value={brutto}
            aria-label="Bruttolønn"
            onChange={(e) => { setBrutto(+e.target.value); setOverstyrt(null) }}
          />

          <label className="ft-stikkord ft-stikkord--luft" htmlFor="ft-skatt">Skatt betalt i året</label>
          <div className="ft-skattfelt">
            <input
              id="ft-skatt"
              type="text"
              inputMode="numeric"
              value={n0.format(Math.round(betalt))}
              onChange={(e) => setOverstyrt(lesTall(e.target.value))}
            />
            <span>kr</span>
          </div>
          <input
            type="range" min={0} max={900000} step={5000} value={Math.round(betalt)}
            aria-label="Skatt betalt"
            onChange={(e) => setOverstyrt(+e.target.value)}
          />

          <div className="ft-skattnokkel">
            <span>Gjennomsnittlig skattesats</span>
            <span className="num ft-gull">{pct(brutto ? (betalt / brutto) * 100 : 0, 1)}</span>
          </div>
          <div className="ft-skattnokkel">
            <span>Marginalskatt på siste krone</span>
            <span className="num ft-lys">{pct(marginal, 1)}</span>
          </div>
          <p className="ft-skattnote">
            Marginalskatten er {pct(marginal, 1)} – det er satsen på den siste kronen du tjener.
            Gjennomsnittet er lavere fordi minstefradrag, personfradrag og de laveste trinnene gjelder for
            hele inntekten.
          </p>
          <p className="ft-skattnote">
            {overstyrt == null
              ? 'Beregnet med satsene for 2025. Overstyr beløpet hvis du vet hva du faktisk betalte.'
              : `Du har overstyrt beregningen. Modellen anslår ${kr(Math.round(modellSum))} for denne lønnen; fordelingen under er skalert til beløpet ditt.`}
          </p>
          <button type="button" className="ft-knapp ft-knapp--mork" onClick={() => setOverstyrt(null)}>
            Bruk beregnet skatt
          </button>
        </div>

        <div>
          {mottakere.map((m) => (
            <div key={m.navn} className="ft-mottaker">
              <span>
                <span className="ft-radtittel">
                  <span className="ft-mottakernavn">{m.navn}</span>
                  <span className="ft-radandel num">{pct(betalt ? (m.belop / betalt) * 100 : 0)}</span>
                </span>
                <span className="ft-radtekst">{m.tekst}</span>
                <span className="ft-bar ft-bar--tykk">
                  <span
                    className="ft-bar-fyll"
                    style={{ width: `${(betalt ? (m.belop / betalt) * 100 : 0).toFixed(1)}%`, background: m.farge }}
                  />
                </span>
              </span>
              <span className="ft-mottakerbelop num">{kr(Math.round(m.belop))}</span>
            </div>
          ))}

          <div className="ft-komponenter">
            <div className="ft-stikkord">Skatten din, post for post</div>
            {komponenter.map((k) => (
              <div key={k.navn} className="ft-komponent">
                <span>{k.navn}</span>
                <span className="ft-komponenttil">{k.til}</span>
                <span className="num ft-komponentbelop">{kr(Math.round(k.belop))}</span>
              </div>
            ))}
          </div>
          <p className="ft-brodtekst ft-brodtekst--liten">
            I tillegg betaler arbeidsgiveren {kr(Math.round(brutto * SATS.aga))} i arbeidsgiveravgift av
            lønnen din. Den går til staten, men trekkes ikke fra lønnen din og er ikke med i tallene under.
          </p>
        </div>
      </div>

      <div className="ft-seksjonstopp ft-seksjonstopp--bunn ft-seksjonstopp--luft">
        <div className="ft-seksjonstekst">
          <h3>Slik brukes din del av statens penger</h3>
          <p>Statens andel fordelt etter den faktiske utgiftsfordelingen i statsregnskapet for {aar}.</p>
        </div>
        <div className="ft-hoyrestilt">
          <div className="ft-stikkord">Til staten</div>
          <div className="ft-storTall">{kr(Math.round(tilStat))}</div>
        </div>
      </div>

      <div className="ft-andelsliste">
        {utg.slice(0, 12).map((r) => {
          const andel = totalUtg ? r.mill / totalUtg : 0
          return (
            <div key={r.node.i} className="ft-andelrad">
              <span>
                <span className="ft-andelnavn">{visNavn(r.node)}</span>
                <span className="ft-bar ft-bar--tynn">
                  <span
                    className="ft-bar-fyll ft-bar-fyll--ink"
                    style={{ width: `${storsteAndel ? ((andel / storsteAndel) * 100).toFixed(1) : 0}%` }}
                  />
                </span>
              </span>
              <span className="num ft-andelbelop">{kr(Math.round(tilStat * andel))}</span>
            </div>
          )
        })}
      </div>

      <div className="ft-kort ft-personskatt">
        <div>
          <div className="ft-stikkord">Skatt fra privatpersoner {aar}</div>
          <div className="ft-storTall ft-storTall--ink">{kr(perInnbygger(person.sum, folk))}</div>
          <div className="ft-kort-under">i snitt per innbygger · {belopMill(person.sum)} kr totalt</div>
          <p className="ft-fotnote">
            Kap. 5501 post 70, 72 og 75 (inntekts- og formuesskatt fra personer) og kap. 5700 post 71
            (trygdeavgift). Arbeidsgiveravgift, selskapsskatt, merverdiavgift og særavgifter er holdt utenfor.
          </p>
        </div>
        <div>
          {person.deler.map((p) => (
            <div key={p.navn} className="ft-personrad">
              <div className="ft-personrad-topp">
                <span>{p.navn}</span>
                <span className="num">{kr(perInnbygger(p.mill, folk))}</span>
              </div>
              <div className="ft-bar ft-bar--tynn">
                <div
                  className="ft-bar-fyll"
                  style={{ width: `${((p.mill / person.deler[0].mill) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="ft-fotnote">
            Satsene i beregningen over er Stortingets skattevedtak for 2025: minstefradrag 46 prosent
            (maks 92 000 kr), personfradrag 108 550 kr, 22 prosent av alminnelig inntekt fordelt på kommune
            12,75, fylkeskommune 2,65 og fellesskatt 6,60, trinnskatt i fem trinn og trygdeavgift 7,7 prosent.
          </p>
        </div>
      </div>
    </section>
  )
}
