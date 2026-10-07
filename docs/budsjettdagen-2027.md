# Budsjettforslag, vedtak og analyser

Oppdatert 6. oktober 2026. Brukeren har valgt **«Regjeringens budsjettforslag»** for Gul bok. Dette er forslaget til statsbudsjett 2027, ikke revidert nasjonalbudsjett (RNB). RNB er en egen fase senere. Bruk ingen separat AI-API; teksten skrives av den native AI-oppgaven og publiseres først etter menneskelig godkjenning av den eksakte versjonen.

## Offisiell fremleggelse og automatisk import

Regjeringen oppgir onsdag **7. oktober 2026 klokken 10.00, Europe/Oslo**. Enkelte nøkkeltall kommer klokken 08.00. Bekreftet kilde:
https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/

Kildehentingen til `budget-proposal.yml` skjer nå i det native arbeidsmiljøet. `python etl/budget_sources.py --capture --year 2027` følger regjeringens faktiske lenke til «Tallgrunnlag Gul bok», deretter Excel-filen, og bevarer de originale HTTPS-svarene i `editorial/research/budsjett-2027/import-evidence/`. Stage bare denne katalogen og bruk `python scripts/commit-generated.py --allowed-root editorial/research/budsjett-2027/import-evidence --message 'budget: oppdater offisielle importkilder'`. Push til main starter GitHub-jobben, som kontrollerer ferskhet (maks seks timer), SHA-256, offisielle adresser og budsjettår, gjentar discovery fra originalsidene og kjører samme Excel-leser, arkivering og avstemming. Ingen ferdigberegnede beløp tas fra kildepakken.

GitHubs tidligere halvtimeplan er fjernet fordi den bruker en blokkert forbindelse. Den native importoppgaven forsøker fra **10.15 til 16.15 norsk tid 7. oktober 2026, hver time**; planleggeren støtter ikke halvtimeintervall. Analyseoppgaven klokken 11 kan også fornye kildepakken. Native oppstart er ingen garanti for punktlig kjøring. Før filen finnes, gir GitHub et eksplisitt `not-released`-resultat og endrer ingen data. Kildeavslag eller ugyldige filer er feil, og bevarer den forrige pakken. Et gammelt grønt resultat erstatter ikke en ny kontroll. Ingen konstruert Excel-adresse brukes. Endret kolonnemodell, tvetydig kilde, feil år, duplikate poster eller ugyldige beløp stopper importen.

Etter vellykket GitHub-import publiseres bare de validerte dataendringene og nettstedets vanlige bygg. Artikler publiseres fortsatt først etter godkjenning. Ved manuell workflow-kjøring må det først finnes en fersk native kildepakke for valgt år; workflowen faller ikke tilbake til den blokkerte direkteforbindelsen. Den direkte native importøren nedenfor beholdes som en kontrollert reserve.

**Faktisk kildeavslag 6. oktober:** Beredskapsjobben hentet feilloggen fra den tidligere importen og bekreftet HTTP 403 fra regjeringen.no. Nye forsøk fra GitHub får også 403 på den kontrollerte 2027-siden og originalfilen for 2026. Dette er ikke dokumentert løst av endret adresse. Se `editorial/research/budsjett-2027/readiness.json` for siste faktiske resultat.

**Kontrollert fungerende kjørevei 6. oktober:** Arbeidsmiljøet får HTTP 200 fra regjeringens 2027-side og har hentet, hashkontrollert og prøveimportert originalfilen for 2026 med 1 600 poster. Produksjonsdata ble ikke endret. Se `editorial/research/budsjett-2027/cloud-readiness.json`. Dette er en separat miljøkontroll; GitHubs 403 er fortsatt et kildeavslag. 2027-filen var ennå ikke publisert ved kontrollen.

**Beredskapsjobben kontrollerer nå den faktiske native kjøreveien:** Kildeinnhentingen skjer i arbeidsmiljøet, mens GitHub uavhengig kontrollerer originalfilenes SHA-256, kildeoppdagelsen og ekte prøveimport. Pakken i `editorial/research/budsjett-2027/readiness-evidence/` inneholder de faktisk hentede offisielle sidene og 2026-originalen. Kilder eldre enn seks timer, fremtidige tidsstempler, endrede filer, manglende kilder og kildeavslag stopper kontrollen. Resultatet oppgir `sourceAcquisitionEnvironment: native-workspace`, eget `sourceCheckedAt` og `liveGithubSourceAccess: false`; grønn kontroll betyr at denne kjøreveien virker, ikke at Cloudflare har åpnet for GitHubs direkte HTTP-klient.

Ved oppstart onsdag, etter fersk main og dependency-/nettverkskontroll, kjør `python etl/readiness_sources.py --capture --output editorial/research/budsjett-2027/cloud-readiness.json`. Kommandoen gjør ny live kildeinnhenting og prøveimport; prøvetall skrives bare i en midlertidig katalog. Ved feil lagres et mislykket resultat, tidligere kildedokumentasjon beholdes og exit-koden er feil. Rapporter konkret blokkering og ikke bruk et eldre grønt resultat som bevis på dagens tilgang. Ved vellykket kontroll: stage bare `editorial/research/budsjett-2027/readiness-evidence/` og `cloud-readiness.json`, lagre dem med `scripts/commit-generated.py --allowed-root editorial/research/budsjett-2027/readiness-evidence --allowed-root editorial/research/budsjett-2027/cloud-readiness.json --message 'budget: oppdater live native kildekontroll'`. Push starter den ekte GitHub-kontrollen. Vent på vellykket kilde- og importverifikasjon, hent fersk main og sikre deretter faktisk 2027-import. Denne pakken publiserer ikke prøvetall eller artikler.

Den allerede bestilte native oppgaven skal **selv sikre import med samme validerte importør i det publiserte miljøet ved oppstart**, dersom 2027-forslaget ikke allerede er importert. Start fra ren, oppdatert main, installer `etl/requirements.txt` i prosjektets Python-miljø (inkludert pypdf) og kontroller faktisk HTTPS-tilgang. Kjør `python etl/budget_proposals.py --year 2027`; kontroller originalfil/hash, arkiv og riktig forslagsår. Stage bare importens dataendringer med `git add -f web/public/data/` og bruk `python scripts/commit-generated.py --message 'budget: importer kontrollert 2027-forslag fra native kjøring'`. Scriptet bygger en vanlig commit på fersk main i en separat arbeidskopi og prøver vanlig push inntil tre ganger. Det bevarer andre skribenters filer og avstemmer uavhengige metadataendringer; motstridende tall eller arkivversjoner stopper og krever ny import fra fersk main. Ingen force, oppdiktede filadresser, endring av kildefilter eller artikkelpublisering inngår. Hent deretter fersk main og bygg analyserapporten. Dersom også dette miljøet får 403, rapporter kildeavslaget og la data stå uendret; dette kan ikke merkes som en vellykket import.

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

## Native AI-kjøring på onsdag

Oppgaven **«Budsjettdagen 2027» er kontrollert aktiv i planleggeren 6. oktober**, med tidspunkt **7. oktober kl. 11.00 Europe/Oslo**, det publiserte miljøet og mandagsplanen beholdt. Kontroller faktisk oppstart i oppgavens chat; ikke opprett en duplikatoppgave. Aktiv tidsplan er ikke bevis på at morgendagens kjøring har startet.

Start fra fersk main med `node scripts/analyser/preflight.mjs`. Kontrollen prøver regjeringens side, SSB, alle ni partisider, GitHub API og publiseringsregisteret. En gammel kjøring kan fortsatt være bundet til et tidligere nettverksoppsett selv om et nytt miljø er publisert. Ved nettverksavslag: rapporter konkret feil og bruk den publiserte konfigurasjonen i en ny kjøring. Ikke skriv en historisk analyse som reserve for budsjettdagen.

Den uttrykkelig bestilte ekstra analysen bruker:

```sh
GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json --budget-year=2027
```

Pakken har `mode: budget-day`. Den velger bare det faktiske arkiverte 2027-forslaget mot saldert 2026. Et eldre regnskapsutkast blokkerer ikke denne særskilte leveringen. Et åpent utkast om samme forslag gjenbrukes, og toårs-/hendelseskontrollen og eksakt menneskelig godkjenning gjelder fortsatt. Vanlige mandagskjøringer beholder sin køprioritering. Lever bare ferdig JSON på `analysis/input-*` som før.

### Kontrollerte partikilder

`budget-evidence.yml` støtter nå et separat `priorities`-felt i den samme JSON-leveringen. Det kan arkiveres før forslaget finnes. Partiprogrammer skal ikke merkes som parlamentariske avtaler. Workflowen verifiserer HTML eller PDF på partiets eget domene, kontrollerer hver redirect, ordrett sitat og opprinnelig år/programperiode, og bevarer originalfil, kildetekst, hash og hentetidspunkt. Ukjent publiseringsdato beholdes som ukjent.

Lever rene partikilder på `analysis/budget-evidence-party-<unik-id>` med bare `editorial/handoff/budget-evidence.json`. Disse har egen kø og kan bare endre partiarkivet; de kan ikke inneholde parlamentarisk dokumentasjon eller RNB-vedtak. Det hindrer at en lang månedlig ETL fortrenger kildeleveringen. Blandede budsjett-/vedtakspakker bruker den opprinnelige køen.

Den samme kildekontrollen kan kjøres av den native oppgaven i det publiserte miljøet: `python etl/party_priorities.py --year 2027 --input editorial/research/budsjett-2027/party-priorities-input.json`. Etter vellykket kontroll, commit bare `web/public/data/party-research/` fra ren, oppdatert main og push normalt. Ingen kildefeil skal erstattes av en ukontrollert manuell arkivfil. Dette er kildeinnhenting; analyse og LinkedIn-utkast trenger fortsatt botgjennomgang og menneskelig godkjenning.

**Alle ni partier er nå hentet og kontrollert i arbeidsmiljøet:** Ap, H, FrP, SV, Sp, R, MDG, V og KrF. Hele pakken i `party-priorities-input.json` er arkivert med originalfiler, tekst, hash og hentetidspunkt i `web/public/data/party-research/`. Analysens faktiske arkivleser har lastet alle ni og laget 33 kontrollerte faktafelt. Rødts kilde fungerer fra dette miljøet; GitHubs tidligere 429 er ikke grunn til å droppe partiet. Ved ferske krav og reaksjoner må hele det oppdaterte kildeutvalget verifiseres på nytt. Bruk `git add -f web/public/data/party-research/` og `scripts/commit-generated.py` ved lagring, og hent fersk main før rapporten bygges. Gjennomgangen viser også partiprioriteringene med kildetype, periode/år, sitat og lenke i en egen del. Partigrunnlaget inngår i rapportens datahash og artikkelens godkjenningshash.

```json
{
  "version": 1, "year": 2027, "phase": "initial",
  "priorities": [
    {"id":"formuesskatt", "party":"H", "kind":"programme",
     "period":[2025,2029], "sourceDate":null,
     "url":"https://hoyre.no/politikk/partiprogram/",
     "quote":"<ordrett kontrollert sitat, minst tretti tegn>", "recordKeys":[]}
  ]
}
```

Tillatte typer er `programme`, `budget-request`, `alternative-budget` og `stated-priority`. De to budsjettspesifikke typene krever `referenceYear`, slik at et krav fra 2026 ikke omtales som et nytt 2027-krav. Programmer krever sin dokumenterte `period`; andre uttalte prioriteringer kan ha ukjent opprinnelig år. `sourceDate` er bare tillatt når datoen faktisk kan verifiseres i kildeteksten. `recordKeys` kan være tom ved forhåndsresearch; oppgitte koblinger må finnes i den faktiske budsjettrapporten.

Velg én til trettiseks konkrete prioriteringer med unike bokstav-ID-er. Ved endret utvalg leveres hele det ønskede utvalget som en ny immutable versjon. Hent fersk main etter vellykket kontroll. Rapporten legger til kilder, kontrollerte `priorityAQuote`, `priorityAParty`, `priorityAKind`, eventuelt `priorityAPeriod`/`priorityAReferenceYear`, videre B, C osv. De inngår i datagrunnlaget og godkjenningen. Kildetekst alene beviser ikke nettoeffekt, måloppnåelse eller forhandlingsgjennomslag.

### Ressurser og utvidet oppdrag vedtatt 5. oktober

Brukeren ønsker en større analyse med vesentlige ressurser og grundig forhåndsresearch om alle stortingspartiene. Les `editorial/research/budsjett-2027/README.md`, `partier.md`, `sources.json` og baseline før arbeidet starter. Partiprofilene og sammenligningsmatrisen er kildebelagt; alle ni partisider samt Stortingets API ble kontrollert 5. oktober. Tilgangen må prøves på nytt i kjøringens faktiske miljø. GitHub-kildejobben 6. oktober møtte HTTP 429 hos Rødt; dette bekrefter ikke et komplett kontrollert arkiv. Importøren respekterer Retry-After med én ny prøve når ventetiden er høyst ett minutt; lengre ventetid eller nytt avslag stopper importen. Kontroller resterende fulltekstkilder som er merket utilgjengelige, og oppdater profilene med ferske 2027-krav før publisering. Ikke erstatt kildearbeid med generelle antakelser om partiene.

Dette er en uttrykkelig ekstra analyse utover den vanlige ukerytmen. Sikt mot **2 500–3 500 ord og åtte til ti seksjoner**, innenfor eksisterende artikkelskjema. Bruk den sterkeste tilgjengelige modellen og høy tilgjengelig resonneringsinnsats i den native oppgaven. Gjennomfør egne gjennomganger av kildegrunnlag, beregninger, politiske konklusjoner og redaksjonell tekst. Instruksen endrer ikke modellinnstillinger eller reserverer faktisk kvote; slike innstillinger må være tilgjengelige i oppgaven. Ingen separat AI-API.

Arbeidsrekkefølgen er: verifiser import og dokumentversjon; les nasjonalbudsjettet, Gul bok, skatteforslaget og relevante fagproposisjoner; forklar de største endringsdriverne; sammenhold konkrete partiløfter med faktiske forslag; undersøk nettoeffekten for berørte grupper; kontroller alle konklusjoner mot kildene; skriv og vurder mobilutkastet; lever til menneskelig godkjenning.

Skill politisk samsvar på fremleggelsesdagen fra dokumentert forhandlingsgjennomslag etter Stortingets behandling. Vis konkrete oppfylte eller uoppfylte krav med begrunnelse, heller enn en samlet partikarakter. Skatteproveny alene viser ikke skatteendring for husholdninger. Kommunerammen må vurderes etter kostnader, demografi og oppgaver, og med riktig sammenligningsbase. Kontroller historiske postnavn før omtale. Bruk offisielle fremtidige prisanslag som anslag, aldri som observerte KPI-er.

Partienes originalkilder må kunne dokumenteres i artikkelens kontrollerte kildegrunnlag. Dagens parlamentariske `budget-evidence` skal ikke brukes til å kamuflere partiprogrammer som forlik. Partiprioriteringer leveres nå gjennom den separate, kontrollerte priorities-arkiveringen beskrevet nedenfor.

En oppstart rundt klokken 11 er ikke en leveringsfrist. Forsvarsdepartementet presenterer budsjettet klokken 14, ifølge den kontrollerte invitasjonen i researchregisteret. Dersom forsvar er en vesentlig driver, les også denne presentasjonen før hovedkonklusjonen låses. Prioriter et grundig utkast senere samme dag fremfor tidlig, ufullstendig levering. Publisering samme dag avhenger av faktisk datatilgang, særskilt AI-kjøring og menneskelig godkjenning.

Velg én til syv relevante grafer etter docs/analysis-charts-topics.md, og behold designet og Sven-byline. Mer tekst skal gi leseren flere forklarte sammenhenger, ikke flere løsrevne tall. LinkedIn-teksten skal fortsatt være kort, med den avtalte Unicode-innledningen, en konkret krok, tørr vennlig humor og et spørsmål hovedanalysen besvarer. Kontroller teksten mot feltgrensen og publiseringsflyten.

GitHub-workflowene importerer og validerer data. De starter ikke den native AI-en. Mandagsplanen beholdes. Onsdagens native oppgave er en separat kjøring, kontrollert aktiv i planleggeren 6. oktober. Det er ikke opprettet en duplikatoppgave.

Bruk denne instruksen i den eksisterende oppgavens chat for en særskilt kjøring onsdag 7. oktober 2026, for eksempel klokken **11.00 Europe/Oslo**. Ikke erstatt mandagsplanen:

> Gjør en ekstra Fellestall-analyse på budsjettdagen. Hent oppdatert main i Lippen1995/Project_statsbudsjett og les docs/budsjettdagen-2027.md og docs/codex-weekly-analysis.md. Kontroller at det faktiske 2027-forslaget er importert, og les regjeringens faktiske budsjettdokumenter før du skriver. Hvis filen ikke er tilgjengelig, rapporter dette og avtal nytt forsøk; ikke lever en historisk analyse som om den var budsjettanalysen. Skriv selv uten AI-API. Bruk prepare.mjs med --budget-year=2027, kontrollerte fakta, én til syv grafer og eksisterende botlevering med versjonsbundet forhåndsvisning og menneskelig godkjenning. Bekreft faktisk PR og fungerende forhåndsvisning før du melder ferdig. LinkedIn forblir deaktivert til tilgang er kontrollert.

Når vedtak senere blir tilgjengelig, vil neste native kjøring kunne velge forslag-mot-vedtak-analysen. Daglig dataimport innebærer ikke daglig AI-produksjon. Publisering samme dag krever også at godkjenneren rekker å godkjenne utkastet.

## Verifikasjon

Importen er prøvd mot den offisielle Gul bok-filen for 2026. Tester dekker egen forslagsserie, uendrede eksisterende bevilgninger, arkiv og originalfil, gjentatt/korrigert import, manglende/ugyldige tall, DFØ-overgang, postflytting, kontrollert politisk dokumentasjon og at RNB krever både kildebevis og DFØ-vedtak. Verifisert: 108 JavaScript-tester og 85 Python-tester, workflow-syntaks, produksjonsbygg/SEO, tre faktiske budsjettgrafer på mobil uten horisontal sideflyt, Sven-byline og forslagsvelger. En SVG-tittel som gav ulik server-/klientstruktur ble rettet; mobilvisningen lastes nå uten React-feil. Faktiske 2027-data kan først prøves når regjeringen publiserer dem.

## SSB-bakgrunn til budsjettanalysen

Les `docs/ssb-analysis-research.md`. Undersøk relevante befolknings-, pris-/lønns- og arbeidsmarkedsvariabler før forklaringer på utgiftsveksten låses. Bruk scope `budget:2027` for denne analysen, og noter at siste observerte år kan være tidligere enn budsjettåret. Uttrekk må kontrolleres og arkiveres før rapporten bygges på nytt. Ingen årsaksandel utledes fra samtidige endringer alene.

### Grafvalg og smal temakontroll

Les `docs/analysis-charts-topics.md`. Antallet grafer er én til syv; inkluder SSB-bakgrunn når det styrker forklaringen. Ikke omtale selve innføringen av SSB-data. Årets forslag, samme års vedtak og RNB har egne, tydelig avgrensede hendelser. Et nytt talluttrekk fra samme forslag gir ikke en ny ordinær problemstilling.

### Uttrykkelig analyse mot revidert foregående år

Ved bestilling av sammenligningen i Fellestalls «Endringer»-visning brukes:

```sh
GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json --budget-year=2027 --baseline=revidert
```

Dette velger DFØs løpende reviderte serie for 2026, uten å falle tilbake til saldert dersom serien mangler. Den er ikke et særskilt frosset parlamentarisk juni-RNB. Rapporten merker basen, fryser oppdateringstidspunktet og binder valget til datahashen. Nasjonalbudsjettets oppdaterte anslag og pressemeldingenes salderte sammenligninger må forklares separat. Standardkjøringen uten parameteren bruker fortsatt saldert. Samme budsjettforslag er fortsatt én redaksjonell problemstilling.

Det kontrollerte grunnlaget inkluderer departementssummer, navngitte postgrupper og kildeutdrag fra leste primærkilder i `web/public/data/budget-research/2027/`. PDF-linjebryting og delte ord er normalisert. Boten regenererer rapporten fra main med den oppgitte basen og avviser avvik. Artikkel og LinkedIn-utkast følger den eksisterende versjonsbundne gjennomgangen og publiseres etter godkjenning av akkurat den versjonen.

### Separat politisk analyse og GitHub-godkjenning

En uttrykkelig bestilt analyse av partienes prioriteringer og budsjettforhandlingene
kan leveres separat fra den publiserte analysen av pengeflyttingene:

```sh
GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json --budget-year=2027 --baseline=revidert --question=budget-negotiations
```

Dette er ett avgrenset politisk hovedspørsmål, ikke en ny tallanalyse med endret tittel.
Det krever kontrollerte partikilder og `negotiation-research/2027.json` med frosne
originalsvar fra Stortinget og SSB og kontrollerte offisielle kildeutdrag. Mandater,
alderssummer og regnestykker beregnes av betrodd kode og binder rapportens hash.
Samme politiske spørsmål har fortsatt duplikatkontroll og to års sperre.

Lever den ferdige JSON-filen på `analysis/input-*`, som i den øvrige flyten. Boten
regenererer rapporten fra main, oppretter PR og ber om review. Eksakt menneskelig
godkjenning, forhåndsvisning og publiseringsvern beholdes. Lokale Markdown-filer er
arbeidsutkast og erstatter aldri denne leveringen.

### Redaksjonell føring fra brukeren, 7. oktober 2026

Politiske analyser skal ha sammenhengende fortelling og bedre flyt enn en oppramsing av partier, krav og poster. Sven skal vurdere hvilke prioriteringer som betyr mest for hvert parti, hvilke innrømmelser det kan akseptere, verdien av alternative flertall, og hvordan kravene påvirker muligheten for et samlet forlik. La denne strategiske forståelsen prege forklaringen av konkrete avveininger; ikke skriv gjentatte eksplisitte beskrivelser av «det politiske spillet». Organiser teksten rundt avgjørende spenninger og mulige løsninger, ikke en ønskeliste per parti. Skill dokumenterte posisjoner fra begrunnede forventninger og unngå å tillegge aktørene kjente private hensikter. Ren tekstrevisjon beholder det frosne tallgrunnlaget og oppdaterer samme gjennomgang med ny godkjenning av den eksakte versjonen.
