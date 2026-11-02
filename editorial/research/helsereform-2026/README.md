# Helsereformen – kontrollert arbeidsplan

Bestilling: `117452e6-471e-4f63-9271-d10fa35dc362`, ønsket skrivedato 2. november 2026. Bestillingen beholdes i køen. Dette er research og plan, ikke en levert eller publisert artikkel.

## Kontrollert primærkilde

NOU 2026:12, *Én helsetjeneste*, avgitt 2. november 2026. SHA-256: `b3a7c14bb2a21e8f1184de720396a5123415bb414a57e7c4e0635e19925ce51f`. Original-PDF ble hentet med HTTP 200 og har 476 PDF-sider. Lesing i denne økten: sammendragets anbefalinger og konsekvenskapitlet 33, særlig s. 406–409. Hele utredningen er ikke faglig gjennomgått.

Kilde: https://www.regjeringen.no/contentassets/8089c2908e604358ac67a5b9cbdf8d6e/no/pdfs/nou202620260012000dddpdfs.pdf

Viktige avgrensninger for den videre analysen:

- Dette er utvalgets forslag, ikke en vedtatt reform.
- Utvalget anbefaler fortsatt delt sørge-for-ansvar mellom stat og kommuner, samtidig med en nærhelsemodell og mer forpliktende samarbeid. Forslaget innebærer ikke at alle helsetjenester samles på ett forvaltningsnivå nå.
- Flertallets modell for spesialisthelsetjenesten innebærer at administrative oppgaver i de regionale helseforetakene flyttes til staten. Å fjerne RHF-navnet eller organisasjonen fjerner derfor ikke automatisk kostnadene ved oppgavene.
- Kapittel 33 beskriver vesentlige kostnader ved omstilling, lovendringer, digitale tjenester og nye plikter. Mange beløp må utredes nærmere. Det foreligger ikke her et ferdig samlet nettoanslag som kan brukes som en dokumentert innsparing.
- Potensielle gevinster omfatter blant annet færre innleggelser, mindre dobbeltarbeid, administrasjon og lokale støttefunksjoner. Frigjort tid, budsjettinnsparing og økt behandlingskapasitet er ulike resultater.

## Beregningsopplegg

1. Etabler en SSB-baseline for helseutgifter etter produsent/formål og finansiering, personell/årsverk og lønn, alder/folketall, institusjons- og hjemmetjenester, samt sykehusaktivitet. Les faktisk tabellmetadata før valg. Unngå å summere overlappende helse- og kommuneregnskap.
2. Sammenstill historiske observerte data separat fra SSB-framskrivinger. Merk siste år, revisjoner, prisbasis og avgrensning.
3. Sett opp en transparent scenarioidentitet: netto budsjetteffekt = unngåtte kostnader + faktisk bortfalt administrasjon − nye driftskostnader − årlig omstillingskostnad. Finansieringsoverføringer mellom stat og kommune er ikke en samfunnsøkonomisk gevinst.
4. Beregn tid separat: frigjorte årsverk = berørte årsverk × tidsbesparelse × faktisk realisering. Fordel mellom mer pasienttid, redusert overtid/innleie og faktisk kostnadsreduksjon. Ikke tell samme gevinst to ganger.
5. Interaktive antakelser må være tydelig merket som scenarioer, aldri som utvalgets anslag. Bruk dokumenterte utgangsverdier; vis break-even og følsomhet for investeringer, varig drift, innfasing og realiseringsgrad.
6. Kvalitet og trygghet må ha egne mål. Et lavere kostnadsanslag dokumenterer ikke kortere ventetid, færre feil eller bedre behandling. Digitalisering og KI krever kompetanse, kontroll, ansvar og sikkerhet, ikke bare en produktivitetsprosent.

## Konkret leveringsblokkering

Eksisterende `pipeline-reports.mjs` og artikkelskjema støtter bare kontrollerte regnskapsrapporter, budsjettforslag/-vedtak og oljepengerapporter. Bestillingen krever en kilde- og scenariorapport med egne inndata, formler, validering og interaktiv visning. En generell rapport om Helse- og omsorgsdepartementets regnskap vil ikke besvare den. Ikke merk temaet levert eller erstatt det med et annet. I tillegg prioriterer eksisterende flyt revisjonen i åpen PR #82 og sperrer nye ordinære utkast mens den venter.

Neste implementeringssteg er en avgrenset rapporttype for dokumentert policyanalyse og økonomiske scenarioer som gjennomgår de samme kilde-, bot-, forhåndsvisnings- og eksakte godkjenningskontrollene. Ingen publisering eller nytt AI-API er nødvendig for dette.

## Foreløpig SSB-kartlegging

API-søk er utført 2. november 2026. Dette er kandidater, ikke ferdige uttrekk eller validerte beregningsserier.

- Tabell 07940: 07940: Utdanningsnivå og kommunefordeling blant sysselsatte i helse- og sosialtjenester. 4. kvartal (K) 2008-2025 (siste oppgitte periode 2025).
- Tabell 10742: 10742: Avtalte årsverk i familievernet, etter region, utdanning og kjønn 2013-2025 (siste oppgitte periode 2025).
- Tabell 11650: 11650: Barnevernsinstitusjoner. Avtalte årsverk eksklusive lange fravær, etter personellets utdanning, institusjonens eierskap og institusjonstype 2007-2024 (siste oppgitte periode 2024).
- Tabell 11918: 11918: Avtalte årsverk i kommunal sektor, etter regnskapsomfang og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07941: 07941: Næringsfordeling blant sysselsatte med helse- og sosialfaglig utdanning (19 grupper). 4. kvartal 2008-2025 (siste oppgitte periode 2025).
- Tabell 12418: 12418: Utvalgte nøkkeltall for helse og omsorg - bydeler (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 12405: 12405: Legeårsverk i kommunale helse- og omsorgstjenester - bydeler, etter avtaleform og funksjon (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 12406: 12406: Fysioterapeutårsverk i kommunale helse- og omsorgstjenester - bydeler, etter avtaleform og funksjon (B) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07938: 07938: Kjønn- og aldersfordeling blant personer med helse- og sosialfaglig utdanning (28 grupper). 4. kvartal 2008-2025 (siste oppgitte periode 2025).
- Tabell 12209: 12209: Utvalgte nøkkeltall for helse og omsorg (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 11996: 11996: Legeårsverk i kommunale helse- og omsorgstjenester, etter avtaleform og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 11995: 11995: Fysioterapeutårsverk i kommunale helse- og omsorgstjenester, etter avtaleform og funksjon (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 13953: 13953: Årsverk i spesialisthelsetjenesten, etter yrke, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 13954: 13954: Årsverk i spesialisthelsetjenesten, etter utdanning, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 14080: 14080: Årsverk for legespesialister og psykologer i spesialisthelsetjenesten, etter spesialitet, tjenesteområde og helseforetak 2008-2025 (siste oppgitte periode 2025).
- Tabell 14533: 14533: Årsverk i omsorgstjenestene, etter yrke (K) 2015-2025 (siste oppgitte periode 2025).
- Tabell 07944: 07944: Sektor- og kommunefordeling blant sysselsatte i helse- og sosialtjenester med helse- og sosialfaglig utdanning (27 grupper). 4. kvartal (K) 2008-2025 (siste oppgitte periode 2025).
- Tabell 07935: 07935: Spesialistutdanning for leger, tannleger, optikere og sykepleiere, etter alder og kjønn. 4. kvartal 2008-2025 (siste oppgitte periode 2025).
