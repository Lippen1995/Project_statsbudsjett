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

Første oppslag dekker samlet statsregnskap og netto driftsutgifter for navngitte kommuner. Statssummen bruker den eksisterende rapportberegningen og samme avgrensning som Fellestall. Kommuneoppslaget bruker KOSTRA-serien for kommunekonsern. Andre spørsmål trenger fortsatt et eksplisitt kildegrunnlag.
