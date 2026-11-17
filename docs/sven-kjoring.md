# Kjør Svens analysekjerne

Med en konfigurert Claude-modell og et kontrollert kildegrunnlag:

```sh
node scripts/sven/analyse.mjs chat grunnlag.json
node scripts/sven/analyse.mjs editorial grunnlag.json
```

Sett `ANTHROPIC_API_KEY` i miljøet og `SVEN_MODEL` til en modell Fellestalls konto har tilgang til. Kjøringen sender spørsmålet og kildeutdragene til Claude API.

`grunnlag.json` har `question` (spørsmålstekst) og `sources` (en liste med unike `id`, `title` og `text`). Ta med metadata som dato, dokumentavsnitt og URL når de er tilgjengelige. Send faktisk kildemateriale og beregningsgrunnlag. Kjøringen søker ikke selv etter kilder.

Bruk `--recommendation-requested` i redaksjonell modus bare når oppdragsgiver uttrykkelig har bestilt en anbefaling. Svaret har et eget felt for anbefalingen. Systemet avviser en anbefaling i dette feltet uten tillatelse, samt ukjente kilde-ID-er i funn og råd. Redaksjonen kontrollerer fortsatt innholdet i alle tekstfeltene før publisering.

Den eksisterende redaksjonelle boten bruker den oppdaterte [skrivehåndboken](../editorial/learning/handbook.md) og sin ordinære leveringsflyt. CLI-en publiserer ikke.

```sh
node --test scripts/sven/*.test.mjs
```

## Automatisk oppslag i Fellestalls regnskapstall

Kjør kildeoppslaget alene, også uten API-nøkkel:

```sh
node scripts/sven/analyse.mjs sources 'Hva var netto driftsutgifter i Stavanger og Sandnes i 2025?'
node scripts/sven/analyse.mjs sources 'Hvor mye brukte staten i 2024 og 2025 ifølge statsregnskapet?'
```

Send bare `question` i JSON-filen for å bruke samme oppslag før et modellkall. Svaret får en kildeoversikt med ID, primærkilde og URL til Fellestall-uttrekket. Regnskapsårene hentes fra spørsmålet. Uten år brukes det siste kommuneåret eller de to siste statsregnskapsårene i uttrekket. Et uoppgitt kommunetall beholdes som en manglende verdi.

Oppslaget dekker samlet statsregnskap og følgende mål for navngitte kommuner: netto driftsutgifter, netto driftsresultat, driftsinntekter, netto lånegjeld og investeringsutgifter. Statssummen bruker den eksisterende rapportberegningen og samme avgrensning som Fellestall. Kommuneoppslaget bruker KOSTRA-serien for kommunekonsern. Andre spørsmål trenger fortsatt et eksplisitt kildegrunnlag.

## Koble til mobilprototypen lokalt

Bruk `dist` fra grenen `prototype/sven-mobil` i prototyperepoet. Med Claude-nøkkel og modell i miljøet:

```sh
node scripts/sven/mobile-preview.mjs /sti/til/mobilprototypen/dist
```

Åpne `http://127.0.0.1:4176/?sven=local#sven`, åpne testkontoen og spør om for eksempel netto driftsutgifter i Stavanger i 2025. Nettleseren sender spørsmålet til den lokale serveren. Serveren henter Fellestall-uttrekket, kaller Claude og returnerer henvisningene som er brukt i svaret. Nøkkelen blir på serveren.

Serveren lytter bare på loopback og behandler én forespørsel av gangen. Bare lokale forespørsler fra samme origin får bruke chatendepunktet. Korte årsoppfølginger som «Hva med 2024?» bruker sist vellykkede oppslag i samme samtale. Klienten sender bare gjeldende spørsmål og regnskapstype, kommunenavn og nøkkeltall fra forrige oppslag. Historikk, kvoteberegning og tilgang i mobilprototypen er fortsatt lokale. Testen kjører med faktiske regnskapsdata og en deterministisk erstatning for Claude.

Oljepengeoppslaget henter strukturelt og ordinært oljekorrigert underskudd fra Fellestalls arkiv. Det returnerer hver tilgjengelige budsjettfase for etterspurt år og knytter verdiene til Finansdepartementets originaldokument. Oppslaget dekker ikke faktisk overføring fra fondet.

```sh
node scripts/sven/analyse.mjs sources 'Hvor stor var oljepengebruken i 2026 og 2027?'
node scripts/sven/analyse.mjs sources 'Netto lånegjeld og investeringsutgifter i Stavanger i 2025'
```

## Gjennomføring av produktplanen

| Arbeidsspor | Status og neste verifikasjon |
| --- | --- |
| Analyse og redaksjonell metode | Felles analysekjerne og regel for eksplisitt bestilt anbefaling. Kjør og fagvurder faktiske svar i begge moduser. |
| Kildegrunnlag | Regnskapsoppslag fra Fellestall og oljepengebruk er koblet inn. Utvid deretter til datert regelverk, formelle politiske dokumenter og voteringer med stabile kilde-ID-er. |
| Mobil og konto | Lokal mobilchat med kilder og korte årsoppfølginger. Videre arbeid krever kundeautentisering og bruksmåling på server, før integrert forhåndsvisning med reelle modellkall. |
| Dype analyser | Bygg private analyseprosjekter og gjenopptakbare jobber, med lagret kildegrunnlag og beregninger. |
| Evaluering og læring | Integrasjonstester for kildeoppslag og redaksjonell regel. Sett opp et adskilt evalueringssett før kandidatkjøring, automatisk avgrenset utrulling og tilbakeføring. |
| Abonnement | Koble faktisk modellforbruk til kvote og betaling etter at kunde- og forbrukslaget er verifisert. |

Første modellregresjon kjøres med `node scripts/sven/evaluate.mjs` når Claude er konfigurert. Den bruker reelle Fellestall-uttrekk og kontrollerer at forventet tall, kilde og relevant budsjettfase finnes i de kildebelagte funnene. Dette er faste regresjonssaker. Faglig vurdering og et separat blindsett trengs før målingen kan brukes i en automatisk læringssløyfe.
