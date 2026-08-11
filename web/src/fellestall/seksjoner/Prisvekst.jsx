import React, { useState } from 'react'
import LinjeGraf from '../grafer/LinjeGraf'
import { RUST, BLAA } from '../design'
import { sumRot } from '../kompakt'
import { kr, pct, n0 } from '../tall'

/**
 * Utgift per innbygger mot konsumprisindeksen, begge indeksert til 100 i
 * startåret. Avstanden mellom kurvene er realveksten – det er den som sier om
 * staten faktisk bruker mer, eller bare betaler høyere priser.
 *
 * Perioden kan snevres inn ved å dra over grafen.
 */
/**
 * Uten prisindeks kan seksjonen ikke regnes ut. Den skjules ikke – da ser det
 * ut som den ikke finnes – men sier hva som mangler og hvordan det fylles.
 */
function ManglerPrisindeks() {
  return (
    <section id="prisvekst" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div>
          <h2>Vokser staten raskere enn prisene?</h2>
          <p>
            Denne seksjonen setter utgiftene per innbygger mot konsumprisindeksen, så man kan se hvor mye
            av veksten som er reell og hvor mye som bare er prisvekst.
          </p>
        </div>
      </div>
      <div className="ft-mangler">
        <div className="ft-stikkord">Mangler datagrunnlag</div>
        <p>
          Konsumprisindeksen finnes ikke i datagrunnlaget. ETL-en henter KPI fra SSB som en
          tilleggsserie, og hopper over den – uten å felle resten av kjøringen – hvis kilden svarer
          uventet. Kjør <code>make etl</code> på nytt og se etter advarselen «Ingen KPI» i loggen.
        </p>
        <p>
          Serien kan også legges inn manuelt: <code>web/public/data/kpi.json</code> med årstall som
          nøkkel og totalindeksen som verdi – <code>{'{"2014": 97.9, "2015": 100, …}'}</code>. Basisåret
          er valgfritt; seksjonen indekserer selv til det første året i perioden.
        </p>
      </div>
    </section>
  )
}

export default function Prisvekst({ data, uRot, aarListe }) {
  const [fra, setFra] = useState(null)
  const [til, setTil] = useState(null)

  const kpi = data.kpi ?? {}
  const mulige = aarListe.filter((y) => kpi[y] && data.befolkning?.[y])
  if (mulige.length < 2) return <ManglerPrisindeks />

  const iFra = mulige.includes(fra) ? fra : mulige[0]
  const iTilValgt = mulige.includes(til) ? til : mulige[mulige.length - 1]
  const iTil = iTilValgt > iFra ? iTilValgt : mulige[mulige.length - 1]
  const aar = mulige.filter((y) => y >= iFra && y <= iTil)

  const basis = aar[0]
  const siste = aar[aar.length - 1]
  const perInnbFor = (y) => (sumRot(uRot, y) * 1e6) / data.befolkning[y]
  const b0 = perInnbFor(basis)
  const k0 = kpi[basis]

  const utgIdx = aar.map((y) => ({ v: (perInnbFor(y) / b0) * 100 }))
  const kpiIdx = aar.map((y) => ({ v: (kpi[y] / k0) * 100 }))

  const utgVekst = utgIdx[utgIdx.length - 1].v - 100
  const prisVekst = kpiIdx[kpiIdx.length - 1].v - 100
  const real = (perInnbFor(siste) / (kpi[siste] / k0) / b0) * 100 - 100

  return (
    <section id="prisvekst" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstopp">
        <div className="ft-seksjonstekst">
          <h2>Vokser staten raskere enn prisene?</h2>
          <p>
            Utgiftene per innbygger og konsumprisindeksen, begge indeksert til {basis} = 100.
            Avstanden mellom kurvene er realveksten. Dra over grafen for å zoome inn på et tidsrom.
          </p>
        </div>
        <div className="ft-seksjonstall">
          <div className="ft-periodevelger">
            <div>
              <div className="ft-stikkord">Periode</div>
              <div className="ft-periode num">{basis}–{siste}</div>
            </div>
            <button
              type="button"
              className="ft-knapp"
              onClick={() => { setFra(null); setTil(null) }}
            >
              Hele perioden
            </button>
          </div>
          <div>
            <div className="ft-stikkord">Realvekst {basis}–{siste}</div>
            <div className="ft-storTall">{pct(real)}</div>
          </div>
        </div>
      </div>

      <div className="ft-grafflate">
        <LinjeGraf
          serier={[
            { farge: RUST, punkter: utgIdx },
            { farge: BLAA, bredde: 1.8, punkter: kpiIdx },
          ]}
          aar={aar}
          W={1080}
          H={260}
          fraNull={false}
          aksefmt={(v) => n0.format(v)}
          velg={(a, b) => { setFra(aar[a]); setTil(aar[b]) }}
          tips={(i) => {
            const y = aar[i]
            return {
              tittel: String(y),
              linjer: [
                { farge: RUST, tekst: `Utgift per innbygger: ${kr(Math.round(perInnbFor(y) / 100) * 100)} (indeks ${n0.format(utgIdx[i].v)})` },
                { farge: BLAA, tekst: `Konsumpriser: indeks ${n0.format(kpiIdx[i].v)}` },
                { farge: 'transparent', tekst: `Realvekst siden ${basis}: ${pct((utgIdx[i].v / kpiIdx[i].v) * 100 - 100, 1)}` },
              ],
            }
          }}
        />
      </div>

      <div className="ft-tegnforklaring">
        <span><span className="ft-strek" style={{ background: RUST }} />Utgift per innbygger ({basis} = 100) · {pct(utgVekst)}</span>
        <span><span className="ft-strek" style={{ background: BLAA }} />Konsumprisindeks ({basis} = 100) · {pct(prisVekst)}</span>
      </div>

      <p className="ft-brodtekst">
        Fra {basis} til {siste} økte statens utgifter per innbygger med {pct(utgVekst)}, mens
        konsumprisene steg {pct(prisVekst)}. Målt i faste kroner bruker staten {pct(Math.abs(real))}{' '}
        {real >= 0 ? 'mer' : 'mindre'} per innbygger enn ved starten av perioden.
      </p>
    </section>
  )
}
