import React from "react";
import { PURCHASE_REMAINDER } from "./accounting-drill";

const descriptions = {
  AG16: ["Lønn og sosiale kostnader etter refusjon.", "Omfatter lønn, pensjon og arbeidsgiveravgift. Sykelønnsrefusjon er trukket fra."],
  A090: ["Pensjon og trekkpliktige forsikringer.", "Arbeidsgiverens pensjonsinnskudd og trekkpliktige forsikringsordninger. Beløpet inngår i lønnsposten."],
  A099: ["Arbeidsgiveravgift på avgiftspliktige ytelser.", "Kommunens arbeidsgiveravgift på avgiftspliktige lønns- og pensjonskostnader. Beløpet inngår i lønnsposten."],
  A710: ["Refusjon for lønn ved sykefravær.", "Refusjon for blant annet sykepenger og foreldrepenger. Refusjonen trekkes fra ved beregning av lønnsposten."],
  AGD50: ["Innkjøp til tjenester kommunen selv leverer.", "Omfatter varer og tjenester som brukes i kommunens egen drift, for eksempel utstyr, lisenser og ekstern rådgivning."],
  A260: ["Innkjøpt renhold og vaskeri.", "Omfatter kjøp av renhold, tekstilvask og innleid renholdspersonale."],
  A270: ["Andre innkjøpte tjenester til egen drift.", "Kan omfatte konsulenttjenester, juridisk bistand, vikarbyrå, bedriftshelsetjenester og tolking. SSB viser beløpet samlet for den valgte funksjonen."],
  [PURCHASE_REMAINDER]: ["Resten av innkjøpene til egen drift.", "Beregnes for hver kommune som samlet kjøp til egen produksjon minus art 260 og 270. Beløpet kan inkludere lisenser, IT-drift og utstyr. SSB-tabellen oppgir ingen egen fordeling av denne resten."],
  AGD51: ["Kjøp der en ekstern leverandør utfører tjenesten.", "Kommunen kjøper en tjeneste som erstatter kommunal egenproduksjon, for eksempel en plass i en privat institusjon."],
  AG34: ["Tilskudd og andre overføringer.", "Utbetalinger uten krav om at mottakeren leverer en vare eller tjeneste som motytelse. Merverdiavgiftsutgifter er utelatt fra gruppen."],
  A590: ["Årets avskrivning på varige driftsmidler.", "Fordeler kostnaden for blant annet bygg og utstyr over den økonomiske levetiden. Avskrivningen representerer ingen ny utbetaling i året."],
  A600: ["Betaling fra brukerne av tjenesten.", "Kommunens inntekter fra egenbetaling for tjenester, for eksempel foreldrebetaling eller betaling for opphold."],
  AGD34: ["Andre salgs- og leieinntekter.", "Omfatter blant annet inntekter fra salg, leie og gebyrer som er ført på den valgte funksjonen."],
  AG48: ["Refusjoner og overføringer med krav til motytelse.", "Inntekter knyttet til en motytelse eller refusjon av utgifter. Merverdiavgiftskompensasjon er utelatt fra denne gruppen."],
  AGD49: ["Overføringer uten krav til motytelse.", "Inntekter som er rapportert som overføringer uten krav om levering av en konkret vare eller tjeneste."],
  AGD28: ["Finansinntekter ført på funksjonen.", "Omfatter rapporterte finansinntekter og finanstransaksjoner. Motposten for avskrivninger er utelatt."],
};

export default function ArtExplanations({ rows }) {
  return (
    <aside className="cmp-art-explanations" aria-label="Hva innebærer postene?">
      <h3>Hva innebærer postene?</h3>
      {rows.map(({ code, label, axisCode }) => {
        const description = descriptions[code];
        if (!description) return null;
        const [short, detail] = description;
        const preview = detail.length > 165 ? detail.slice(0, 165).replace(/\s+\S*$/, "") + " …" : detail;
        return (
          <details key={code}>
            <summary>
              <strong>{axisCode && `${axisCode.replace(/^A(?=\d)/, "")} · `}{label}</strong>
              <span>{short}</span>
              <span className="cmp-art-preview" aria-hidden="true">{preview}</span>
            </summary>
            <p>{detail}</p>
          </details>
        );
      })}
      <a href="https://www.regjeringen.no/no/dokumenter/veileder-til-kontoplanen-i-kostra-for-2025/id3072354/" target="_blank" rel="noreferrer">KOSTRAs kontoplan ↗</a>
    </aside>
  );
}
