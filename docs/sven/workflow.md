# Redaksjonell kjøring i eksisterende native oppgave

## Rettet kontrollkontrakt, 27. november 2026

Egenvurderte poeng kan ikke lenger gi status `approved`. Uten signert,
uavhengig sluttkontroll stanser en ellers teknisk gyldig kjøring i
`needs-review`. Runneren skal da stoppe, ikke gjenta vurderingen for å skaffe
seg høyere poeng. Egenpoeng skjules som godkjenningssignal i admin/PR-visningen.

Det endelige editor-steget kan levere `attestation: {payload, signature}`.
Payload er JSON signert med Ed25519 av den eksisterende evaluatorens private
nøkkel, og inneholder `kind: editorial-review`, `independent: true`, `reviewer`,
`inputHash`, `policyHash`, `assessmentHash`, `issuedAt` og `expiresAt`.
Assessment-hashen beregnes med den beskyttede `digest`-funksjonen. Offentlig
nøkkel hentes fra eksisterende `SVEN_LEARNING_CONFIG`; ingen kandidat eller
artikkel får velge en egen nøkkel. Attestasjonen gjelder høyst ett døgn og
må gjelde nøyaktig tekst, policy og vurdering. Det opprettes ingen ny evaluator
eller nøkkel. Manglende faktisk evaluatortilgang er en blokkering som skal vises.

Et språkcheckpoint krever nå `inputHash`, `opening`, `ending`, `sections` og
`warningDecisions`, i tillegg til konkrete endringer. Hvert `sections`-element
har `index`, et faktisk `evidence`-sitat fra seksjonen, `function`, `transition`
og `repetition`. Hele artikkelen skal dekkes. Gjenstående lint-signaler krever
`warningHash: digest(warning)`, `decision: keep` og en konkret `reason` som
forklarer hva leseren ellers ville misforstått. Faresignaler er ikke forbudte
ord; nødvendige forbehold skal fortsatt stå. En ferdig checkpoint-payload som
endres etter registrering, avvises ved sluttkontroll.

Disse kontraktene hindrer at forfatterens forhåndsutfylte sjekkliste gir
automatisk godkjenning. De beviser ikke i seg selv at teksten er velskrevet.
En faktisk uavhengig vurdering og lesbar tekst er fortsatt nødvendig.

Dette er arbeidsprotokollen for ny tekst og revisjon. Den bruker samme kø,
researchverktøy, botlevering og menneskelige publiseringsgodkjenning som før.
Vanlig chat beholder `researchWithSven` og utløser ingen av stegene nedenfor.
Det opprettes ingen ny AI-API eller tidsplan. Native modellvalg styres av verten;
en rolle er et separat faglig pass, ikke en ny permanent agent.

## Kjøring

1. Bruk eksisterende `prepare.mjs` (eller `prepare-replacement.mjs`) og behold
   oppdrag, report, base og pipeline. Velg `copy.format: brief` eller `feature`.
   Bruk brief for et avgrenset funn; lengden skal følge saken. Historiske artikler
   uten format beholder gamle regler. `copy.graphs: []` er tillatt og må begrunnes.
2. Opprett privat checkpoint: `node scripts/analyser/editorial-cli.mjs init
   <packet.json> editorial/runs/<id>/run.json`. Checkpointet er privat og skal ikke
   legges på main. Bruk en ny kjøring når rapporten endres gjennom eksisterende
   researchrevisjon. Én kjøring kan gjenopptas med samme filer og ID.
3. Før hvert steg: `node scripts/analyser/editorial-cli.mjs context <packet.json>
   <run.json> --stage=<steg>`. Les bare relevante skills og opptil seks aktive,
   relevante preferanser. `withEditorialExamples` velger fortsatt inntil to
   eksempler fra eksisterende feedbackarkiv. Ikke last hele historikken.
4. Utfør stegene `research`, `angle`, `draft`, `visual`, `language`, `factcheck`,
   `editor`. Registrer hvert reelle resultat med `checkpoint <packet.json>
   <run.json> --stage=<steg> --payload=<resultat.json> --key='<unik nøkkel>'
   --model='<faktisk modell/vert>'`. Les feltkravene i `editorial.mjs` og den
   beskyttede rubrikken i `editorial-policy.mjs`; ikke fabrikkér vurderinger.
5. Research inneholder besvarte spørsmål, frosne kilde-URL-er og tom
   `materialGaps` før skriving. Ved hull: bruk eksisterende researchmotor,
   kildeimport og kontrollerte beregninger. Ikke erstatt data med modelltekst.
   Vinkel inneholder alternative `approach`, `finding`, `relevance`, `sources`,
   valgt indeks `selected`, begrunnelse `reason` og fortellerstruktur `structure`.
   Større saker krever tre reelt ulike tilnærminger. Ingen fast artikkelmal.
6. Skriv `article.copy` i eksisterende skjema. Alle tall bruker `{{fact:navn}}`.
   Oppgi brukte fakta i hver seksjons factIds. Tittel, ingress og tekst skal
   utvikle ett dokumentert funn. Språkpasset registrerer konkrete før-/ettergrep;
   nødvendige forbehold skal være naturlig integrert, aldri fjernet mekanisk.
7. Ved grafer: start eksisterende Vite med `ANALYSIS_PREVIEW_FILE=<absolutt
   artikkelsti> npm --prefix web run dev -- --host 127.0.0.1`. Render med
   `node scripts/analyser/editorial-capture.mjs
   http://127.0.0.1:5173/analyser/forhandsvisning/ <artikkel.json> <privat mappe>`.
   Se faktisk artikkel og grafbilder med vertens bildefunksjon. Capture gir
   ingen visuell godkjenning. Registrer formål, sammenlignede alternativer,
   valgt fremstilling og kritikk av begge skjermstørrelser. Hver capture krever
   `device`, `manifest`, `hash`, `critique`, `accepted`. Feil må rettes og bildene
   tas på nytt. Grafenes tall kommer utelukkende fra eksisterende serieoppslag.
8. Faktasjekk alle `copyBlocks`, inklusive ingress, LinkedIn og graftekster.
   Et `claimChecks`-element oppgir `block`, `status` (`verified`, `non-factual`,
   `unsupported`), `sources` og konkret `note`. `verified` krever minst én fryst
   kilde. Ikke kall faktiske påstander non-factual. Ingen numerisk validering
   kan avgjøre alene om en ikke-numerisk årsaksforklaring er riktig.
9. Redaktørens `assessment` inneholder `policyHash`, `inputHash`, `evaluator`,
   `at`, ni `dimensions` med score/observasjon/tiltak, `findings` og alle
   `claimChecks`. `visual` kan være notApplicable med begrunnelse når graf ikke
   trengs. Faktastopp og utestående revisjonsfunn blokkerer uansett totalscore.
   90/100 er et foreløpig mål, ikke en kalibrert vitenskapelig måling.
10. Ved problemer: `revise <packet.json> <run.json> --stage=<målssteg>
    --reason='<konkret grunn>'`. Research, vinkel og tekst kan omarbeides.
    Endret tekst krever nytt draft-checkpoint og nye etterfølgende kontroller.
    Maks tre revisjoner, 40 registrerte arbeidsenheter og 180 minutter per kjøring.
    Deretter blocked, aldri automatisk godkjenning. Nye forsøk er nye avgrensede
    oppdrag med synlig lenke til forrige stoppgrunn, ikke skjult grenseomgåelse.
11. `finish <packet.json> <run.json>` fryser kvalitetsrapporten på artikkelens
    faktiske innhold. Kort rapport, skillversjoner, modellbruk og kritikk følger
    utkastet; private screenshotstier fjernes. Lever fortsatt gjennom botens
    `handoff.mjs`. CLI-produksjon krever intern kvalitetsgodkjenning. Eksisterende
    menneskelig godkjenning gjelder fortsatt den eksakte innholdshashen.
12. Rapporter eksisterende arbeidsstatus med `sven-job.mjs ... --editorial=<run.json>`.
    Admin viser stadium, vinkel, stoppgrunn og arbeidsenheter. Ukjente tokens og
    penger er `null`, ikke null kostnad. Native arbeid belastes vertens kvote,
    ikke kundetjenestens chatkvoter. Ikke dikt opp modellnavn eller forbruk.

## Læring og benchmark

`runEditorialLearning` bruker eksisterende `runLearningCycle` til å foreslå hele
avgrensede skill-kandidater fra dataminimerte svakheter. Modellkallet leveres
av eksisterende transport eller native vert. Samme signerte evaluator avgjør
aktivering; kandidaten får ikke se privat holdout. Native artikkelproduksjon
skal fortsatt ikke aktivere en separat AI-API som reserve.

Avgrensede språk-, forteller- og visuelle skills er innholdsfiler med versjon og
hash. `editorial-evolution.mjs` er en adapter til **eksisterende**
`server/sven/learning.mjs` og `server/sven/benchmark.mjs`. Den oppretter ingen ny
evalueringsmyndighet. Nytt kandidatfelt `editorialSkills` inneholder bare tre
tillatte skillnavn og innholdshasher. Andre parametere, rettigheter, modellvalg,
evalueringsregler og holdout kan ikke endres av kandidaten.

`editorial-learning-cli.mjs propose <privat tilstand> <kandidat.json>` bruker
`SVEN_LEARNING_CONFIG` og krever hypotese og sporbare svakheter. Kandidatfilen
opprettes uforanderlig; registeret peker fortsatt på tidligere versjon.
`benchmark` lager ti representative oppgaver gjennom eksisterende benchmark.
Bruk samme frosne research for skriveprøven, separate kontekster og eksisterende
blinding. Public oppgaver er regresjons-/utviklingsmateriale, **ikke hemmelig
holdout**. Den signerte evaluatoren bruker sitt eksisterende private testsett.

`activate` krever evaluators signerte rapport, samme kandidat og baseline,
tilstrekkelig fagdekning og tilfeller, dokumentert gevinst, ingen fagregresjon,
bestått personvern/publiseringsvern og kostnadsgrense. Disse kravene håndteres
av eksisterende register. `monitor` bruker signert overvåking og tilbakefører
både profil og skillpeker ved kritisk avvik. Ingen ordinær menneskelig
godkjenningssløyfe legges til for slike avgrensede forbedringer.

Evaluatornøkkel, privat holdout og ekstern evaluator er produksjonsavhengigheter.
Automatiserte tester bruker egne testnøkler og eksplisitte fixtures. Beståtte
slike tester dokumenterer mekanismen, ikke en faktisk forbedret aktiv skill.
