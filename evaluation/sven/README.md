# Sven mot ChatGPT og Claude

Disse 30 offentlige utviklingssakene tester bredde, ikke et hemmelig holdout-sett. De må ikke brukes som eneste grunnlag for autonom utrulling eller påstand om overlegenhet. Et uavhengig testsett oppbevares utenfor repo og utenfor læringsprosessens lesetilgang.

## Lik testprotokoll

Bruk de faktiske ChatGPT- og Claude-produktene med nettsøk, nye samtaler, samme spørsmål, samme datoforutsetning og samme tidsbudsjett. Registrer modellnavnet som produktet faktisk viser, abonnement/versjon, verktøy, dato, tidsbruk og uendret svar med kilder. Produktabonnement og API er forskjellige sammenligninger. Ikke presenter en API-baseline som et ChatGPT-produktresultat.

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
node scripts/sven/preflight.mjs --live
node scripts/sven/benchmark.mjs prepare /privat/sven-test
node scripts/sven/benchmark-run.mjs /privat/sven-test/manifest.json /privat/sven-test/sven-svar.json
```

Samle de tre produktenes resultater i én JSON-liste med feltene i `submission-template.json`. `manifestHash` sikrer at kjøredataene tilhører riktig protokoll. `answer` er den uendrede svarteksten. Kjør så:

```sh
node scripts/sven/benchmark.mjs blind /privat/sven-test /privat/alle-svar.json /annen-privat-mappe/blindnokkel.json
node scripts/sven/benchmark.mjs score /privat/sven-test /annen-privat-mappe/blindnokkel.json /privat/vurderinger.json
```

Del bare `review.json` og `ratings-template.json` med vurdererne. Produktnavn og modellmetadata fjernes fra strukturen, men selvomtale i svaret kan avsløre identitet; registrer slik avblinding uten å redigere originalsvaret. Blindnøkkel og råsvar skal ikke deles med dem før skårene er låst.

Sven-runneren lagrer etter hver sak og hopper over registrerte resultater ved gjenopptak. En låsefil hindrer parallelle skrivere. En `in-flight`-fil blir liggende ved hardt prosessavbrudd. Undersøk leverandørforbruk og den avbrutte saken før disse filene eventuelt fjernes; en ny forespørsel kan bli fakturert på nytt. Svar og eventuelle private kilder skal ligge utenfor offentlig repo.
