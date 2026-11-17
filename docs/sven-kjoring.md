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

## Undersøkelsesløp og test mot produktene (17. november 2026)

Den nye kjøringen bruker samme regnskapstall, men kan også undersøke brede spørsmål med leverandørens nettsøk og dokumenthenting. Flyten er plan → kildeinnhenting og motbevis → syntese → kvalitetskontroll → høyst én retting og ny kontroll. Maks seks modellforespørsler, seks søk og fire dokumenthentinger per undersøkelse. Disse er kjøregrenser, ikke en kundes månedskvote eller et pristak.

Opprett et privat oppdrag utenfor repoet:

```json
{"question":"Hva kan Stavanger kommune bestemme om kraftutbygging? Skill myndighet, forslag og vedtak.","surface":"chat"}
```

```sh
node scripts/sven/preflight.mjs --live
node scripts/sven/research.mjs run /privat/oppdrag.json
node scripts/sven/research.mjs list
node scripts/sven/research.mjs show <analyse-id>
node scripts/sven/research.mjs resume <analyse-id>
node scripts/sven/research.mjs stop <analyse-id>
```

`ANTHROPIC_API_KEY` og `SVEN_MODEL` må være konfigurert i prosessmiljøet. Nøkkelen skal ikke legges i repo, nettleser eller chat. Modellnavnet må finnes i den faktiske leverandørkontoen og støtte verktøyene. `preflight --live` gjør et lite fakturerbart modellkall og kontrollerer kilder og forbruk. Verktøytilgangen kan kreve aktivering i Anthropic Console. Se leverandørens [nettsøk](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) og [dokumenthenting](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool).

Jobber, kildepakker, kontrollresultater og modellforbruk lagres i en privat SQLite-fil utenfor repoet; `SVEN_WORKSPACE` kan angi filen. Dette er et lokalt operatørverktøy for utvikling og testing, ikke produksjonens kundeautentisering eller flerbrukerløsning. Kjør kun på en betrodd maskin. Kommandoene bruker samme lokale operatøridentitet.

Ferdige modelltrinn gjenbrukes ved gjenopptak med identisk input. Modellbytte krever ny jobb. Ved uavklart modellforespørsel skal kostnaden kontrolleres før `recover <analyse-id>`; denne eksplisitte handlingen tillater ny fakturerbar forespørsel. Stans den opprinnelige prosessen først. En stopp hindrer neste trinn; et påbegynt leverandørkall kan fortsatt fullføres og koste penger. Lagrede resultater slettes ikke ved stopp.

Søkefunn alene blir ikke evidens. Kildepakken inneholder hentet dokumenttekst eller leverandørens konkrete sitatutdrag, med hash og innhentingsdato. Korte utdrag kan være utilstrekkelige; kontrollen skal avvise påstander uten dekning. `primaryCandidate` er kun en domeneindikasjon, ikke en kvalitetsgodkjenning. Ingen kildeoversikt betyr at hele den opprinnelige siden er lest. Søke-/hentefeil og kontekstbegrensning beholdes som datagap.

Resultatet har `reviewed` eller `needs-review`. Automatisk kontroll er ikke uavhengig faglig verifikasjon. `publicationAuthorized` er alltid false; denne kjøringen publiserer aldri. Kontrollen leser alle svarfeltene og skal avvise tydelige anbefalinger i redaksjonelle oppdrag uten bestilling. Etter to mislykkede kontroller returneres ikke resultatet som et godkjent chatsvar.

Modellforbruk registreres også når svaret blir avkortet eller avvist. Input, output, cachelesing, cacheskriving og søk lagres separat. Manglende måling blir ukjent, ikke null. Dette er målt utviklingsforbruk; vektet abonnementsavregning, perioder og betaling er fortsatt ikke implementert.

### Mobiltesten

```sh
node scripts/sven/mobile-preview.mjs /sti/til/prototype/dist --research
```

Åpne `http://127.0.0.1:4176/?sven=local#sven`. Dette bruker prototypens lokale testkonto og kjører ekte modellforespørsler når miljøet er konfigurert. De tre siste spørsmålene og svarene, avkortet i klienten, kan følge samtalen. Kilder er klikkbare. Den lokale chatten viser ikke en oppdiktet abonnementsprosent; månedskvote er ikke konfigurert i testmiljøet. Den separate designprototypen beholder sin merkede demonstrasjon av prosentvis kapasitet.

### Konkurransetesten

Se [evalueringsprotokollen](../evaluation/sven/README.md). Det følger 30 utviklingssaker, en kjører for Sven, importformat for ekte ChatGPT-/Claude-produktsvar, anonymisert vurderingspakke, separate blindnøkler og poeng per fag. Feil og tidsavbrudd må registreres. Ingen resultater fra levende modeller er dokumentert per 17. november 2026.

### Gjenstående før hele produktplanen er ferdig

| Del | Reell status |
| --- | --- |
| Bred undersøkelse med nettsøk, kildepakke og kontroll | Implementert og testet med modell­erstatter. Reelle leverandørkall og fagvurdering gjenstår. |
| Sammenligning med ChatGPT/Claude | Verktøy og utviklingssett implementert. Produktsvar, uavhengig holdout og fagvurderinger gjenstår. |
| Kundeinnlogging, privat synkronisering, produksjons-API | Ikke levert av det lokale operatørverktøyet. |
| Månedskvote, abonnement, tilleggskjøp og betalingshendelser | Ikke implementert. Rått leverandørforbruk registreres. |
| Autonom læring med uavhengig evaluering, utrulling og rollback | Ikke implementert. Automatisk svarrevisjon er ikke en læringssløyfe. |
| Full SSB-katalog, historisk regelverk, lokale partiprogram og voteringstidslinjer | Ikke systematisk importert. Nettsøk erstatter ikke en komplett datakatalog. |
| Private analyseprosjekter med blokkredigering og PDF/CSV | Jobber og kildepakker finnes lokalt; full kundeeditor og eksportflyt gjenstår. |
| Produksjonsutrulling og fysisk mobil-/tilgjengelighetstest | Ikke gjennomført for denne grenen. |

Dette er en eksplisitt status, ikke en erklæring om at hele Sven-planen eller konkurransemålet er nådd.
