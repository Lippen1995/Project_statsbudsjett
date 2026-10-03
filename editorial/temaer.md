# Vinkler til de første fire analysene

Klargjort 2. oktober 2026 mens LinkedIn-søknaden behandles. Piloten er et komplett utkast; de øvrige punktene er redaksjonelle forslag med beregnet kontrollgrunnlag. Ingen av dem er menneskelig godkjent eller publisert. Rekkefølgen under er et forslag, ikke en aktiv publiseringskø eller en endring av automatikkens emnevalg.

## Statens regning har vokst 86,5 %. Hva holder den oppe?

- Komplett [pilotutkast](drafts/pilot.md) og [PDF til gjennomgang](review/pilot-til-gjennomgang.pdf).
- Avgrensning: statens regnskapsførte utgifter 2014–2025, uten finansposter og SPU-overføringer.
- Kontrollgrunnlag: 86,5 % vekst i løpende utgifter; 21,1 % vekst per innbygger etter KPI-justering.
- Leserspørsmål: Hvorfor vendte ikke totalnivået tilbake da samfunnet åpnet igjen? Vi følger utvalgte kriseposter, militær Ukraina-støtte og pensjonsutgifter for å undersøke endringen i innhold.
- Mål for gjennomgangen: prøve en fengende, saklig fortelling med virkelige hendelser, tre grafer, posttabell og et nytt LinkedIn-utkast på mobil. Dette er eksempler, ikke en full fordeling av veksten. Piloten er fortsatt et utkast.

## Helseregningen vokser. Men kronen krymper.

- Avgrensning: regnskapsførte utgifter under Helse- og omsorgsdepartementet, 2020–2025, samme filtre som Fellestall. Dette er ikke all offentlig helsebruk; kommunenes utgifter inngår ikke som en egen helseserie.
- Kontrollgrunnlag: 34,0 % vekst i løpende utgifter; 4,8 % vekst per innbygger etter KPI-justering.
- Leserspørsmål: Hvor mye av økningen står igjen når priser og folketall tas med?
- Forbehold som må følge artikkelen: KPI beskriver husholdningenes handlekurv, og regnskapet måler ikke behandlinger, ventetid eller kvalitet. Startåret er et enkelt sammenligningspunkt, ikke en dokumentert normaltilstand. Endringer i departementets oppgaver må omtales.

## Samferdselsregningen: Mer på kvitteringen, mindre i faste kroner.

- Avgrensning: regnskapsførte utgifter under Samferdselsdepartementet, 2020–2025, samme filtre som Fellestall.
- Kontrollgrunnlag: 17,4 % vekst i løpende utgifter; 8,2 % nedgang per innbygger etter KPI-justering.
- Leserspørsmål: Hvordan kan utgiftene vokse samtidig som det prisjusterte beløpet per innbygger faller?
- Forbehold som må følge artikkelen: Summen er ikke et mål på kilometer vei, togtilbud eller transportkvalitet. Investeringsutgifter og endringer i ansvarsområder kan påvirke sammenligningen. En eventuell forklaring på endringen trenger egen dokumentasjon.

## Kunnskap har også en prislapp. Hva skjedde med den?

- Avgrensning: regnskapsførte utgifter under Kunnskapsdepartementet, 2020–2025, samme filtre som Fellestall.
- Kontrollgrunnlag: 10,5 % vekst i løpende utgifter; 13,6 % nedgang per innbygger etter KPI-justering.
- Leserspørsmål: Hva forteller departementets samlede regnskap når vi bruker samme målestokk gjennom perioden?
- Forbehold som må følge artikkelen: Tallene beskriver departementets avgrensning, ikke all norsk utdanningsbruk. Regnskapet dokumenterer ikke læringsutbytte eller pengebruk per elev. Endrede oppgaver må vurderes før en eventuell tolkning av veksten.

## Kontrollgrunnlag og neste steg

Beregningene er gjort med `scripts/analyser/report.mjs` mot Fellestalls eksisterende data, oppdatert 23. september 2026. Departements-ID-er: `u-07` for helse, `u-13` for samferdsel og `u-02` for kunnskap. Departementsforslagene bruker 2020–2025, slik at de passer dagens kontrollerte rapporttype.

Før hvert forslag kan publiseres, må det få en komplett analyse med grafer, faglig vurdering, metode, kilder, begrensninger og et kort LinkedIn-utkast. Begge tekstene skal gjennom den avtalte menneskelige godkjenningen. LinkedIn-publisering venter i tillegg på API-tilgang og kontrollert tilkobling. Nettsidepublisering kan prøves med `LINKEDIN_ENABLED` deaktivert.
