# Budsjettforslag, vedtak og analyser

Oppdatert 5. oktober 2026. Brukeren har valgt **«Regjeringens budsjettforslag»** for Gul bok. Dette er forslaget til statsbudsjett 2027, ikke revidert nasjonalbudsjett (RNB). RNB er en egen fase senere. Bruk ingen separat AI-API; teksten skrives av den native AI-oppgaven og publiseres først etter menneskelig godkjenning av den eksakte versjonen.

## Offisiell fremleggelse og automatisk import

Regjeringen oppgir onsdag **7. oktober 2026 klokken 10.00, Europe/Oslo**. Enkelte nøkkeltall kommer klokken 08.00. Bekreftet kilde:
https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/

`budget-proposal.yml` leter etter regjeringens faktiske lenke til «Tallgrunnlag Gul bok», deretter Excel-filen. Den særskilte planen forsøker import hvert halvtime fra **10.15 til 16.45 norsk tid på fremleggelsesdagen i 2026**. GitHub kan forsinke planlagte kjøringer. Før filen finnes, endres ingen data. Ingen konstruert Excel-adresse brukes. Endret kolonnemodell, tvetydig kilde, feil år, duplikate poster eller ugyldige beløp stopper importen.

Data leses fra arkfanen `Data`, med `fdep_nr` som departementsidentitet og kapittel/post som stabil sammenligningsnøkkel. Kildens kroner normaliseres til mill. kroner. Importen er prøvd mot regjeringens faktiske 2026-fil, med 1 600 poster. Ingen prøvefil eller prøveanalyse skal publiseres som 2027-data.

```sh
python etl/budget_proposals.py --year 2027
```

Forslaget legges i en egen `forslag`-serie. Det blir tilgjengelig i «Utforsk staten» og «Hva økte, hva ble kuttet» med gjeldende design. Ved valg av et aktivt forslagsår velges forslaget automatisk. Fremtidige folketall og KPI-er brukes ikke som faktiske observasjoner.

## Arkiv og overgang til vedtatt budsjett

Arkivet ligger i `web/public/data/budsjettarkiv/`, med katalog `index.json`. Hver versjon har SHA-256, kilde-URL, original Excel-fil og normaliserte kapittel/post-beløp. Et nytt eller korrigert forslag blir en ny arkivversjon; eksisterende versjoner overskrives ikke.

`budget-monitor.yml` kontrollerer ferske DFØ-bevilgninger daglig klokken **06.20 UTC** når et forslag venter på vedtak. Det er 08.20 ved sommertid og 07.20 ved vintertid. Ordinær månedlig ETL gjør også samme avstemming og laster bevilgningshistorikken på nytt i stedet for å stole på gammel råfilcache.

For det ordinære budsjettet kreves faktiske saldert-rader og positive totaler på både utgifts- og inntektssiden. Deretter arkiveres vedtaket, forslaget fjernes fra den synlige serien og saldert budsjett overtar. Forslagsarkivet forblir tilgjengelig for nye analyser. Et forsvunnet allerede vedtatt budsjett skal gi feil, ikke gjeninnføre et gammelt forslag.

RNB har fase `revised`, fryser samme års budsjett før forslaget som sammenligningsgrunnlag og trenger særskilt bekreftelse. DFØs `revidert` betyr løpende sum av endringsvedtak, også utenom RNB, og er ikke bevis på fullført RNB-behandling. Bekreftelse krever et kontrollert Stortings-sitat om vedtatt RNB for året **og den eksakte RNB-vedtaksteksten i ferske DFØ-rader**. Først da fryses RNB-utfallet. Senere tilleggsbevilgninger endrer nettstedets ordinære statistikk, men overskriver ikke dette utfallet.

RNB-arkivering og overgang er testet med kontrollerte testdata. Automatisk kildeoppdagelse og Excel-leser er foreløpig verifisert for ordinær Gul bok; regjeringens faktiske RNB-tabellformat og URL må kontrolleres og få en passende importør når de foreligger. Ikke merk en ordinær Gul bok-fil som et reelt RNB-forslag.

## Analyseformat og redaksjonelle krav

`prepare.mjs` prioriterer nye, arkiverte budsjetter før historiske temaer. `budget-report.mjs` beregner rapporttype `budget-comparison`:

- Nytt forslag mot forrige års salderte budsjett, eller RNB-forslaget mot den frosne sammeårsbasen.
- Arkivert forslag mot vedtatt budsjett når vedtaket blir tilgjengelig.
- Tre grafer: samlet budsjett, største postøkninger/kutt og en nedbryting som summerer til nettoendringen. Posttabell, metode, kilder, forbehold og Sven-byline beholdes.

Sammenligningen følger kapittel/post ved departementsflyttinger. Utgiftsanalysen utelater finansposter og overføringer til Oljefondet. Beløp er løpende kroner; ikke kall nominell vekst realvekst. Nye og fjernede poster, ansvarsflyttinger og engangsbevilgninger må undersøkes mot dokumentene før de forklares.

Les både tallgrunnlaget og regjeringens budsjettdokumenter. En god førstegjennomgang svarer på hvor pengene flyttes og hvilke dokumenterte tiltak som forklarer det. Overskriften skal ha en konkret, etterprøvbar krok. La grafer og spørsmål føre leseren mot implikasjonene. Unngå dataoppramsing. LinkedIn trenger tørr, vennlig humor og et åpent spørsmål artikkelen faktisk besvarer. Ingen politisk slagside eller udokumentert årsaksforklaring.

## Dokumentert politisk gjennomslag

Tallforskjellen dokumenterer en endring, ikke hvem som fikk den gjennom. Politiske påstander krever kobling mellom konkret post og budsjettavtale, komitéinnstilling eller vedtak. En votering dokumenterer støtte, ikke nødvendigvis forhandlingsseier eller eierskap. En kildekontroll av sitat og partinavn er nødvendig, men erstatter ikke faglig lesing av sammenhengen.

Den native AI-en kan levere **bare** `editorial/handoff/budget-evidence.json` på en gren `analysis/budget-evidence-<unik-id>` opprettet fra oppdatert main. Push starter `budget-evidence.yml`. Workflowen kjører Python fra betrodd main, kontrollerer skriveadgang og at leveringsgrenen kun endrer denne JSON-filen, og henter faktiske kilder på nytt. Sitater, år, partinavn og postnøkler kontrolleres, og tekstversjonen arkiveres. Nettstedets data oppdateres; ingen artikkel eller LinkedIn-tekst publiseres.

Pakken har dette formatet (plassholderne er dokumentasjon, ikke ekte kildedata):

```json
{
  "version": 1,
  "year": 2027,
  "phase": "initial",
  "evidence": [
    {
      "url": "https://www.stortinget.no/<faktisk-offisiell-side>",
      "kind": "agreement",
      "parties": ["Ap", "SV"],
      "recordKeys": ["<faktisk-kapittel-post>"],
      "quote": "<ordrett sitat fra siden, med dokumenterte partier>"
    }
  ]
}
```

Tillatte typer er `agreement`, `committee-recommendation`, `vote` og `adopted-amendment`. For RNB kan pakken også ha `rnbDecision` med offisiell Stortings-URL, ordrett vedtakssitat med år og `dfoDecision` lik den eksakte RNB-teksten i DFØs `Bevilgning`-felt. `phase` må da være `revised`. Generer aldri dette feltet ved å gjette proposisjonsnummer.

Vent på vellykket kildekontroll, hent oppdatert main og kontroller deretter rapporten med `prepare.mjs`. Rapporten må inkludere den arkiverte dokumentasjonen før teksten leveres. Uten dokumentasjon: lever en analyse av endringene og avgrens politiske konklusjoner, eller utsett analysen hvis partigjennomslag er hovedproblemstillingen.

## Native AI-kjøring på onsdag: egen forutsetning

### Ressurser og utvidet oppdrag vedtatt 5. oktober

Brukeren ønsker en større analyse med vesentlige ressurser og grundig forhåndsresearch om alle stortingspartiene. Les `editorial/research/budsjett-2027/README.md`, `partier.md`, `sources.json` og baseline før arbeidet starter. Partiprofilene og sammenligningsmatrisen er nå kildebelagt, og alle ni partisider samt Stortingets API fungerer. Kontroller resterende fulltekstkilder som er merket utilgjengelige, og oppdater profilene med ferske 2027-krav før publisering. Ikke erstatt kildearbeid med generelle antakelser om partiene.

Dette er en uttrykkelig ekstra analyse utover den vanlige ukerytmen. Sikt mot **2 500–3 500 ord og åtte til ti seksjoner**, innenfor eksisterende artikkelskjema. Bruk den sterkeste tilgjengelige modellen og høy tilgjengelig resonneringsinnsats i den native oppgaven. Gjennomfør egne gjennomganger av kildegrunnlag, beregninger, politiske konklusjoner og redaksjonell tekst. Instruksen endrer ikke modellinnstillinger eller reserverer faktisk kvote; slike innstillinger må være tilgjengelige i oppgaven. Ingen separat AI-API.

Arbeidsrekkefølgen er: verifiser import og dokumentversjon; les nasjonalbudsjettet, Gul bok, skatteforslaget og relevante fagproposisjoner; forklar de største endringsdriverne; sammenhold konkrete partiløfter med faktiske forslag; undersøk nettoeffekten for berørte grupper; kontroller alle konklusjoner mot kildene; skriv og vurder mobilutkastet; lever til menneskelig godkjenning.

Skill politisk samsvar på fremleggelsesdagen fra dokumentert forhandlingsgjennomslag etter Stortingets behandling. Vis konkrete oppfylte eller uoppfylte krav med begrunnelse, heller enn en samlet partikarakter. Skatteproveny alene viser ikke skatteendring for husholdninger. Kommunerammen må vurderes etter kostnader, demografi og oppgaver, og med riktig sammenligningsbase. Kontroller historiske postnavn før omtale. Bruk offisielle fremtidige prisanslag som anslag, aldri som observerte KPI-er.

Partienes originalkilder må kunne dokumenteres i artikkelens kontrollerte kildegrunnlag. Dagens parlamentariske `budget-evidence` skal ikke brukes til å kamuflere partiprogrammer som forlik. Nødvendig utvidelse av kildehåndteringen må være kontrollert før slike vurderinger leveres.

En oppstart rundt klokken 11 er ikke en leveringsfrist. Forsvarsdepartementet presenterer budsjettet klokken 14, ifølge den kontrollerte invitasjonen i researchregisteret. Dersom forsvar er en vesentlig driver, les også denne presentasjonen før hovedkonklusjonen låses. Prioriter et grundig utkast senere samme dag fremfor tidlig, ufullstendig levering. Publisering samme dag avhenger av faktisk datatilgang, særskilt AI-kjøring og menneskelig godkjenning.

Velg én til syv relevante grafer etter docs/analysis-charts-topics.md, og behold designet og Sven-byline. Mer tekst skal gi leseren flere forklarte sammenhenger, ikke flere løsrevne tall. LinkedIn-teksten skal fortsatt være kort, med den avtalte Unicode-innledningen, en konkret krok, tørr vennlig humor og et spørsmål hovedanalysen besvarer. Kontroller teksten mot feltgrensen og publiseringsflyten.

GitHub-workflowene importerer og validerer data. De starter ikke den native AI-en. Den eksisterende AI-oppgaven kjører mandager, og denne økten har ikke verktøy for å opprette eller endre oppgaven i den andre samtalen. **En særskilt onsdagskjøring er derfor ikke opprettet her.**

Bruk denne instruksen i den eksisterende oppgavens chat for en særskilt kjøring onsdag 7. oktober 2026, for eksempel klokken **11.00 Europe/Oslo**. Ikke erstatt mandagsplanen:

> Gjør en ekstra Fellestall-analyse på budsjettdagen. Hent oppdatert main i Lippen1995/Project_statsbudsjett og les docs/budsjettdagen-2027.md og docs/codex-weekly-analysis.md. Kontroller at det faktiske 2027-forslaget er importert, og les regjeringens faktiske budsjettdokumenter før du skriver. Hvis filen ikke er tilgjengelig, rapporter dette og avtal nytt forsøk; ikke lever en historisk analyse som om den var budsjettanalysen. Skriv selv uten AI-API. Bruk prepare.mjs, kontrollerte fakta, tre budsjettgrafer og eksisterende botlevering med versjonsbundet forhåndsvisning og menneskelig godkjenning. Bekreft faktisk PR og fungerende forhåndsvisning før du melder ferdig. LinkedIn forblir deaktivert til tilgang er kontrollert.

Når vedtak senere blir tilgjengelig, vil neste native kjøring kunne velge forslag-mot-vedtak-analysen. Daglig dataimport innebærer ikke daglig AI-produksjon. Publisering samme dag krever også at godkjenneren rekker å godkjenne utkastet.

## Verifikasjon

Importen er prøvd mot den offisielle Gul bok-filen for 2026. Tester dekker egen forslagsserie, uendrede eksisterende bevilgninger, arkiv og originalfil, gjentatt/korrigert import, manglende/ugyldige tall, DFØ-overgang, postflytting, kontrollert politisk dokumentasjon og at RNB krever både kildebevis og DFØ-vedtak. Verifisert: 108 JavaScript-tester og 85 Python-tester, workflow-syntaks, produksjonsbygg/SEO, tre faktiske budsjettgrafer på mobil uten horisontal sideflyt, Sven-byline og forslagsvelger. En SVG-tittel som gav ulik server-/klientstruktur ble rettet; mobilvisningen lastes nå uten React-feil. Faktiske 2027-data kan først prøves når regjeringen publiserer dem.

## SSB-bakgrunn til budsjettanalysen

Les `docs/ssb-analysis-research.md`. Undersøk relevante befolknings-, pris-/lønns- og arbeidsmarkedsvariabler før forklaringer på utgiftsveksten låses. Bruk scope `budget:2027` for denne analysen, og noter at siste observerte år kan være tidligere enn budsjettåret. Uttrekk må kontrolleres og arkiveres før rapporten bygges på nytt. Ingen årsaksandel utledes fra samtidige endringer alene.

### Grafvalg og smal temakontroll

Les `docs/analysis-charts-topics.md`. Antallet grafer er én til syv; inkluder SSB-bakgrunn når det styrker forklaringen. Ikke omtale selve innføringen av SSB-data. Årets forslag, samme års vedtak og RNB har egne, tydelig avgrensede hendelser. Et nytt talluttrekk fra samme forslag gir ikke en ny ordinær problemstilling.
