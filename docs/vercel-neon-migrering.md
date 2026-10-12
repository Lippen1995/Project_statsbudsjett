# Plan for sømløs overgang til Vercel og Neon

Dato: 12. oktober 2026. Status: plan, ingen produksjonsendringer utført.

## Mål og utgangspunkt

Fellestall.no skal flyttes til Vercel og ta Neon i bruk uten planlagt nedetid,
tap av data eller endringer i etablerte adresser, tall og brukerfunksjoner.
Overgangen deles i to produksjonsendringer: hosting først, datalagring etterpå.

Bekreftet i tilgjengelig kode og en HTTP-kontroll av forsiden:

- Vite/React bygges til `web/dist`; produksjonen svarer fra GitHub Pages.
- Frontenden leser statiske JSON-filer under `/data/`.
- Python-ETL kjøres i GitHub Actions og legger genererte data i repositoryet.
- KOSTRA bruker en lokal SQLite-modell og eksporterer statisk JSON.
- `deploy.yml` henter validerte analyseutkast, bygger forhåndsvisninger og
  oppdaterer gjennomgangslenker. Flere workflows starter denne jobben direkte.
- Analysepublisering og eventuell LinkedIn-distribusjon avhenger av deploy-flyten.

Dette er ikke en flytting av en eksisterende PostgreSQL-produksjonsdatabase.
Neon innføres som varig datalager og kilde for eksport. Nettsiden fortsetter
å bruke statiske JSON-filer gjennom overgangen. Eventuelle dynamiske API-er
behandles som en senere endring med egen begrunnelse og verifikasjon.

## 1. Kartlegging og referanse

1. Bekreft siste produksjonscommit, workflow-kjøring og publisert datasett.
   Den lokale kopien må sammenholdes med gjeldende `main` før implementering.
2. Registrer DNS-leverandør, alle A/AAAA/CNAME-poster, TTL, CAA og eventuell
   DNSSEC. Ta kopi av sonen og bevar MX/TXT og øvrige tjenester.
3. Bekreft riktig Vercel-team, prosjekt, Neon-eierskap og kostnadsramme.
4. Lag manifest av dagens produksjonsfiler med filnavn, størrelse og SHA-256.
   Ta vare på siste fungerende bygg og data uten å stole på Actions-cache.
5. Kartlegg alle publiseringstriggere, forhåndsvisninger og distribusjonsjobber.
   Registrer viktig funksjonalitet, representative tall og dagens lastetider.
6. Definer hvem som gjennomfører overgangen og beslutter tilbakeføring.

Ferdig når: produksjonsreferanse, DNS-kopi, gjenopprettbart bygg og liste over
publiseringsavhengigheter er dokumentert.

## 2. Klargjør Vercel parallelt

1. Sett opp statisk Vite-publisering med riktig prosjektrot og Node-versjon.
   Bruk en støttet versjon som tilfredsstiller prosjektets Vite-avhengigheter.
2. Behold GitHub Actions som orkestrator i første omgang: bygg én gang og
   publiser samme validerte resultat til begge plattformer. Avklar hvordan
   Vercel CLI bygger/pakker dette; en vilkårlig `dist`-mappe er ikke i seg selv
   et gyldig `--prebuilt`-artefakt.
3. Behold innsamling av analyseutkast, sitemap, SEO-kontroll og alle eksisterende
   datagenereringssteg. Ikke erstatt dette med et rent Git-basert Vercel-bygg
   før tilsvarende oppførsel er dokumentert og testet.
4. Test på Vercel-adresse uten å flytte domenet. Skill test fra produksjon,
   unngå indeksering av testadressen og kontroller tilgang til utkast.
5. Bevar adresser, hash-navigasjon, analyse-HTML, nedlastinger og reelle 404-svar.
   Unngå en generell SPA-omskriving som returnerer HTML for manglende JSON.
6. Sett eksplisitte cacheregler: versjonerte JS/CSS-filer kan caches lenge;
   HTML og JSON på stabile adresser må revalideres. Behold gamle hash-navngitte
   ressurser i overgangsperioden, slik at åpne faner fortsatt kan laste dem.
7. Klargjør en produksjonsutrulling uten domeneoverføring og test dette bygget.
   Avklar domeneverifikasjon, TLS-utstedelse og CAA før DNS endres. Hvis TLS
   ikke kan klargjøres uten trafikkendring, må en testet overgangsmekanisme
   etableres før lansering; dette er en stoppbetingelse.

Ferdig når: identiske data og sider virker på Vercel, riktig produksjonsbygg
er testet, og domenets TLS- og rutingsløp er avklart.

## 3. Flytt trafikken til Vercel

1. Senk relevante TTL-er, for eksempel til 300 sekunder, minst én tidligere
   TTL-periode før overgangen. Registrer også tidligere cachelevetid.
2. Hold begge verter på samme validerte kode- og dataversjon. Sett nye
   publiseringer kortvarig i kø under overgangen; nettsiden forblir tilgjengelig.
3. Endre bare nødvendige webposter for hoveddomene og `www`, til verdiene
   Vercel oppgir for dette prosjektet. Håndter A og AAAA samlet; gamle
   IPv6-poster må ikke bli stående som en utilsiktet alternativ rute.
4. Behold GitHub Pages, CNAME-fil og domenekobling under overgangsperioden.
   Brukere med gamle DNS-svar skal fortsatt få en fungerende side.
5. Kontroller HTTPS, sertifikat, `www`-videresending, hovedside, analyser,
   datanedlastinger og 404 fra flere nettverk og DNS-oppslag.
6. Etter stabilisering lar publiseringsflyten Vercel være primærvert.
   Bekreft at Actions-genererte commits faktisk utløser publisering: ikke
   baser flyten på at en push med `GITHUB_TOKEN` starter nye workflows.
7. Distribusjon av analyser skal skje én gang og først etter at riktig
   analyse og innholdshash er kontrollert på produksjonsdomenet.

Ferdig når: trafikk og oppdateringer fungerer på Vercel, med GitHub Pages
fortsatt tilgjengelig som retrettmulighet.

## 4. Ta Neon i bruk uten å endre nettsidens datakontrakt

1. Opprett separate test- og produksjonsmiljøer. Velg egnet europeisk region;
   eventuelle Vercel Functions plasseres nær databasen.
2. Bestem hvilke data Neon skal lagre: KOSTRA-modellen og øvrige nødvendige
   datasett fra DFØ/SSB, med kilde, periode, enhet og importversjon. KOSTRA-
   skjemaet alene dekker ikke hele nettstedet. Frosne analysegrunnlag bevares.
3. Lag versjonerte PostgreSQL-migreringer. Oversett SQLite-spesifikke uttrykk
   og kontroller nøkler, NULL, beløpspresisjon, indekser og konfliktbehandling.
   Bruk presise beløpstyper der det trengs; avklar avrunding mot dagens eksport.
4. Importer gjeldende validerte grunnlag og sammenlign rader, summer, år,
   geografiske koder, regnskap/budsjett, anslag og manglende verdier.
5. Kjør Neon-import og eksport parallelt med gammel ETL som verifikasjon.
   Bare eksisterende flyt publiserer frem til den nye eksporten er godkjent.
6. Bevar JSON-adresser og format. Krev identiske verdier og filhash der
   serialiseringen er identisk; skill dokumenterte metadataforskjeller fra
   faktiske tallforskjeller.
7. Gjør importer idempotente. Skriv en komplett ny dataversjon, valider den,
   og marker den aktiv først etter vellykket import. Eksporter én bestemt
   versjon slik at nettstedet ikke blander data fra ulike kjøringer.
8. Oppbevar databasehemmeligheter i Actions/Vercel, aldri i frontend eller
   offentlige variabler. Skill importerens skriverettigheter fra lesetilgang.
   Avklar direkte forbindelse for import og pooling for eventuell runtime.
9. Verifiser backup-/restore-vindu for valgt Neon-abonnement og prøv faktisk
   gjenoppretting. Behold tidligere eksport og nødvendig rågrunnlag.
10. Etter godkjent parallellkontroll gjøres Neon til autoritativt datalager.
    Produksjonsbygget bruker godkjent JSON-eksport; et Neon-avbrudd skal ikke
    gjøre det allerede publiserte nettstedet utilgjengelig.

Ferdig når: en ny import kan publiseres fra Neon, ny kjøring gir samme resultat,
og feil gir fortsatt siste fungerende nettsted og datasett.

## 5. Verifikasjon og beslutningskriterier

Før hver produksjonsendring må relevante frontend-/ETL-tester, produksjonsbygg,
SEO-kontroll og eksisterende publiseringssjekk passere. Kontroller i nettleser
på mobil og desktop: grafer, drill-down, søk, kart, CSV, analyser og utkast.

Krav for å fortsette:

- Ingen uventede tallforskjeller, manglende filer eller brutte adresser.
- Gyldig HTTPS for hoveddomene og `www`; korrekt videresending.
- Ingen nye feil i kritiske brukerflyter; ytelse innenfor avtalt budsjett
  målt med samme metode som referansen.
- Publisering og analyseforhåndsvisning fungerer; distribusjon dupliseres ikke.
- Siste fungerende versjon kan gjenopprettes gjennom en øvd prosedyre.

Avtal konkrete målegrenser etter referansemålingen. Følg tilgjengelighet,
JSON-feil, 404/5xx, lastetid, publiseringsstatus og importstatus tett første
time, deretter gjennom minst 48–72 timer og én full dataoppdatering.

## 6. Tilbakeføring og avslutning

| Feil | Tiltak |
| --- | --- |
| Feil i nytt Vercel-bygg | Sett tilbake siste fungerende Vercel-utrulling med kompatibelt datasett. |
| Vercel-, domene- eller TLS-problem | Gjenopprett lagrede web-DNS-poster. Begge verter holdes operative mens DNS-cacher utløper; DNS-tilbakeføring er ikke øyeblikkelig. |
| Feil i Neon-import eller eksport | Ikke aktiver dataversjonen. Fortsett å vise siste godkjente JSON-eksport. |
| Feil oppdages etter datapublisering | Publiser forrige godkjente bygg/datasett og korriger importen før ny aktivering. |

Ved kritiske funksjonsfeil, ugyldig TLS eller uforklarlige tallforskjeller
stoppes videre aktivering og tilbakeføringsprosedyren brukes. Databaseendringer
skal være bakoverkompatible i overgangsperioden; Vercel-rollback ruller ikke
tilbake en database.

Avvikle gammel hosting først etter stabilitetsperioden, utløpt gammel DNS-TTL,
verifisert dataoppdatering og gjenopprettingskontroll. Rydd deretter i gamle
publiseringsjobber, dokumentasjon og DNS; bevar arkiverte referansebygg.

## Anbefalt gjennomføringsrekkefølge

1. Produksjonsreferanse og avhengighetskart.
2. Vercel-publisering i parallell, full verifikasjon og øvd tilbakeføring.
3. DNS-overgang og stabilisering.
4. Neon-skjema, import og parallell eksportkontroll.
5. Neon-basert datapublisering og kontroll av en full oppdateringssyklus.
6. Avvikling av gammel hosting og oppdatering av driftsdokumentasjonen.

Fasene styres av ferdigkriteriene, ikke en forhåndslåst lanseringsdato.
