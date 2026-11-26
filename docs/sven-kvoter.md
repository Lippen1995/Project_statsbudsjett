# Forbruksregnskap og kapasitet i Sven

Arbeidet hører til steg 4 i [lanseringsplanen](sven-lansering.md). Kontokvoter og måling er implementert på PR-grenen. Betalingskoblingen er ikke ferdig; ingen kunde kan kjøpe eller aktivere betalt tilgang gjennom denne leveransen alene. PR #90 forblir utkast uten utrulling.

## Avklarte priser og forslag til kapasitet

Simen bekreftet 26. november 2026 **314 NOK eks. mva. per måned** og at ekstra kapasitet skal kunne kjøpes ved lansering. Endelig avgift og totalbeløp skal fremgå av betalingsflyten. Pris/mengde for påfyll, inkludert kapasitet og utløpsvilkår er fortsatt produktvalg.

Følgende er et **konkret forslag, ikke aktivert konfigurasjon**:

| Tilgang | Kundepris | Foreslått vektet kapasitet | Modeller og periode |
| --- | --- | --- | --- |
| Gratis | 0 kr | API-kost tilsvarende 1 USD per måned | Sonnet; kalenderperioder i Europe/Oslo |
| Betalt | 314 kr eks. mva. per måned, bekreftet pris | API-kost tilsvarende 8 USD per abonnementsperiode | Sonnet og Opus; perioden fra betalingsleverandøren |
| Påfyll | Forslag: 49 kr eks. mva. | API-kost tilsvarende 1 USD ekstra | Følger kontoens modelltilgang; forslag uten utløp, til saldoen er brukt |

Dette er interne kostnadsbudsjetter. Kunden ser prosent, reservasjoner og neste periode, uten å måtte regne tokens eller dollar. Beløpene er ikke et løfte om et bestemt antall analyser. En oppgradering starter en betalt kapasitetsperiode uten å slette historikk. En avsluttet betalt periode går tilbake til gratis modelltilgang. Eventuell gyldig ekstrasaldo kan beholdes uten at den alene gir tilgang til betalingsmodellene.

Som **regneeksempel**, ikke målt gjennomsnitt: 10 000 ordinære inputtokens, 2 000 outputtokens, 100 000 cachelesinger, 2 000 femminutters cacheskrivinger og to søk koster 0,075 USD med Sonnet eller 0,13 USD med Opus etter prislisten nedenfor. Et budsjett på 8 USD rommer omtrent 106 slike Sonnet-eksempler. En faktisk analyse kan ha flere modelltrinn og et helt annet forbruk. Reelle pilottall og valuta-/driftskostnader skal kontrolleres før kapasiteten aktiveres.

## Prisgrunnlag

Claude API-priser kontrollert 26. november mot [Anthropics prisliste](https://platform.claude.com/docs/en/about-claude/pricing). Alle tall i tabellen er USD per million tokens, unntatt søk:

| Modell | Input | Output | Cachelesing | Cacheskriving, 5 minutter | Nettsøk |
| --- | --- | --- | --- | --- | --- |
| Claude Sonnet 5.5 | 2 | 10 | 0,10 | 2,50 | 0,01 USD per søk |
| Claude Opus 5.5 | 4 | 20 | 0,20 | 5 | 0,01 USD per søk |

Programmet bruker heltall i nanodollar, slik at cachevekting ikke rundes ned per token. Hver reservasjon lagrer prisskjema og prisversjon. Målingen avregnes med dette skjemaet, også hvis priskoden senere endres. Runtime bruker ikke fast mode, US-only inference eller én times cache; aktivering av slike prisvalg krever et oppdatert skjema.

## Reservasjon og avregning

Før en betalt modellforespørsel beregnes input med leverandørens [kostnadsfrie tokenendepunkt](https://platform.claude.com/docs/en/build-with-claude/token-counting). Det støtter tekst, base64-bilder og PDF-er, men avviser serververktøy. Derfor utelates serververktøy i selve tellekallet, og deres instruksjons-/resultatkostnad reserveres separat. Det gjelder også visuell filanalyse; vanlig tekst-/Office-uttrekk uten modellkall bruker ingen modellkapasitet.

En databasetransaksjon låser den globale perioden og kunden, kontrollerer modelltilgang og fordeler reservasjonen mellom inkludert kapasitet og gyldige ekstrasaldoer. Brukeren kan ikke velge kontonivå eller gi seg selv saldo i klienten. Et eget atomisk arbeidstoken starter hver leverandørforespørsel høyst én gang. To enheter kan ikke reservere samme resterende kapasitet samtidig.

Den endelige `max_tokens`-grensen tilpasses ledig kapasitet før forespørselen sendes. Telleresultatet får reserve for overhead og variasjon. For serververktøy reserveres også estimert nytt og gjentatt input per tillatt verktøybruk. **Dette siste er et estimat, ikke et hardt kostnadstak hos leverandøren.** Faktisk input, output, cachelesing, cacheskriving og søk avregnes fra leverandørmålingen. Ubrukt reservasjon frigis.

Et uventet faktisk forbruk over reservasjonen registreres i sin helhet; det kuttes ikke til kundens grense. Den globale sperren stanser deretter nye analyser for operatørkontroll. En bekreftet måling med samme leverandør-ID belastes ikke to ganger. En HTTP-avvisning før arbeid starter gir ingen modellbelastning.

Før lansering må også en uavhengig, faktisk kostnadsgrense settes og kontrolleres på Anthropic-workspacet. Appens globale grense hindrer nye reservasjoner; den kan ikke garantere fakturabeløpet for et allerede påbegynt eksternt modellkall. Denne driftskontrollen og live kalibrering av verktøyreserven gjenstår i SVEN-L09/SVEN-L10.

## Avbrudd, kvotestopp og gjenopptak

Ved ufullstendig eller manglende måling beholdes reservasjonen. Tilgjengelig delmåling og leverandør-ID lagres når de finnes; ukjent forbruk erstattes ikke med null. Nye analyser stanses globalt til forbruket er bekreftet. Arbeid som ikke har avsluttet innen lease-vinduet, oppdages før ny reservasjon. Reservasjoner fra en slettet konto som aldri rakk å starte kan frigis; allerede startet arbeid avventes og avregnes globalt også etter kontosletting.

Køarbeideren gjentar ikke et uavklart kundemodellkall automatisk. Den gamle avgrensede retryen beholdes bare i eksplisitte utviklingstester uten kundelager. Dette er ikke et løfte om nøyaktig én fakturering hos en ekstern leverandør; det er vern mot at applikasjonen starter samme kundekall på nytt.

Hvis neste trinn mangler kapasitet eller modelltilgang, bevares oppdraget som pauset med samme ID og fullførte sjekkpunkter. «Hent status» kan uttrykkelig gjenoppta det etter en faktisk tilgangs-/saldoendring. Køens revisjon økes, og fullførte modelltrinn gjenbrukes. Polling av status aktiverer ikke en slik ny runde av seg selv.

Bekreftet faktisk forbruk kan registreres gjennom den interne `quota.record`-operasjonen. Den kontrollerer leverandør-ID, uforanderlig avregning og tidligere målinger før en eventuell rest frigis. Det finnes ikke et offentlig HTTP-endepunkt som kan godkjenne forbruk, oppgradere en konto, opprette kreditt eller oppheve sperren. Operativ oppfølging mot leverandørens faktiske forbruksdata må ferdigstilles før produksjon.

## Perioder, påfyll og sletting

Gratisbruk bruker måned i Europe/Oslo. Betalt tilgang krever både `paid_from` og `paid_until`, og bruker denne abonnementsperioden som kvotenøkkel. Et kalendermånedsskifte gir ikke en ny betalt kvote midt i den samme perioden. Hvert arbeid husker hvilken periode og saldo som finansierte det. Den globale kostnadsperioden er separat og følger måned i Oslo.

Ekstrakreditt er separate saldoer med unik serverkilde, beløp, start og valgfritt utløp. En gjentatt kilde kan ikke kreditere på nytt eller endre vilkårene. Inkludert kapasitet brukes først, deretter gyldig ekstra kapasitet med tidligste utløp. Reserverte beløp avregnes mot sin opprinnelige saldo selv om den i mellomtiden har utløpt. Ingen klienthandling oppretter slike kreditter.

Kontosletting fjerner personens kvotebøtter og ubrukt kreditt. Globalt kostnadsregnskap og modellmålinger beholdes med eier-ID satt til null. En nøkkelavledet eierhash, tilfeldige innsendings-ID-er, prisskjema og målinger inneholder ingen spørsmål eller filinnhold. Dette er pseudonymiserte regnskapsdata, og oppbevaringen må inngå i den faktiske personvern-/driftsbeskrivelsen i SVEN-L09.

Innholdsbackup fra steg 3 gjenoppretter ikke regnskap, kreditter eller betalt tilgang. Den isolerte gjenopprettingen avviser et mål med eksisterende kvote-/regnskapsrader. Skjema 2-kopier er fortsatt lesbare etter oppgradering til skjema 3. Full databaseberedskap og betalings-/forbruksavstemming må bevare disse dataene separat; en innholdsimport skal ikke refundere målt bruk.

## Konfigurasjon og mobilklient

`FELLESTALL_SVEN_QUOTAS` er et JSON-objekt i servermiljøet. Det inneholder `version: 1`, `plans.free.monthlyNano`, `plans.free.models`, tilsvarende `plans.paid`, og `globalMonthlyNano`. Valgfrie felt er `maxOutputTokens` (standard 128 000), `minOutputTokens` (1 024) og `toolInputReserveTokens` (16 000). Modellene må ha et kjent prisskjema. Manglende konfigurasjon stenger betalt modellarbeid, mens konto og lagret innhold fortsatt er tilgjengelig. Det finnes ingen aktiv produksjonsfallback til foreslåtte kvoter eller demoens tokenverdier.

`GET /api/customer/usage` og kontoens øktsvar returnerer kundens egen periode, avregnet bruk, reservasjoner, ekstrasaldo og modelltilgang. Mobilen oppdaterer etter arbeid, ved fokus og under aktiv bruk. Måleren viser brukt og reservert kapasitet; en lokal `svenCapacity`-verdi er uten økonomisk virkning. Den gamle gratis påfyllsbekreftelsen er sperret. Kjøpsknappen forklarer at betaling ennå ikke er koblet til previewen og gir ingen kunstig kreditt.

## Hva som blokkerer betalingsarbeidet

Vercel-kontoen har en Stripe Marketplace-installasjon, men den er ikke koblet til Fellestall-prosjektet. CLI 67.0.0 er installert og undersøkt. Både CLI-status og Marketplace-discovery krever innlogging i dette arbeidsmiljøet. Den tilkoblede Vercel-appens tilgjengelige verktøy kan lese installasjonen, men tilbyr ikke oppretting av Stripe-ressursen. Ingen ny Stripe-ressurs, hemmelighet, produkt, pris eller webhook er opprettet her.

Marketplace-veiledningen som brukes i arbeidsøkten krever «provision first, then build». Derfor bygges ikke en fiktiv checkout eller simulerte betalingshendelser som erstatning for en faktisk integrasjon. Neste handling er å koble et [Stripe-testmiljø via Vercel Marketplace](https://vercel.com/marketplace/stripe) til prosjektet `fellestall`, enten i dashbordet eller etter CLI-innlogging. Deretter følger abonnement, påfyll, signaturkontroll, idempotens og oppsigelse mot denne ressursen. Produksjonsaktivering og første ekte betaling inngår i senere lanseringskontroll.

## Verifikasjon

`scripts/customer/quota.test.mjs` bruker isolert PostgreSQL/PGlite og kontrollerte leverandørresponser. Den dekker prisvekting, to instanser, arbeidstoken, leverandørduplikater, global grense, konto-/modellegenskaper, avbrudd, delmåling, periodeskifte, betalt periode over månedsskifte, utløp, ekstra kreditt, sletting, faktisk chatguard og visuell fillesing. Regnskapsmålinger og ukjent status testes også med en faktisk SSE-parser og en avbrutt modellstrøm.

`scripts/customer/quota-browser-test.mjs` åpner den klargjorte mobilklienten, viser servermåleren, forsøker lokal påfyllsmanipulasjon, når en kvotestopp og gjenopptar samme jobb etter at en **intern testoperatør** endrer tilgang. Denne operatørendringen tester kvoteintegrasjonen; den dokumenterer ikke Stripe, checkout, avgift eller betalingswebhook. Den ordinære lagrings-/kontoreisen gjentas separat. Ingen live modell-, telle- eller e-postforespørsel og ingen betaling brukes i disse testene.

Kontrollert 26. november 2026: alle 190 backendtester og 245 frontendtester består, sammen med frontendbygg, SEO-kontroll og pakking av 1 379 statiske filer. Både kvotereisen og hele mobilreisen for kontoer og lagring består i Chromium. Produksjon og faktiske kjøp er ikke verifisert av disse kontrollene.
