# Kundekontoer og tilgang til Sven

Kundekontoene bruker Better Auth 1.7 og prosjektets eksisterende PostgreSQL-infrastruktur. De har egne `ft_customer_*`-tabeller, eget cookieprefiks og en formålsavledet innloggingshemmelighet. En kundekonto gir ikke administratortilgang. Kontodelen er implementert på PR #90; produksjonsaktivering og samlet lanseringskontroll følger [lanseringsplanen](sven-lansering.md).

## Konto og gjenoppretting

Registrering krever navn, e-post og et passord på minst 12 tegn. E-postadressen må bekreftes før innlogging. Passord håndteres av Better Auth og lagres som passordhash; kunden får en signert HttpOnly-økt. Beskyttede forespørsler leser økten fra databasen, slik at utlogging, utløp og tilbakekalte økter gjelder uten en forsinket cookiecache.

Glemt passord sender en lenke med et engangstoken. Tokenet utløper etter én time. En vellykket tilbakestilling tilbakekaller tidligere økter. Meldingen ved forespørsel om nytt passord bekrefter ikke om en bestemt adresse finnes. Returadresser og skrivende forespørsler kontrolleres mot kundetjenestens nøyaktige origin.

E-post sendes gjennom den eksisterende Resend-integrasjonen med egne kundetekster. Registrering, ny bekreftelse og forespørsel om passordgjenoppretting returnerer 503 når e-posttjenesten ikke er konfigurert. Ingen testmodus åpner registrering uten bekreftelse i den deploybare tjenesten. Kontotestene bruker en fanget testpostkasse og sender ikke faktisk e-post.

## Serveroppsett

| Innstilling | Bruk |
| --- | --- |
| `DATABASE_URL` | Samme PostgreSQL-tjeneste som prosjektet allerede bruker. Kundetabellene migreres separat og additivt ved første initialisering. |
| `BETTER_AUTH_SECRET` | Eksisterende serverhemmelighet kan brukes som grunnlag for en egen HMAC-avledet kundehemmelighet. Må være minst 32 tegn. |
| `FELLESTALL_CUSTOMER_AUTH_SECRET` | Valgfri separat grunnhemmelighet for kunder. Erstatter grunnlaget over når den er satt; den formålsavledes fortsatt. |
| `FELLESTALL_CUSTOMER_ORIGIN` | Kundeklientens eksakte origin, uten sti. Sett denne ved bruk av et stabilt alias eller et annet kundedomene. |
| `VERCEL_ENV` og `VERCEL_URL` | Uten eksplisitt kunde-origin brukes Vercels konkrete Preview-origin i Preview. Ellers er standard `https://fellestall.no`. |
| `RESEND_API_KEY` | Eksisterende nøkkel for e-postleverandøren. |
| `FELLESTALL_CUSTOMER_EMAIL_FROM` | Verifisert avsender for kundepost. Faller tilbake til `FELLESTALL_EMAIL_FROM`. |

Kunde- og admincookies har forskjellige prefikser. Kundekontoer og adminbrukere ligger i forskjellige tabeller. Registrerings- og innloggingsbegrensninger bruker kundens databasetabell for hastighetsbegrensning, som deles mellom funksjonsinstanser. Produksjonen bruker Vercels betrodde klient-IP-header.

## Tilgang og ressursregister

`/api/customer/session` returnerer innlogget kunde og det serverstyrte kontonivået. Nye kontoer får `free`. Det finnes ingen offentlig operasjon for å gjøre seg selv betalt eller administrator. Bekreftet betalingsbehandling og kvotehåndheving implementeres i SVEN-L05 og SVEN-L06.

Ressursregisteret knytter prosjekter, samtaler, filer og analysejobber til kunden. Eierskap bestemmes fra økten, aldri fra en `ownerId`, `customerId`, rolle eller et abonnementsfelt sendt av nettleseren. Prosjekt- og samtaletilknytning kontrolleres mot samme eier. Lesing og navneendring er eierfiltrert, og en annen kunde får 404 også når vedkommende kjenner en gyldig ID.

Sven krever kundeøkt før chat, filbehandling og oppfølgingsoppslag. Før et nytt modelloppdrag registreres, kontrolleres samtalen, prosjektet og refererte fil-ID-er. Henting av status og gjenopptak kontrollerer jobbeierskapet på nytt. Forespørselscachen får en kundenavngitt intern ID, slik at den ikke kan gjenbruke en annen kundes eller en tidligere operatørkjørings cache. Krypterte køsjekkpunkter binder jobben til kunde og opprinnelig forespørsels-ID; arbeideren kontrollerer denne tilknytningen før neste kjøring.

| Rute | Funksjon |
| --- | --- |
| `GET /api/customer/config` | Tilgjengelighet for registrering og e-postgjenoppretting, uten hemmeligheter. |
| `/api/customer/auth/*` | Avgrenset tillatt sett for registrering, innlogging, utlogging, bekreftelse og gjenoppretting. Andre konto-/adminoperasjoner er ikke eksponert. |
| `GET /api/customer/session` | Kundeidentitet og serverstyrt kontonivå; 401 uten en gyldig, bekreftet kundeøkt. |
| `GET /api/customer/resources/{kind}` | Kundens egne metadata for prosjekter, samtaler, filer eller jobber. |
| `GET /api/customer/resources/{kind}/{id}` | Eierskapskontrollert metadata for én ressurs. |
| `POST /api/customer/resources/{kind}` | Opprett prosjekt-, samtale- eller filmetadata. Jobber opprettes gjennom Sven. |
| `PUT /api/customer/resources/{kind}/{id}` | Endre navnet på en egen ressurs. Eierskap og tilknytning kan ikke overtas. |

Registeret er nå koblet til [varig innholdslagring, synkronisering og sletting](sven-lagring.md). Samtaler, prosjekter, leveranseversjoner, følgevalg og originalfiler lagres på kontoen og hentes på en annen enhet. Mobilen lagrer en lokal utboks for endringer som ennå ikke er kvittert; konflikter er synlige og kan eksporteres. Bekreftet utlogging fullfører lagring før lokal arbeidskopi fjernes. Produksjonsaktivering og faktisk driftsbackup gjenstår i SVEN-L08/SVEN-L09.

Lagring eksponerer også paginert `GET /api/customer/content`, versjonskontrollert `PUT /api/customer/content`, eierkontrollert `GET /api/customer/files/{id}`, `DELETE /api/customer/resources/{kind}/{id}` og passordbeskyttet `DELETE /api/customer/account`. Se lagringsveiledningen for format, grenser og slettesemantikk.

## Mobilklienten

Kundekoblingen legges på den [verifiserte klientbaselinen](sven-mobilinventar.md) ved en egen klargjøring. Det private klientrepoet beholder commit `55bfa030951d4736a0c06e50eb62e35a387f7640`; ingen Site publiseres av denne kommandoen:

```sh
node scripts/customer/prepare-mobile.mjs /sti/til/privat-klientrepo /tom/outputmappe
```

Klargjøringen krever eksakt baseline og uendret sporet kilde. Den kopierer kun sporede Git-blobber fra commiten, avviser uventede filtyper og krever tom output. Deretter kobles `customer-auth.js` og `customer-storage.js` til klienten, og de kjente integrasjonspunktene oppdateres med kontoflyt, eierskap, innholds-/filsynkronisering og sletting. Kjent kilde må matche før en slik tilpasning kan utføres. Output får `customer-source.json` med klient- og serverref og `customerDirty` for kontroll. En lanseringskandidat krever committet kode og `customerDirty: false`; en utviklingspakke med lokale endringer er ikke en slik kandidat.

Før klienten startes, hentes den faktiske økten fra serveren. Nettlesercache og filbase får et eget navn per kundekonto; gammel lokal testkonto importeres ikke automatisk. Lokal `session: true` og direkte navigasjon til `#sven` gir ikke innlogging. Passord, sesjonstoken og gjenopprettingstoken lagres ikke i nettleserlageret. Gjenopprettingstokenet tas ut av adressefeltet og beholdes kun i minnet mens nytt passord velges.

Produksjonspakkeren inkluderer en egen `customer-api`-funksjon og ruter `/api/customer/*` til den. Sven-rutene beholder Preview-avgrensningen inntil den samlede produksjonspakken er klar i SVEN-L08. En separat pakking av chat-, fil- eller køarbeider må også ta med kundetjenestens `schema.sql` ved siden av den bundlete funksjonen. Det er den samme kundemigreringen som brukes i alle instansene; den serialiseres med en PostgreSQL-advisory-lås. Adminbootstrap brukes ikke av kundetjenesten.

## Verifikasjon

Automatiserte kontroller bruker Better Auth, reelle passordhasher og en isolert PostgreSQL-motor (PGlite). De dekker to kunder, alle fire ressurstyper, direkte API-kall, ulovlige foreldretilknytninger, status/gjenopptak, køarbeid, kunde-/adminskille, forsøk på egen oppgradering, sign-out, utløpte økter, gjenoppretting og tilbakekalling. Migrering er prøvd med påtvunget feil og rollback, deretter vellykket og gjentatt kjøring med bevart adminbruker. Kundens funksjonspakke er også bygget med SQL-grunnlaget.

```sh
node --test scripts/customer/*.test.mjs
```

Mobilreisen er prøvd i Chromium på 390 × 844 med den faktiske klargjorte klienten, ekte konto-API og isolert database. E-post fanges lokalt og Sven-modellen er kontrollert erstattet. Kontrollen dekker registrering, bekreftelse, HttpOnly-cookie, innlogging, prosjekt, samtale, vedlegg, analysejobb, to isolerte kunder, utlogging og nytt passord.

26. november besto hele backend- og frontendtestsettet, produksjonsbygg med SEO-kontroll og samlet statisk Vercel-pakking med kundens rute, funksjon og migreringsgrunnlag. Den utvidede mobilreisen kontrollerer også en annen enhet, varig analyse etter lukket side, versjonskonflikt, originalfiler og sletting. Skjermbilder av innlogging, chat, konfliktvarsel og lagringsside er visuelt kontrollert. Se [lagringsveiledningen](sven-lagring.md) for kontrollbevis og driftsbegrensninger.

For å gjenta nettleserkontrollen med en kompatibel Playwright-installasjon:

```sh
node scripts/customer/browser-fixture.mjs /sti/til/klargjort-klient 4181
# I en annen terminal, eventuelt med PLAYWRIGHT_MODULE_PATH satt:
node scripts/customer/browser-test.mjs http://127.0.0.1:4181 /tmp/fellestall-customer-browser
```

Fixture-serveren binder bare til loopback, bruker en egen testdatabase og har en lokal testpostkasse. Den er ikke en deploybar inngang. Ekte e-postlevering, produksjonsinnlogging, fysisk iPhone/Android og live modell-/søkekall må fortsatt verifiseres ved lanseringskontrollen. Ingen produksjonsdatabase, kundeutsending eller utrulling er brukt til denne testen.
