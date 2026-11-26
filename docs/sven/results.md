# Leveranse og verifikasjon, 26. november 2026

Dette er en lokal implementering og en konkret gjennomgangsleveranse. Den er
bygget på fersk main og eksisterende Sven-grunnmur i PR #90. Ingen kode er
publisert til produksjon, ingen analyse er publisert og ingen godkjenning av
testartiklene er opprettet på GitHub.

## Fullført og lokalt verifisert

- Kartlegging, baseline og REUSE/EXTEND/BUILD-vurdering er dokumentert i
  [architecture.md](architecture.md) og [baseline.json](baseline.json).
- Native produksjon bruker eksisterende kø, research, kildeberegninger,
  feedback-eksempler og botflyt. Ordinær chat får ingen nye redaksjonelle pass.
- Redaksjonell orkestrering har versjonsbundne steg, dokumentert vinkelvalg,
  egne språk-/faktapass, ni kvalitetsdimensjoner, faktastopp og målrettede
  revisjoner. Atomiske checkpoints har konfliktvern og idempotens. Uavklarte
  eksekveringer og overskredne grenser blokkerer fremfor å godkjenne.
- Nye leveranser krever intern kvalitetsgodkjenning. Faktapåstander må ha
  kildespor for hele teksten, inklusive ingress, LinkedIn og graftekster.
  Intern godkjenning erstatter ikke menneskelig godkjenning av eksakt versjon.
- `brief` og `feature` lar lengden følge funnet og tillater null grafer.
  Historiske artikler og godkjenningshashene deres er bevart. Ny visning
  fjerner dobbeltoppsummeringen «Vår vurdering» før brødteksten og gjør
  dokumentasjonsdelene utfellbare.
- Eksisterende linjer, stolper, piler, akser og helsekalkulator gjenbrukes.
  Små paneler er lagt til i samme seriearkitektur. Korte tidsserier tilpasses
  mobilbredden; endepunktene skjules ikke lenger bak vannrett rulling.
- Faktisk Chromium-rendering på desktop/mobil gir artikkel-, åpnings- og
  grafbilder, feilliste og innholds-/rendererhash. Native visuell kritikk
  kreves i tillegg. Gamle bilder kan ikke godkjenne ny tekst eller grafkode.
- Admin viser intern vurdering, vinkel, grafvalg, modellbruk, revisjoner og
  arbeidsstatus. Serverless-pakken fryser rendererhash ved bygging, slik at
  kontrollen ikke krever et kildekodetre i produksjonsfunksjonen.
- Skill-evolusjon utvider eksisterende signerte læringsregister og avgrensede
  læringssyklus. Testene verifiserer kandidatgenerering, privat holdoutvern,
  signaturkontroll, aktivering, vern mot byttet skill-fil og tilbakeføring.
  Den eksisterende benchmarkmotoren støtter nå også to skill-varianter og
  ni redaksjonelle dimensjoner. Ingen ny evalueringsplattform er bygget.

## Konkrete før-/etterprøver

De tre prøvene bruker identisk frosset report før og etter. De er faktiske
native skrevne/reviderte tekster med eksisterende kilder, ikke mock-data.
Resultatene er gjennomgått i egne faglige pass og kontrollert gjennom
`runEditorial`. Stageartefaktene ble produsert i denne native arbeidsøkten;
runneren startet ikke skjulte ekstra modellkall for å lage dem.

| Prøve | Før | Etter | Endring |
|---|---|---|---|
| Helsereform | 1 475 ord, ni seksjoner, fem visuelle elementer | 862 ord, åtte seksjoner, to visuelle elementer | Kompetanse og arbeidstid leder historien; sykefravær, økonomi, alternativer og partienes posisjoner beholdes |
| Studiefinansiering | 606 ord, seks seksjoner, to grafer | 327 ord, tre seksjoner, én graf | Holder fortellingen til støtte per student etter prisjustering |
| Familieytelser | 724 ord, fem seksjoner, to grafer | 463 ord, tre seksjoner, én graf | Åpner med færre mottakere og større utbetaling; beholder regel- og nettoforklaringen |

Helsereformens overskrift er strammet fra «Flere eldre, nesten like mange
sykepleiere. Dette må helsereformen løse.» til «Flere eldre, nesten like mange
sykepleiere». Ingressen oppgir den historiske kontrasten direkte: befolkningen
fra åtti år vokste 17,3 prosent, mens sykepleierårsverkene økte 3,16 prosent.

Før: «De viser likevel hvorfor en reform som flytter flere oppgaver hjem til
kommunene, må ha en konkret plan for kompetansen som skal følge med.»

Etter: «En reform som skal gi mer behandling nær pasientene, trenger også
personell med riktig kompetanse der behandlingen skjer.» Ordvalget skiller
behandlingssted fra en udokumentert overføring av ansvar. Avsnittet før
forklarer fortsatt at folketall og årsverk ikke måler pasientbelastning.

Grafprøven før mobilrettingen skjulte de siste årene bak rulling. Etter viser
samme kontrollerte serie hele perioden, med lesbare år og synlig merking av
avkortet akse. Kalkulatoren er beholdt fordi den lar leseren skille kapasitet
fra kontantbesparelse. Tre andre grafer er utelatt når teksten forklarer
forholdet tilstrekkelig.

Se [mobilgraf før rendererrettingen](examples/health-graph-mobile-before.png),
[mobilgraf etter](examples/health-graph-mobile.png),
[desktopgraf](examples/health-graph-desktop.png) og
[mobilkalkulator](examples/health-scenario-mobile.png). Dette er faktiske
nettleserbilder av de kontrollerte seriene, ikke genererte illustrasjoner.

Les [helsereformutkastet](examples/health-after.md),
[studentutkastet](examples/students-after.md) og
[familieutkastet](examples/family-after.md). Komplette før-/etter-JSON-er ligger
i samme mappe. Private bilder og checkpoints ligger i
`editorial/runs/verification/`, utenfor publiseringsregisteret.

De interne poengene 91,7, 91,95 og 91,8 er **samme native agents egenvurdering i
separate pass**, ikke blind evaluering eller dokumentasjon på generell
overlegenhet. Kortere tekst er ikke i seg selv en kvalitetsmåling. Den
konkrete teksten og bildene er grunnlaget for å bedømme forbedringen.

## Testdekning og praktiske grenser

Reproduserbare kommandoer:

```sh
npm test
npm --prefix web test
npm run build
node --test scripts/analyser/test-health-revision.mjs editorial/research/helsereform-2026/scenarios.test.mjs
npm run test:editorial:browser
```

Resultat: **190 server-/Sven-/kundetester og 264 frontend-/analysetester passerer**, i tillegg til seks helsescenario-/kildetester og seks nettleserprøver.

Server-/Sven-/kundetestene dekker eksisterende analysepolicy, research,
samtalehistorikk, verktøy, leverandørstrømming, cache, jobbgjenopptakelse,
tilgangskontroll, eierskap, tokenreservering og idempotent kvoteavregning.
Postgresflytene kjøres gjennom prosjektets eksisterende PGlite-testmiljø.
Dette er regresjonstester, ikke en live produksjonssamtale.

Nettlesertesten åpner tre faktiske prøveartikler på desktop og mobil. Den
kontrollerer artikkelidentitet, sidebredde, synlige korte grafer, fravær av
dobbeltoppsummering, tastaturåpning av talltabell og tastaturstyrt omberegning
av helsescenario. Bilder fra begge skjermstørrelser er faktisk inspisert.

Bygget passerer SEO-kontrollen. Den eksisterende Vite-advarselen om store
JavaScript-chunks består; det er ikke introdusert en ny grafmotor.

## Implementert, men ikke fullstendig verifisert i drift

- Selvstendig produksjon gjennom den planlagte native oppgaven etter at
  arbeidsprotokollen er på main. Ingen parallell tidsplan er opprettet.
- Den signerte læringsadapteren er testet med uttrykkelige testnøkler og
  fixtures. En faktisk forbedret skill er ikke aktivert på dette grunnlaget.
  [Språkkandidaten](examples/language-candidate.md) er foreslått og inaktiv.
- Ny botlevering og adminvisning i produksjon. Eksisterende leverings- og
  godkjenningsregresjoner passerer, men en GitHub-dispatch alene ville ikke
  dokumentert fungerende produksjon.
- Native modellruting, faktisk tokenkostnad, responstid og leserforståelse er
  ikke målt i produksjon. Ukjent forbruk lagres som ukjent, ikke null kroner.
- Ordinær chat beholder eksisterende API og verktøy. Eksisterende
  `surface: editorial` kan brukes av en autorisert caller; automatisk overgang
  fra en vanlig kundemelding til hele den native publiseringsprosessen er ikke
  koblet til kundens UI i denne endringen.

## Eksterne avhengigheter og gjenstående aktivering

Miljøkontrollen fant ikke `ANTHROPIC_API_KEY`/`SVEN_MODEL`,
`SVEN_LEARNING_CONFIG`, `SVEN_EVALUATOR_URL` eller en produksjonsforbindelse i
`DATABASE_URL`. Live chat, live verktøykall, faktisk ekstern evaluering,
holdout-basert aktivering og produksjonsmålinger kan derfor ikke bekreftes her.
Bruk eksisterende konfigurasjon og hemmelighetsforvaltning ved aktivering;
det er ikke opprettet nye API-nøkler eller kopiert sesjonstilganger til drift.

Benchmarkoppgaver for ti fagområder er registrert. Reelle side-ved-side-kjøringer
mot generelle ChatGPT- og Claude-produkter er ikke gjennomført, og ingen
seier hevdes. Et uavhengig, privat holdout er fortsatt evaluatorens ansvar.

Helsereformprøven bruker PR #86s frosne rapport av hensyn til sammenligningen.
En kontroll mot dagens lokale `buildReport` ga like observasjoner, fakta og
kilder, men nyere `dataUpdated` og `dataHash`. Prøven skal derfor ikke leveres
som et ferskt produksjonsgrunnlag uten eksisterende prepare-/researchrevisjon
og ny kontroll av den eksakte versjonen.

Ingen databasemigrering er nødvendig for endringen. Ingen ekstern
tilgang, chatkvote, politisk integritetsregel eller publiseringsrett er utvidet.

## Dekket fra før eller vurdert unødvendig

Researchmotor, databasetilknytning, SSB-kildearkiv, deterministiske beregninger,
chatminne/-lagring, API-transport, kø, kvoter, publisering og signert evaluator
gjenbrukes. Det er ikke bygget parallelle systemer for disse. Nye graffamilier
som histogram og fan chart er ikke laget uten relevante fordelings- eller
prognosedata i de aktuelle rapportene; eksisterende datasikre grafarkitektur
er utvidelsen som trengtes for prøvene.
