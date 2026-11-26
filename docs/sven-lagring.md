# Varig kundeinnhold i Sven

Steg 3 i [lanseringsplanen](sven-lansering.md) er implementert og lokalt kontrollert 26. november 2026. Mobilklienten bruker fortsatt den verifiserte private baselinen `55bfa030951d4736a0c06e50eb62e35a387f7640`, med konto- og lagringskoblingen fra PR #90 lagt på ved klargjøring. PR-en er utkast. Ingen produksjonsdatabase, utrulling, kundepost eller fakturerbare modellkall er brukt til kontrollen.

## Hva som lagres

Kundens samtaler med svar, kildehenvisninger og leveranseversjoner, prosjekter, lagrede analyser, følgevalg, oppdateringshistorikk og profil-/visningsvalg lagres i PostgreSQL. Originale vedlegg og deres lesegrunnlag lagres også der. Et originalvedlegg kan hentes på en annen enhet og brukes av den eksisterende Office-redigeringen. Innloggingsadresse og tilgang kommer fortsatt fra kontotjenesten; profilens kontakt-e-post endrer ikke innloggingen.

Små, private originalfiler beholdes i eksisterende PostgreSQL fremfor å innføre en ny ekstern lagringstjeneste i denne leveransen. Dagens filgrense er 2 MiB. Fil- og dokumentinnhold komprimeres og krypteres med AES-256-GCM og en formålsavledet nøkkel. Kundens ID og dokumentets type/ID bindes til krypteringen. Eierskap og enkelte metadata, blant annet navn og tidspunkt i ressursregisteret, er ordinære databasefelter. Dette er serverstyrt kryptering, ikke ende-til-ende-kryptering.

Det er tekniske grenser på 2 MB JSON per dokument, 2 000 aktive dokumenter og 25 MB kryptert dokumentinnhold per konto. Fillagerets foreløpige tekniske grense er 100 MB kryptert lagring per konto. Disse er vern mot for store arbeidssett, ikke vedtatte kommersielle gratis-/betalingskvoter. Forbruksgrenser og priser følger SVEN-L02, SVEN-L05 og SVEN-L06.

## Endringer og flere enheter

`GET /api/customer/content` returnerer kundens dokumenter i sider med cursor. Svar begrenses til 100 dokumenter og omtrent 2,8 MB. `PUT` mottar inntil 100 endringer med forventet versjon, og returnerer de endrede dokumentene. Hver skriving låser kundens databasepost, kontrollerer versjon og eierskap og lagrer hele endringssettet atomisk. Gamle versjoner får 409. En annen kundes ID eller filreferanse gir ikke tilgang.

Mobilen henter serverinnhold før den private klienten startes. Nettleserlageret er en arbeidskopi med en vedvarende utboks for endringer som ikke er kvittert. Endringer sendes fortløpende; ny oppstart og tilkobling forsøker å fullføre lagringen. Fokus og periodisk oppslag henter endringer fra andre enheter. Aktiv samtale og aktivt prosjekt er lokale navigasjonsvalg; velg prosjektet for å åpne dets samtaler på en ny enhet.

Hvis samme innhold er endret på to enheter, vises et varig konfliktvarsel. Lokale endringer beholdes i utboksen og kan lastes ned før brukeren uttrykkelig velger den lagrede versjonen. Nettverks- og størrelsesfeil skal heller ikke gi en falsk melding om serverlagring. Utlogging venter på lagring før lokal kundecache fjernes; en lagringsfeil lar arbeidet bli igjen og forklarer hvorfor utlogging ikke ble fullført. Ved utløpt økt bevares utboksen til samme konto logger inn igjen. En annen konto importerer den ikke.

## Jobber og sletting

Analysejobbenes sjekkpunkter og ferdige svar bruker nå `ft_customer_job`, uten Runtime Cache-TTL. Offentlige kildeuttrekk kan fortsatt bruke Runtime Cache. Nye instanser, tømt offentlig cache og en lukket produsentside endrer ikke kundens jobblager. Den andre enheten bruker samme innsendings-ID for å hente resultatet.

En atomisk databaselease med tilfeldig token beskytter mot parallelle arbeidere. Hver sjekkpunktskriving krever det gjeldende tokenet, en ikke utløpt lease og et levende jobbregister. En gammel arbeider kan ikke skrive etter overtakelse eller sletting. En køkopi får ikke opprette et manglende varig sjekkpunkt. Den eksisterende avgrensede køgjenopprettingen etter uavklart modellkall må fortsatt kobles til forbruksregnskapet i SVEN-L05/SVEN-L07; en lease alene gir ikke nøyaktig én fakturering hos modellleverandøren.

Samtaler og prosjekter har sletteknapper i sine eksisterende oversikter. Sletting fjerner lagret innhold og tilhørende jobber, samt originalfiler knyttet til den slettede samtalen eller prosjektet. Analysehenvisninger slettes sammen med samtalen. Tombstones hindrer at en gammel nettleser oppretter samme ressurs på nytt. Filer som bare er lastet opp, men ikke knyttet til en samtale eller et prosjekt, kan slettes fra «Data og lagring».

«Slett originalfil» fjerner originalen og direkte filreferanser i lagrede dokumenter. Svar og sitater som allerede er skrevet fra filen kan fortsatt inneholde opplysninger; hele arbeidsresultatet fjernes ved å slette samtalen/prosjektet. Nedlastede og delte faste kopier kan ikke tilbakekalles ved sletting av originalen. Dette forklares i klienten.

Kontosletting krever det gjeldende passordet og en uttrykkelig bekreftelse i klienten. Kunde, autentiseringsdata, økter, tilgang, ressurser, innhold, originalfiler og jobbsjekkpunkter fjernes. En separat slettelogg inneholder en nøkkelavledet eierhash, type, ID og tidspunkt, uten privat innhold. Den beholdes for å håndheve sletting ved gjenoppretting av eldre kopier. Krypterte kopier hos kø-/backupoperatører kan ha egen oppbevaringstid; faktisk oppbevaring og personverntekst skal bekreftes før lansering i SVEN-L09.

## Preview og domenebytte

Den gamle lokale testkontoen mangler bekreftet eierskap og flyttes ikke automatisk inn i en kundekonto. Den private Sites-baselinen er uendret, og eksisterende testarbeid kan beholdes eller eksporteres fra den gamle forhåndsvisningen. Klientens lagringsside forklarer dette. Det er ingen skjult import eller masseoverføring av gamle profiler.

Ved bytte mellom preview og lanseringsdomene må kunden logge inn på nytt. Samme database, kunde-ID og krypteringsgrunnlag gir tilgang til det lagrede innholdet på det nye domenet. Cookies, IndexedDB, utboks og lokale navigasjonsvalg følger ikke automatisk mellom domener. Fullfør lagring eller eksporter ventende lokale endringer før domenebytte. En faktisk overgang til produksjonsdomenet kontrolleres i SVEN-L08.

## Sikkerhetskopi og isolert gjenoppretting

Operatørverktøyet tar et konsistent, kryptert innholdsuttrekk med kontrollsum og skjemaversjon. Det inkluderer dokumenter, originalfiler, ressursregistre og jobbsjekkpunkter. Passord, konto-e-post fra autentisering, sessions og betalings-/tilgangsdata inngår ikke. Profilens frivillige kontaktopplysninger inngår som øvrig kryptert kundeinnhold. Autentisering og annen drift krever også den vanlige databaseberedskapen.

Kommandoene leser forbindelsen og nøkkelgrunnlaget fra operatørmiljøet. Filene opprettes med tilgang 0600 og overskriver ikke eksisterende filer. Ingen hemmelige verdier skal gis som kommandolinjeargument eller lagres i repoet.

```sh
node scripts/customer/backup.mjs backup /privat/sven-innhold.backup.json
node scripts/customer/backup.mjs erasures /privat/sven-slettelogg.json
# SVEN_ERASURE_LEDGER_FILE peker på den nye krypterte sletteloggen.
node scripts/customer/backup.mjs verify-restore /privat/sven-innhold.backup.json /privat/ny-isolert-testbase
```

`verify-restore` kan bare opprette en ny lokal PGlite-base. Det finnes ingen kommandolinjemodus som gjenoppretter mot en produksjons-URL. Biblioteket avviser et ikke tomt mål, feil kontrollsum, feil nøkkel, gammelt skjema eller en slettelogg tatt før kopien. Slettede kontoer og dokumenter fra en nyere logg gjeninnføres ikke. Kundene får utilgjengelige testidentiteter uten passord og økter i den isolerte basen. Aktive leases frigjøres der.

Før en reell driftsgjenoppretting må skriving/sletting stanses og **en ny slettelogg hentes fra det gjeldende systemet før det erstattes**. Loggen fra selve den gamle sikkerhetskopien er utilstrekkelig. Oppbevar logg og nøkkelgrunnlag separat fra databasekopien. Bytte av innloggingshemmelighet uten innholdsmigrering gjør eksisterende kryptert innhold uleselig; en planlagt nøkkelrotasjon må bevare gamle nøkler til data og kopier er migrert.

Daglig produksjonskopi, separat lagringsmål, oppbevaringstid, tilgang til nøkler og faktisk produksjonsgjenoppretting er driftsaktivering i SVEN-L08/SVEN-L09. Denne leveransen dokumenterer og prøver innholdsformat og isolert gjenoppretting, og oppretter ingen uavtalt ekstern tjeneste eller planlagt jobb.

## Kontrollbevis

`scripts/customer/storage.test.mjs` kontrollerer kryptert lagring, omstart, fremmede eiere, filinnhold, versjoner, rollback, paginering, parallelle instanser, gjenbruk av ferdig svar og sletting mens en modellforespørsel pågår. Gjenoppretting prøves i en annen database, med kontroll av originalfiler og historikk. En gammel kopi prøves også mot en nyere logg som sletter én konto og en annen kundes samtale. Migrering fra kontoskjema 1 til innholdsskjema 2 bevarer bruker og eierskap.

Nettleserkontrollen bruker den faktiske klargjorte mobilklienten på 390 × 844, tre isolerte Chromium-kontekster, ekte Better Auth-økter og en kontrollert modell/postkasse. Den åpner prosjekt, samtale, lagret analyse, profilvalg og originalfil på en annen enhet. En bakgrunnsanalyse fullføres av en ny arbeider etter at produsentsiden lukkes og offentlig cache tømmes. Den prøver ulagrede endringer etter nettverksfeil og ny sideoppstart, synlig versjonskonflikt i lyst og mørkt tema, lokal eksport, originalnedlasting, utlogging, nytt passord, samtalesletting og kontosletting med feil og riktig passord. Ingen virkelig e-post eller modellforespørsel sendes.

26. november besto alle **178 backendtester og 245 frontendtester**, produksjonsbygg med SEO-kontroll, samlet statisk Vercel-pakking og den utvidede mobilreisen. Skjermbilder av lagringsside og konflikt i begge temaer er visuelt kontrollert. Den klargjorte mobilkilden kontrolleres også mot ren, committet PR-kode før statusen lagres.

Kontrollene kjøres som beskrevet i [kundekontoveiledningen](sven-kundekontoer.md). Fysisk Safari/iPhone, Chrome/Android, produksjonsmiljø og live modell-/søkekvalitet gjenstår som egne lanseringskrav.
