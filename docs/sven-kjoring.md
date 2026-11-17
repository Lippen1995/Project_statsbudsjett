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
