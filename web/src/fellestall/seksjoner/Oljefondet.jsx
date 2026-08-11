import React from 'react'
import LinjeGraf from '../grafer/LinjeGraf'
import { GULL } from '../design'
import { sumFondsoverforing, perInnbygger } from '../kompakt'
import { belopMill, kr, pct, n0, n1 } from '../tall'

/** Handlingsregelens rettesnor: uttaket skal over tid tilsvare forventet avkastning */
const RETTESNOR = 3

/**
 * Olje- og gassinntektene brukes ikke direkte på budsjettet – de går inn i
 * fondet. Det som brukes, er den årlige overføringen tilbake.
 */
export default function Oljefondet({ data, aar, aarListe, petro, fondUt, folk }) {
  const fondInngang = data.fondsverdi?.[String(aar - 1)] ?? null
  const uttak = fondInngang ? (fondUt / fondInngang) * 100 : null

  // Uttaksprosent krever fondsverdien ved inngangen til året
  const pctAar = aarListe.filter((y) => data.fondsverdi?.[String(y - 1)])
  const uttakPct = (y) => (sumFondsoverforing(data.inntekter, y) / data.fondsverdi[String(y - 1)]) * 100

  const perAar = aarListe.filter((y) => sumFondsoverforing(data.inntekter, y) > 0 && data.befolkning?.[y])
  const uttakPer = (y) => (sumFondsoverforing(data.inntekter, y) * 1e6) / data.befolkning[y]

  const forste = perAar[0]
  const siste = perAar[perAar.length - 1]
  const cagr =
    perAar.length > 1
      ? (Math.pow(uttakPer(siste) / uttakPer(forste), 1 / (siste - forste)) - 1) * 100
      : null

  return (
    <section id="oljefondet" className="ft-seksjon ft-seksjon--mork" data-avslor>
      <div className="ft-seksjon-innhold">
        <div className="ft-seksjonstekst ft-seksjonstopp">
          <div>
            <h2>Oljefondet: hva som spares, hva som brukes</h2>
            <p>
              Olje- og gassinntektene brukes ikke direkte på budsjettet – de går inn i fondet. Det som
              brukes, er den årlige overføringen tilbake til statsbudsjettet. Handlingsregelen sier at
              uttaket over tid skal tilsvare forventet avkastning, om lag 3 prosent.
            </p>
          </div>
        </div>

        <div className="ft-fondtall">
          <div>
            <div className="ft-stikkord">Inn i fondet</div>
            <div className="ft-fondbelop">{kr(perInnbygger(petro, folk))}</div>
            <div className="ft-fondunder">per innbygger fra olje og gass</div>
          </div>
          <div>
            <div className="ft-stikkord">Ut av fondet</div>
            <div className="ft-fondbelop">{kr(perInnbygger(fondUt, folk))}</div>
            <div className="ft-fondunder">per innbygger brukt på budsjettet</div>
          </div>
          <div>
            <div className="ft-stikkord">Uttak av fondsverdien</div>
            <div className="ft-fondbelop">{uttak == null ? '–' : pct(uttak, 1)}</div>
            <div className="ft-fondunder">
              {uttak == null
                ? 'fondsverdi mangler for året'
                : uttak <= RETTESNOR
                  ? 'under rettesnoren på 3 prosent'
                  : 'over rettesnoren på 3 prosent'}
            </div>
          </div>
        </div>

        <div className="ft-fondgrafer">
          {pctAar.length > 1 && (
            <div className="ft-fondgraf">
              <div className="ft-stikkord">Uttak som andel av fondet</div>
              <div className="ft-fondgraf-flate">
                <LinjeGraf
                  serier={[
                    { farge: GULL, navn: 'Faktisk uttak', punkter: pctAar.map((y) => ({ v: uttakPct(y) })) },
                    { farge: '#6B6A66', stiplet: true, bredde: 1.5, navn: 'Rettesnor', punkter: pctAar.map(() => ({ v: RETTESNOR })) },
                  ]}
                  beskrivelse="Uttak fra Oljefondet som andel av fondets verdi, mot rettesnoren på 3 prosent" 
                  aar={pctAar}
                  W={520}
                  H={230}
                  mork
                  aksefmt={(v) => `${n1.format(v)} %`}
                  tips={(i) => {
                    const y = pctAar[i]
                    return {
                      tittel: String(y),
                      linjer: [
                        { farge: GULL, tekst: `Uttak: ${pct(uttakPct(y), 1)} av fondet` },
                        { farge: '#6B6A66', tekst: 'Rettesnor: 3,0 %' },
                        { farge: 'transparent', tekst: `Fondsverdi 1.1.: ${belopMill(data.fondsverdi[String(y - 1)])} kr` },
                      ],
                    }
                  }}
                />
              </div>
              <p className="ft-fondnote">Gul linje: faktisk uttak. Stiplet: rettesnoren på 3 prosent.</p>
            </div>
          )}

          {perAar.length > 1 && (
            <div className="ft-fondgraf">
              <div className="ft-fondgraf-topp">
                <span className="ft-stikkord">Uttak per innbygger, løpende kroner</span>
                <span className="ft-fondcagr num">{pct(cagr, 1)} i året</span>
              </div>
              <div className="ft-fondgraf-flate">
                <LinjeGraf
                  serier={[{ farge: GULL, navn: 'Uttak per innbygger', punkter: perAar.map((y) => ({ v: uttakPer(y) })) }]}
                  beskrivelse="Uttak fra Oljefondet per innbygger, i løpende kroner" 
                  aar={perAar}
                  W={520}
                  H={230}
                  mork
                  aksefmt={(v) => (v >= 1000 ? `${n0.format(Math.round(v / 1000))} 000` : n0.format(Math.round(v)))}
                  tips={(i) => {
                    const y = perAar[i]
                    const v = uttakPer(y)
                    const forrige = i > 0 ? uttakPer(perAar[i - 1]) : null
                    return {
                      tittel: String(y),
                      linjer: [
                        { farge: GULL, tekst: `${kr(Math.round(v / 100) * 100)} per innbygger` },
                        { farge: 'transparent', tekst: `Samlet uttak: ${belopMill(sumFondsoverforing(data.inntekter, y))} kr` },
                        forrige
                          ? { farge: 'transparent', tekst: `Mot året før: ${v >= forrige ? '+' : '−'}${pct(Math.abs(((v - forrige) / forrige) * 100), 1)}` }
                          : null,
                      ],
                    }
                  }}
                />
              </div>
              <p className="ft-fondnote">
                Fra {forste} til {siste} gikk uttaket fra {kr(Math.round(uttakPer(forste) / 100) * 100)} til{' '}
                {kr(Math.round(uttakPer(siste) / 100) * 100)} per innbygger – en årlig vekst på {pct(cagr, 1)} i
                løpende kroner.
              </p>
            </div>
          )}
        </div>

        <p className="ft-fotnote">
          Uttaksprosenten er beregnet som overføringen fra fondet (kap. 5800) delt på fondets markedsverdi
          ved inngangen til året. Regjeringens offisielle tall bruker det strukturelle oljekorrigerte
          underskuddet og kan avvike noe. Beløpene per innbygger er ikke justert for prisvekst.
        </p>
      </div>
    </section>
  )
}
