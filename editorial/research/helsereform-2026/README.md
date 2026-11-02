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

1. Etabler en samlet baseline fra Fellestalls database og supplerende SSB-serier. Fellestall skal inngå i beregninger og grafer, ikke bare nevnes som kilde. Etabler deretter en SSB-baseline for helseutgifter etter produsent/formål og finansiering, personell/årsverk og lønn, alder/folketall, institusjons- og hjemmetjenester, samt sykehusaktivitet. Les faktisk tabellmetadata før valg. Unngå å summere overlappende helse- og kommuneregnskap.
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

## Presisering fra administrator, 2. november 2026

Analysen skal bruke **både Fellestalls database og SSB**, og ha en egen seksjon om
politisk forankring. Dette er en eksplisitt tilleggsføring fra oppgavens chat.
Bestillingen, ønsket dato og plass i køen beholdes.

### Fellestalls eget tallgrunnlag

Følgende faktiske kapittel-ID-er er kontrollert i `web/public/data/utgifter.json`.
Dette er kildetilgjengelighet og avgrensning, ikke ferdig reformregnskap:

| Formål | Fellestall-ID | Bruk i analysen |
|---|---|---|
| Helse- og omsorgsdepartementet | `u-07` | Overordnet historisk regnskapsramme |
| Regionale helseforetak | `u-07-0732` | Statlige overføringer til spesialisthelsetjenesten; ikke automatisk RHF-administrasjon |
| Helsetjenester i kommunene mv. | `u-07-2755` | Refusjoner/folketrygd, med kontroll av postinnhold |
| Kommunale helse- og omsorgstjenester | `u-07-0760` | Navngitte statlige tilskudd og tiltak; ikke kommunenes totale utgifter |
| Psykisk helse og rusarbeid | `u-07-0765` | Historiske prioriteringer og relevante tiltak |
| IKT i helse- og omsorgssektoren | `u-07-0701` | Dokumentert statlig IKT-finansiering; ikke all digitalisering i sektoren |
| Helsedirektoratet | `u-07-0740` | Forvaltningsoppgaver; kontroller flytting av oppgaver mellom etater |

Fellestalls KOSTRA-arkiv under `web/public/data/kostra/` skal brukes til kommunale
helse- og omsorgsutgifter, funksjoner/arter, egenbetaling og relevante inntekter.
Kontroller faktisk dekning, år og regnskapsomfang før beregning. Suppler med
primærkilder der administrasjon, foretakskostnader eller andre nødvendige detaljer
ikke finnes som egen serie. Ikke sett overføringer til RHF lik administrative
kostnader, og ikke kall hele statlige tilskudd reformutgifter.

Lag minst én graf med Fellestalls regnskapsposter og én med kommunalt tallgrunnlag
når de relevante uttrekkene er avstemt. Koble disse til SSBs aktivitets-, personell-
og demografiserier med tydelige definisjoner. Vis historiske utgifter og et eget,
merket scenario for reformen. Historisk vekst er ikke et reformanslag.

### Avstemming før økonomiske scenarioer

- Skill statens overføringer fra mottakernes faktiske ressursbruk.
- Ikke summer samme krone først i statsregnskapet og deretter i kommune-/foretaksregnskapet.
- Kontroller konsern/kasse, brutto/netto, finansieringskilde og regnskap/budsjett.
- Undersøk historiske endringer i departement, etatsansvar og postnummer.
- Hold administrasjonsinnsparing, bortfalte lokalkostnader og frigjort arbeidstid
  atskilt. Oppgaver som flyttes til staten har fortsatt en kostnad.

### Egen politisk seksjon

Lag en kildebelagt matrise per hovedforslag: nærhelsetjenester, regional/statlig
styring, kommunestruktur, legevakt/AMK, finansieringsmodell og digitalisering/KI.
Oppgi hvem som foreslår, hvem som uttrykkelig støtter eller avviser, begrunnelsen,
kildedatoen og om standpunktet gjelder akkurat denne utredningen.

Skill mellom utvalgets flertall og mindretall, regjeringens forslag, partienes
uttalelser/programmer, høringssvar og vedtak i Stortinget. Undersøk ferske primærkilder
fra regjeringen og alle ni stortingspartier samt relevante kommunale aktører,
helseforetak og arbeidstakerorganisasjoner. Programstandpunkter som ligner et forslag
er bakgrunn, ikke automatisk støtte til hele reformen eller dokumentert gjennomslag.

«Hvem vil stritte imot, og hvorfor?» skal besvares i to tydelige deler:

1. **Dokumentert motstand:** navngitt aktør, konkret forslag, kildebelagt begrunnelse.
2. **Mulige konfliktlinjer:** en eksplisitt analytisk vurdering av blant annet lokal
   råderett, sentralisering, finansieringsansvar, arbeidsgiverforhold, personvern,
   pasientsikkerhet og gjennomføringskostnader. Dette er scenarioer, ikke påståtte
   motiver eller spådde stemmer. Manglende offentlig standpunkt oppgis som uavklart.

Vurder hvilke endringer som trenger lov, bevilgning, tariff-/arbeidsgiveravtaler
eller kommunale beslutninger. Ikke gi reformen en konstruert parlamentarisk
sannsynlighetsprosent.
