import React from 'react'
import { n0 } from '../tall'

/** Metodedelen: hva tallene er, og hva som er holdt utenfor. */
export default function OmTallene({ meta, antallPoster }) {
  const oppdatert = new Date(meta.oppdatert).toLocaleDateString('nb-NO', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <section id="om-tallene" className="ft-seksjon" data-avslor>
      <div className="ft-seksjonstekst ft-seksjonstopp">
        <div><h2>Om tallene</h2></div>
      </div>
      <div className="ft-metode">
        <div>
          <h3>Kilder</h3>
          <p>
            Regnskaps- og bevilgningstall fra DFØ Statsregnskapet (NLOD). Folketall, konsumprisindeks og
            bruttonasjonalprodukt fra SSB (CC BY 4.0). Oljefondets markedsverdi ved årsslutt fra NBIMs
            årsrapporter. Sist oppdatert {oppdatert}.
          </p>
        </div>
        <div>
          <h3>Brutto, ikke netto</h3>
          <p>
            Tallene er brutto utgifter og inntekter per kapittel og post. Nettobudsjetterte virksomheter,
            som universitetene, rapporterer artskonto uten gyldig kapittel og er holdt utenfor hierarkiet.
            Beløp i millioner kroner, løpende priser – ikke justert for prisvekst der det ikke står noe annet.
          </p>
        </div>
        <div>
          <h3>Det som er filtrert bort</h3>
          <p>
            Poster 90–99 er finanstransaksjoner: utlån, avdrag og kjøp av aksjer. De flytter penger mellom
            statens egne kontoer og blåser opp totalen. Kapittel 2800 og 5800 er overføringer til og fra
            Oljefondet. Begge er skjult som standard, men kan slås på i utforskeren.
          </p>
        </div>
      </div>
      <div className="ft-metodefot">
        <span>Data fra DFØ og SSB · {meta.regnskap_aar[0]}–{meta.siste_budsjett_aar}</span>
        <span>{n0.format(antallPoster)} poster i datagrunnlaget</span>
      </div>
    </section>
  )
}
