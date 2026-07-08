import React, { useEffect } from 'react'
import './OmTallene.css'

/** Modal som forklarer begrepene bak tallene. */
export default function OmTallene({ onLukk, meta }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onLukk()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onLukk])

  return (
    <div className="modal-bakgrunn" onClick={onLukk} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="om-tittel"
        onClick={e => e.stopPropagation()}>
        <div className="modal-topp">
          <h2 id="om-tittel">Om tallene</h2>
          <button className="modal-lukk" onClick={onLukk} aria-label="Lukk">×</button>
        </div>

        <div className="modal-innhold">
          <h3>Hvor kommer dataene fra?</h3>
          <p>
            Regnskaps- og budsjettall er hentet fra <a href="https://statsregnskapet.dfo.no"
            target="_blank" rel="noopener noreferrer">DFØ Statsregnskapet</a> (oppdateres månedlig).
            Folketall, konsumprisindeks og BNP er hentet fra <a href="https://www.ssb.no"
            target="_blank" rel="noopener noreferrer">SSB</a>s åpne API. Alle tall kan spores
            tilbake til nedlastede kildefiler – ingenting er anslått eller hardkodet.
          </p>

          <h3>Brutto, ikke netto</h3>
          <p>
            Utgifter og inntekter vises hver for seg i brutto. De fleste statlige virksomheter
            er bruttobudsjettert: de fører utgifter og inntekter separat, ikke som et nettotall.
          </p>

          <h3>Hva postnummeret betyr</h3>
          <p>
            Hver post har et nummer som følger statens standard kontoplan
            (bevilgningsreglementet). Nummeret forteller <em>hva slags</em> utgift eller
            inntekt det er – derfor viser hver post en liten type-merkelapp og en forklaring
            når du borer helt ned til postnivå. Grovinndelingen:
          </p>
          <ul>
            <li><strong>Utgifter:</strong> 01–29 drift · 30–49 investeringer · 50–59 til statlige
              mottakere/fond · 60–69 til kommuner · 70–89 tilskudd og stønader til private ·
              90–99 lånetransaksjoner.</li>
            <li><strong>Inntekter:</strong> 01–29 salg og gebyrer · 30–49 salg av eiendom ·
              50–69 overføringer · 70–89 skatter og avgifter · 90–99 tilbakebetalinger.</li>
          </ul>
          <p>
            For gjengangere med et veldefinert innhold (de store skattene, folketrygdytelsene,
            rammetilskudd m.m.) viser vi i tillegg en klarspråklig forklaring av selve ordningen.
          </p>

          <h3>Finanstransaksjoner (90-poster)</h3>
          <p>
            Poster med nummer 90–99 er utlån, avdrag og kjøp/salg av aksjer – finansielle
            transaksjoner som blåser opp bruttotallene uten å være «vanlige» utgifter.
            De er skjult som standard, men kan vises med bryteren øverst.
          </p>

          <h3>Statens pensjonsfond utland (SPU)</h3>
          <p>
            Overføringer til og fra oljefondet (kapittel 2800 og 5800) er svært store og
            forvrenger totalbildet. De er merket «SPU» og skjules sammen med finanstransaksjonene.
          </p>

          <h3>Saldert vs. revidert budsjett</h3>
          <p>
            <strong>Saldert budsjett</strong> er Stortingets opprinnelige vedtak før årsskiftet.
            <strong> Revidert budsjett</strong> inkluderer endringene som gjøres gjennom året
            (revidert nasjonalbudsjett, nysaldering og tilleggsbevilgninger).
          </p>

          <h3>Prognoseår</h3>
          <p>
            Det siste året ({meta?.siste_budsjett_aar}) har vedtatt budsjett, men ikke ferdig
            regnskap. Regnskapslinjen stopper der regnskapet slutter, og budsjettet vises som
            en stiplet forlengelse merket «prognose».
          </p>

          <h3>Visningsmoduser</h3>
          <ul>
            <li><strong>Løpende kr</strong> – beløp i årets egne kroner.</li>
            <li><strong>Faste kroner</strong> – justert for prisvekst (KPI), så beløp fra ulike
              år kan sammenlignes reelt. Basisår: {meta?.kpi_basisaar}.</li>
            <li><strong>Per innbygger</strong> – delt på folketallet det året.</li>
            <li><strong>% av BNP</strong> – som andel av bruttonasjonalproduktet.</li>
          </ul>

          <h3>Artskonto</h3>
          <p>
            På det dypeste nivået fordeles hver post på artskonto etter statens standard
            kontoplan – lønn, kjøp av varer og tjenester, investeringer, overføringer osv.
          </p>

          <h3>Nettobudsjetterte virksomheter</h3>
          <p>
            Universiteter, høyskoler og enkelte andre virksomheter rapporterer kostnader på
            artskonto, men ikke på kapittel/post. Disse radene holdes utenfor kapittel/post-
            hierarkiet for ikke å ødelegge aggregeringen, og logges i ETL-en.
          </p>
        </div>
      </div>
    </div>
  )
}
