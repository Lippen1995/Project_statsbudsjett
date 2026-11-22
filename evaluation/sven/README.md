# Sven mot ChatGPT og Claude

Disse 30 offentlige utviklingssakene tester bredde, ikke et hemmelig holdout-sett. De må ikke brukes som eneste grunnlag for autonom utrulling eller påstand om overlegenhet. Et uavhengig testsett oppbevares utenfor repo og utenfor læringsprosessens lesetilgang.

## Lik testprotokoll

Bruk de faktiske ChatGPT- og Claude-produktene med nettsøk, nye samtaler, samme spørsmål, samme datoforutsetning og samme tidsbudsjett for begge chattene. Registrer modellnavnet som produktet faktisk viser, abonnement/versjon, verktøy, dato, tidsbruk og uendret svar med kilder. Produktabonnement og API er forskjellige sammenligninger. Ikke presenter en API-baseline som et ChatGPT-produktresultat. Sven kjøres asynkront med Batch API for faglig sammenligning. Batchtiden inkluderer kø og kan ikke brukes til å sammenligne svartid. Blindpakken markerer dette med `timingComparable: false`.

Feil og tidsavbrudd registreres som resultater; ingen utsiling av vanskelige saker. Hvert produkt skal få de samme eventuelle oppfølgingsopplysningene. Ikke gi bare Sven en korrigering. Ved kildeendring mellom kjøringer må sammenligningen merkes eller gjentas. Gjør minst to uavhengige kjøringer av et reservert sett før en bred kvalitetskonklusjon.

## Vurderingsrubrikk

Hver dimensjon gis 0–4: 0 = mangler/vesentlig feil, 1 = store mangler, 2 = delvis dekkende, 3 = godt og hovedsakelig etterprøvbart, 4 = presist og fullt dekkende for oppdraget. Begrunn med konkrete eksempler og kontroller originalkilder.

| Felt | Hva som kontrolleres |
| --- | --- |
| factualAccuracy | Tall, enheter, regnestykker, geografi og påstander |
| sourceSupport | Relevante kilder som faktisk støtter påstanden; kilde-ID alene er ikke bevis |
| temporalStatus | Dato, historisk lovversjon, forslag versus vedtak versus gjennomføring |
| reasoning | Nullalternativ, samme sammenligningsgrunnlag, årsak versus korrelasjon, beslutningsmyndighet |
| counterEvidence | Reelle motargumenter, alternative forklaringer og vilkår som endrer konklusjonen |
| usefulness | Besvarer oppdraget, angir datagap og gir råd bare når det er passende/bestilt |
| clarity | Forståelig, presist og passe detaljert; lengde belønnes ikke i seg selv |

Kritiske feil gir totalscore 0: oppdiktet kilde eller sitat; vesentlig feil i beløp/enhet; feil om gjeldende lov/vedtak med beslutningskonsekvens; lekkasje av private data; tydelig egen anbefaling i publiseringsoppdrag uten bestilling. Små formuleringer skal ikke automatisk klassifiseres kritiske.

Bruk to fagvurderere uavhengig. Kjør `score` separat for hver vurdering, diskuter uenigheter etter at skårene er låst, og behold originalskårene. Verktøyet gir deskriptive gjennomsnitt per fag og parvise seire/uavgjorte/tap. Det beregner ikke statistisk signifikans og hevder ikke generell overlegenhet.

## Kjøring

```sh
node scripts/sven/benchmark.mjs prepare /privat/sven-test
node scripts/sven/benchmark-run.mjs /privat/sven-test/manifest.json /privat/sven-test/sven-svar.json
```

Samle de tre produktenes resultater i én JSON-liste med feltene i `submission-template.json`. `manifestHash` sikrer at kjøredataene tilhører riktig protokoll. `answer` er den uendrede svarteksten. Kjør så:

```sh
node scripts/sven/benchmark.mjs blind /privat/sven-test /privat/alle-svar.json /annen-privat-mappe/blindnokkel.json
node scripts/sven/benchmark.mjs score /privat/sven-test /annen-privat-mappe/blindnokkel.json /privat/vurderinger.json
```

Del bare `review.json` og `ratings-template.json` med vurdererne. Produktnavn og modellmetadata fjernes fra strukturen, men selvomtale i svaret kan avsløre identitet; registrer slik avblinding uten å redigere originalsvaret. Blindnøkkel og råsvar skal ikke deles med dem før skårene er låst.

Kjøreren trenger `ANTHROPIC_API_KEY` og `SVEN_MODEL`. Den sender klare modelltrinn samlet og starter neste runde når resultatene er tilgjengelige. Lokal status og batch-ID lagres i `sven-svar.json.batch.json`. Kjør samme kommando igjen for å gjenoppta. Ved ukjent innsending, finn batch-ID i Anthropic Console og legg til `--batch-id=<id>`. Kjøreren kontrollerer at resultat-ID-ene matcher før de tas inn. Etter et hardt prosessavbrudd kan en låsefil bli liggende. Kontroller at prosessen har stoppet før den fjernes. Oppbevar manifest, batchstatus, svar og eventuelle private kilder utenfor offentlig repo. Kunde- og operatørchat gjør direkte modellkall.

Hver poengrad må inneholde `reviewHash`, SHA-256 over den eksakte vurderingspakken. Malgeneratoren setter dette automatisk. Poeng fra en annen anonymiseringsrekkefølge avvises selv om saks-ID og etikettene A/B/C er like.
