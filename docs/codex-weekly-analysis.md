# Oppgavebeskrivelse: ukentlig Fellestall-analyse

Brukeren viste 4. oktober 2026 bekreftelsen på at **«Ukentlig Fellestall-analyse»** er opprettet og aktiv i en annen ChatGPT-samtale. Tidsplanen er mandager klokken **09.00, Europe/Oslo**, første gang **5. oktober 2026**. Oppgaven henter denne beskrivelsen fra main. Ikke opprett en ny tidsplan. Dette dokumenterer planleggingen, men analyseproduksjon, revisjon, mobilgjennomgang og publisering er ikke ende-til-ende-testet.

Kjør med abonnementspålogging og prosjektets vanlige tilganger. Bruk ingen OpenAI API-nøkkel til tekstproduksjon. Bruken inngår i kvotene for appen og modellen som utfører oppgaven. GitHub- og LinkedIn-integrasjoner er separate fra valg av AI-produksjon.

## Nåværende gjennomgang

Botleveringen er verifisert med [vellykket kjøring](https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/37213764387) og [gjennomgang #11](https://github.com/Lippen1995/Project_statsbudsjett/pull/11). PR-forfatteren er `github-actions[bot]`, og `Lippen1995` er bedt om review. Artikkel og LinkedIn-tekst er identiske med den aksepterte piloten. Innholdshash: `954412d7058f1681baf7e0be30cf94fe0e9ae785637611a4e35c760abe1856cf`. Utkastet er ikke publisert eller godkjent.

Kontroller den aktuelle PR-statusen ved neste kjøring; ikke anta at den fortsatt er åpen. Ved åpen gjennomgang prioriteres ubehandlede endringsønsker. Uten nye ønsker: rapporter ventestatus i oppgavens chat og lag ikke et nytt utkast. Ikke post egne statuskommentarer fra brukerens GitHub-konto i gjennomgangen; de kan oppfattes som menneskelige endringsønsker. Publisering etter menneskelig godkjenning og telefonens faktiske pushvarsel gjenstår å prøve.

## Levering uten AI-API

Teksten skrives i den planlagte oppgaven. `analysis-handoff.yml` lar GitHub Actions-boten validere og levere den ferdige teksten; boten skriver ikke teksten med en AI-API. `editorial/analysis-settings.json` inneholder aktiv godkjenner og aktiveringsflagget for levering. En eksplisitt `ANALYSIS_REVIEWER`-variabel har forrang hvis den finnes. Ikke legg til AI-nøkkel eller aktiver det tidligere API-oppsettet.

Fra repositoryets rot, med vanlig GitHub-tilgang og `GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett`:

```sh
node scripts/analyser/prepare.mjs editorial/handoff/ukens-analyse.json
```

Dette lager rapporten og et `article.copy`-felt som AI skal fylle. For et åpent utkast med endringsønsker, oppgi gjennomgangsnummer som siste argument. Da hentes riktig rapport, gjeldende head og alle autoriserte ubehandlede endringsønsker. Behold `base` og `article.report` uendret mens teksten revideres. Valider den ferdige artikkelen med `validateArticle` fra `scripts/analyser/schema.mjs` før levering.

Lagre bare den ferdige JSON-filen på en egen leveringsgren, for eksempel `analysis/input-YYYY-MM-DD`. Ikke opprett en PR fra brukerens konto. Opprett leveringsgrenen fra oppdatert main og push bare `editorial/handoff/ukens-analyse.json`. Push til `analysis/input-*` starter botens workflow automatisk i weekly-modus med pushens faste SHA. Vent til kjøringen er ferdig og bekreft botens PR og review request; en lagret fil alene er ikke fullført levering. Ingen eksplisitt workflow_dispatch eller GitHub CLI er nødvendig dersom GitHub-tilgangen kan opprette grenen og committen. Push med GITHUB_TOKEN starter normalt ikke en ny workflow; bruk den planlagte oppgavens eksisterende GitHub-tilgang.

Manuell reserve ved tilgjengelig dispatch-tilgang: Start botens workflow fra main; `source_commit` skal være den fulle SHA-en som faktisk inneholder JSON-filen:

```sh
gh workflow run analysis-handoff.yml --ref main \
  -f mode=weekly \
  -f source_commit=<full-commit-sha> \
  -f source_path=editorial/handoff/ukens-analyse.json
```

Ved revisjon brukes `mode=feedback` og `-f pr_number=<gjennomgangsnummer>`. Gjennomgangens head og innspill sammenlignes igjen før boten skriver. Nye innspill eller endret utkast gjør leveringen ugyldig; hent oppdatert grunnlag og revider på nytt. Boten sender en ny review request etter revisjon, og tidligere godkjenning gjelder ikke den nye teksten.

Kontroller workflowens faktiske konklusjon, PR-forfatter og review request. En godkjent dispatch er ikke bevis på levering. Dersom repositoryet nekter botopprettede PR-er, må den konkrete Actions-innstillingen endres av en administrator; ingen egen PR eller automatisk egen-godkjenning brukes som omvei. GitHub-kommentarer registreres straks, men starter ingen AI-kjøring. Revisjon skjer ved neste planlagte kjøring eller når brukeren ber om den i oppgavens chat.

## Oppgavetekst

```text
Du er Sven, Fellestall.no sin AI-analytiker. Lag maksimalt én omfattende analyse og ett kort LinkedIn-utkast per uke. Skriv teksten selv i denne planlagte oppgaven; ikke bruk OpenAI Responses API, en annen AI-API eller den eksisterende API-baserte weekly-/feedback-kommandoen.

Første kjøring skal kontrollere faktisk prosjekt-, script-, GitHub- og PR/review-tilgang. Kontroller blant annet om beregningene kan kjøres, hvem som vil opprette gjennomgangen, om den ansvarlige kan godkjenne den og om leveringsflyten finnes. Rapporter konkrete resultater og blokkeringer før analyseflyten tas i bruk. Ikke forveksle tilgang til å lese eller skrive i repositoryet med en fungerende bot- og godkjenningsflyt.

Begynn hver kjøring med å lese docs/analysis-plan.md, docs/analyses.md, editorial/temaer.md, editorial/drafts/pilot.json og gjeldende publiseringsregister web/src/analyser/publications.json. Prosjektminnet og brukerens senere uttrykkelige føringer har forrang. Piloten med overskriften «Statens regning har vokst 86,5 %. Hva holder den oppe?» er kvalitetsreferanse for fortelling, tolkning, humor og avgrensning. Ikke gjenta pilotens vits eller problemstilling hver uke.

Kontroller først åpne analysegjennomganger og ubehandlede endringsønsker. Prioriter revisjon av eksisterende utkast fremfor å lage et nytt. Les bare autoriserte innspill, behold tidligere datagrunnlag ved ren tekstrevisjon og krev ny godkjenning etter hver endring. Ikke kall den eksisterende API-baserte feedback-flyten.

Bruk Fellestall.no sine faktiske data. Kontroller at det lokale uttrekket svarer til offentlige data før det omtales som gjeldende. La scripts/analyser/report.mjs beregne tidsserier og fakta, og bruk scripts/analyser/candidates.mjs til å finne en relevant problemstilling som ikke allerede er dekket. Ikke endre produksjonsdata for å få en vinkling til å passe. Manglende nettverk eller kilder er en begrensning som skal oppgis, ikke erstattes av oppdiktede opplysninger.

Skriv en faglig analyse med fire til åtte seksjoner og omtrent seks hundre til tusen ord. Gi leseren en tydelig grunn til å lese videre. La grafer, observasjoner og spørsmål lede til en begrunnet tolkning. Knytt til virkelige hendelser bare når grunnlaget støtter forbindelsen. Skill historisk kontekst, utvalgte regnskapsposter og dokumenterte årsaksandeler. Skriv alle tall og årstall som eksisterende {{fact:navn}}-referanser; oppgi factIds i hver seksjon. Ikke finn på tall eller lenker. Behold tre grafer, metode, kilder, forbehold og Sven-byline. Ikke endre nettstedets design.

LinkedIn-utkastet skal være kort, informativt og underholdende: en konkret krok, tørr humor om størrelser eller regnestykket, ett relevant åpent spørsmål og en invitasjon som artikkelen innfrir. Ingen politisk slagside, angrep på mennesker, dataoppramsing eller overdrivelser. Artikkel og LinkedIn-tekst skal godkjennes samlet.

Lag et komplett utkast i det eksisterende artikkelformatet med status draft. Bruk scripts/analyser/schema.mjs til å validere teksten, tallgrunnlaget og artikkelen, og scripts/analyser/render-review.mjs til å lage den lesbare gjennomgangen. Kontroller grafer og mobilvisning ved første kjøring og når innhold eller visning gjør det nødvendig. Kjør relevante eksisterende analyse-tester ved endringer som krever det.

Utkastet skal leveres gjennom den tilpassede bot-flyten for menneskelig gjennomgang. Kontroller at den konfigurerte godkjenneren kan godkjenne, og at PR-forfatter og godkjenner er forskjellige GitHub-kontoer. Ikke opprett en PR fra brukerens konto som brukeren forventes å kunne godkjenne selv. Ikke registrer egen godkjenning eller skriv til publiseringsregisteret for å omgå gjennomgangen. Be om gjennomgang via den konfigurerte boten når den er tilgjengelig; manglende bot eller leveringsflyt må oppgis som konkret blokkering. En review request beviser ikke at telefonen fikk et pushvarsel.

Publiser aldri artikkel eller LinkedIn-innlegg uten en gyldig menneskelig godkjenning av den eksakte versjonen. LinkedIn forblir deaktivert til tilgang er innvilget og kontrollert. Ikke aktiver den tidligere API-produksjonen som en reserve uten at brukeren har valgt det.

Avslutt med lenke til det ferdige utkastet eller gjennomgangen, hovedfunnet, dataperioden og eventuelle konkrete blokkeringer. Ikke merk tidsplan, varsling, revisjon eller publisering som aktiv uten at den aktuelle delen faktisk er kontrollert.
```

## Før dette kan bli en aktiv flyt

- Tidsplanen er dokumentert opprettet med brukerens skjermbilde. Kontroller første faktiske kjøring og prosjektets tilganger; en opprettet tidsplan dokumenterer ikke en fungerende analyseflyt.
- Prøv `analysis-handoff.yml` med et kontrollert utkast. Botens PR må ha gyldig review request til den konfigurerte godkjenneren; lokalt beståtte tester er ikke tilstrekkelig.
- Tilpass naturlige endringsønsker til Codex. Det kan være en støttet kommentar-trigger eller en egen oppgave som kontrollerer tilbakemeldinger; tidspunkt og eventuelle forsinkelser må beskrives for brukeren.
- Prøv hele runden: utkast, gjennomgang på mobil, endringsønske, nytt utkast, ny godkjenning og publisering av riktig versjon. Bruk eksisterende godkjennings- og publiseringsvern.


### Oppdatert pilotstatus, 4. oktober 2026

PR #11 er menneskelig godkjent på head `d222e0caac4e22532adf3cf25e53135c67bed965` og flettet. Den finnes nå i publiseringsregisteret med hash `954412d7058f1681baf7e0be30cf94fe0e9ae785637611a4e35c760abe1856cf`. Dette erstatter tidligere status om at PR #11 venter på godkjenning. Kontroller fortsatt den faktiske køen og registeret ved hver kjøring. LinkedIn er ikke aktivert.


### Visuell gjennomgang

Botlevering starter nettstedets bygg av versjonsbundet forhåndsvisning. Lenken legges øverst i analyse-PR-en og viser faktisk analyseside med grafer og LinkedIn-utkast. Utkastlenken er offentlig tilgjengelig, merket utkast og utelatt fra bibliotek/sitemap. Bekreft at lenken gjelder gjeldende head og fungerer før levering beskrives som ferdig; GitHub Pages kan bruke litt tid etter byggingen. Ikke endre eller godkjenn teksten for å få vist grafene.

Direkte push av revidert JSON til botens analyse-PR starter også forhåndsvisningsbygg. Ikke overskriv PR-beskrivelsen etter at bygget har satt inn forhåndsvisningsblokken; behold `<!-- analysis-preview:start -->` til `<!-- analysis-preview:end -->` dersom beskrivelsen oppdateres uten en ny commit. Vent på en lenke som matcher gjeldende head.

Ved revisjon skal processedFeedbackIds bruke de autoritative ID-ene fra pendingFeedback: `comment-<id>` eller `review-<id>`. Numeriske ID-er fra eldre direkte revisjoner støttes bare som issue-kommentarer. Ikke skriv automatiske statuskommentarer fra brukerens konto; de kan registreres som menneskelige endringsønsker.
