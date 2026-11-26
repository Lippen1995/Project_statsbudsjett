# Mobilklientens kilde og funksjoner ved lansering

Dette er det tekniske funksjonsinventaret for [lanseringsarbeidet](sven-lansering.md), kontrollert 26. november 2026. Grunnlaget er mobilversjonen Simen oppga for Sven-previewen. Funksjonene nedenfor inngår i ferdigstillingen; inventaret er ikke en godkjenning for produksjon.

## Verifisert klientgrunnlag

| Felt | Verdi |
| --- | --- |
| Kilde | Det separate, private Sites-repoet for «Sven – fem mobilutkast». Tilgang hentes gjennom Sites. |
| Gren | `preview/sven-cost` |
| Eksakt commit | `55bfa030951d4736a0c06e50eb62e35a387f7640` |
| Klientrot | `dist/` |
| Startside | `dist/index.html` |
| Kildetype | Statisk HTML, JavaScript, CSS, ressurser og data. `dist/` er sjekket inn og inneholder den kjørbare klienten. |
| Bygg | Ingen `package.json` eller kompilering på denne revisjonen. Pakk `dist/` direkte fra den eksakte commiten. |
| Filgrunnlag | 51 filer, 4 926 951 byte; 13 JavaScript-filer. |
| SHA-256 for kommandoens tararkiv nedenfor | `88a5eb6f21e31233f56acee143969c1989ea645d164fc35a09211b5d151066f2` |

Grenens HEAD ble kontrollert mot den fulle commiten. Den private klientkilden kopieres ikke inn i det offentlige serverrepoet som del av denne kartleggingen. Klientens prosjektidentitet bevares i dens eksisterende `.openai/hosting.json`.

Fra en autorisert utsjekk av det private klientrepoet kan klientartefakten gjenskapes slik:

```sh
git rev-parse '55bfa030951d4736a0c06e50eb62e35a387f7640^{commit}'
git archive --format=tar 55bfa030951d4736a0c06e50eb62e35a387f7640 dist > /tmp/sven-mobile-55bfa03.tar
sha256sum /tmp/sven-mobile-55bfa03.tar
```

Dette pakker klienten. Den samlede produksjonspakken med serverruter og køarbeider ferdigstilles i SVEN-L08. Registrer begge kodeversjonene og eventuelle pakketransformasjoner ved hver lanseringskandidat; et nytt gren-HEAD erstatter ikke automatisk denne baselinen.

## Oppstart og kobling til serveren

`index.html` laster 13 lokale skript i fast rekkefølge. Domenets rot viser landingssiden; hash-rutene åpner mobilvisningene. Manifestet åpner `#hjem` som en frittstående snarvei. Det er ingen service worker i dette kildegrunnlaget, og full frakoblet bruk er ikke et lanseringsløfte.

Den uendrede `dist/index.html` har ikke `meta[name="sven-live"]`. Uten denne markøren bruker chatten klientens avgrensede demosvar. Markøren aktiverer tilkoblet klientmodus og må inngå i den dokumenterte pakkingen, sammen med de faktiske serverrutene. Previewklientens lokale testøkt, inkludert snarveien via `#sven`, skal erstattes av kundetilgang i SVEN-L03 og SVEN-L08.

| Integrasjon | Bruk i klienten | Kontroll før lansering |
| --- | --- | --- |
| `GET /api/sven/chat` | Modellvalg, resonneringsnivåer og eventuell Google Picker-konfigurasjon. | Konfigurasjon, tilgang og tillatte valg stemmer med kontotypen. |
| `POST /api/sven/chat` | Spørsmål, vedleggstekst, prosjektkontekst, status og gjenopptak med samme forespørsels-ID. | Serverkontroll av konto, eierskap, kvote og gjentatt innsending. |
| `POST /api/sven/file` | Lesing av vedlegg, visuell lesing, Office-redigering og nedlasting. | Ekte filer, kvote, avgrensninger og private rettigheter er prøvd. |
| `POST /api/sven/watch` | Sjekk av tall og stortingssaker brukeren følger. | Lagrede følgevalg, feil og nye observasjoner fungerer mot offentlige kilder. |
| Fellestalls offentlige data og analysesider | Datagrunnlag for verktøy og innbygde analyser. Tilkoblet modus henter blant annet kommune- og budsjettdata fra Fellestall. | Dataserier, manglende verdier, opprinnelse og feiltilstander er riktige på lanseringsdomenet. |
| Google Drive | Picker og `drive.file` aktiveres når serveren returnerer de tre nødvendige konfigurasjonsfeltene. | Aktivering er ikke bekreftet av denne lokale gjennomgangen. OAuth-origin og faktisk import prøves hvis funksjonen tilbys. |

Ingen API-nøkler, kilderepo-credentials eller private kundedata inngår i dette dokumentet.

## Funksjonsinventar

| Område | Skjerm eller brukerhandling | Kilde i klienten | Lanseringsoppgaver |
| --- | --- | --- | --- |
| Landingsside | Intro, hopp over animasjon, åpne siden, registrer deg og logg inn. | `index.html`, `startup-intro.js`, `landing.js` | SVEN-L08, SVEN-L10 |
| Navigasjon og søk | Hjem, verktøymeny, globalt søk, direkte lenker, tilbake og inntil fire personlige snarveier i bunnmenyen. | `mobile.js`, `data.js` | SVEN-L04, SVEN-L08, SVEN-L10 |
| Statsverktøy | Vokser staten?, Kartet, Endringer, Oljefondet, Lønnen din og Utforsk staten; tilgjengelige år, budsjettfaser og underliggende poster. | `services.js`, `data.js`, `mobile.js` | SVEN-L08, SVEN-L10 |
| Kommuner og fylker | Kommune-/fylkesvalg, regnskapsoversikt, tjenester, funksjoner, arter og historikk. | `services.js`, `municipal-directory.js` | SVEN-L08, SVEN-L10 |
| Sammenligning | Kommuneutvalg, tjenestevalg, median eller befolkningsvektet referanse, enhet og detaljvisning. | `services.js`, `mobile.js` | SVEN-L08, SVEN-L10 |
| Analysebibliotek | Filtre, sammendrag, full artikkel, arkiv og bokmerker for innlogget bruker. | `data.js`, `mobile.js` | SVEN-L04, SVEN-L08, SVEN-L10 |
| Kontekst til Sven | Spør om en post, markert tekst eller et område; ta med kilde og en egen kommentar. | `row-actions.js` | SVEN-L08, SVEN-L10 |
| Kundekonto | Registrering, innlogging og utlogging vises som lokale testhandlinger i grunnlaget. | `mobile.js` | SVEN-L03 |
| Profil og preferanser | Navn, e-post, telefon, stilling, organisasjon, politiske verv, parti/liste, interesser, kommunevalg, tema, tallvisning og snarveier. | `mobile.js` | SVEN-L03, SVEN-L04, SVEN-L09 |
| Innstillinger | Konto, utseende, bunnmeny, tall, Sven, varsler, personvern, data, abonnement og hjelp. Flere konto-/betalings-/varselområder er statusbeskrivelser for planlagte koblinger. | `mobile.js` | SVEN-L03, SVEN-L05, SVEN-L06, SVEN-L08, SVEN-L09 |
| Sven-chat | Startspørsmål, ny samtale, historikk, kilder, kopiering, arbeidssteg, gjenopptak og modell-/resonneringsvalg. | `mobile.js` | SVEN-L04, SVEN-L05, SVEN-L07, SVEN-L08, SVEN-L10 |
| Kapasitet | Forbruksindikator, periode og ekstra kapasitet. Gratis previewpåfyll og klientavregning er demonstrasjoner. | `mobile.js` | SVEN-L02, SVEN-L05, SVEN-L06 |
| Vedlegg og prosjekter | Filer inntil 2 MB, tekstuttrekk, bilder, PDF-grafikk, Office-felt, prosjektvalg og prosjektvedlegg. | `sven-files.js`, `sven-workspace.js` | SVEN-L04, SVEN-L05, SVEN-L08, SVEN-L10 |
| Revisjoner og eksport | Endre en leveranse, behold originalen, se nye versjoner og last ned CSV, XLSX, PPTX, DOCX, PDF og SVG når innholdet støtter formatet. | `sven-files.js`, `sven-workspace.js` | SVEN-L04, SVEN-L08, SVEN-L10 |
| Tallspor | Trykkbare observasjoner, originalkilde, datauttrekk, sitat, regnestykke og inngangstall. | `sven-insights.js` | SVEN-L08, SVEN-L10 |
| Arbeidsverktøy | Endringsdrivere, budsjettspor, sammenlignbarhet, påstandssjekk, kommuneutvalg, løfteoppfølging, avstemming og scenario med redigerbare antakelser. | `sven-insights.js`, `sven-workbench.js` | SVEN-L08, SVEN-L10 |
| Offentlige finanser | Rammetilskudd fra budsjett til mottaker, inntektsutjevning, skoleutgifter og kvalitet samt uvanlige regnskapsendringer. | `sven-finance.js` | SVEN-L08, SVEN-L10 |
| Lagrede Sven-analyser | Lagre et svar med forutsetninger, kjør på nytt, sammenlign kjøringer, velg versjon og fjern lagret analyse. | `sven-workbench.js` | SVEN-L04, SVEN-L08, SVEN-L10 |
| Del analyse | Forhåndsvis en fast analysekopi, kopier lenken, åpne som gjest og last ned lesbar HTML-kopi. | `sven-share.js` | SVEN-L08, SVEN-L09, SVEN-L10 |
| Følger og varsler | Legg til kommune-, budsjett- og saksoppfølging, se endringer, marker lest og fjern valg. Sjekk skjer ved bruk av appen. | `sven-insights.js` | SVEN-L04, SVEN-L08, SVEN-L10 |

## Delte analysekopier

Deling er allerede en synlig funksjon i denne klientversjonen og skal derfor inngå i lanseringskontrollen. Lenken inneholder en komprimert analysekopi i URL-fragmentet. Den peker ikke på en privat analysepost på serveren. Gjest kan åpne `#delt-analyse/…` når selve nettstedet er tilgjengelig, uten lokal testkonto eller et nytt modellkall.

Forhåndsvisningen viser hvilket innhold som deles. Kopien kan inneholde svar, kilder, kildeutdrag, forutsetninger og beregningsspor. Senere endringer i originalanalysen endrer ikke kopien. Sletting av originalen kan heller ikke trekke tilbake en distribuert lenke eller nedlastet HTML-fil. Brukerteksten må beskrive dette og riktig mottakerkrets etter at Vercels previewvern fjernes. Delingsgrensen har HTML-nedlasting som alternativ ved store analyser.

Før lansering skal en fersk gjest kunne åpne en valgt, fast versjon, uten å få andre samtaler, prosjektfiler eller kontodata. Privat vedleggsinnhold som tas inn i selve kopien må være synlig i forhåndsvisningen. Kopien skal ikke presenteres som en verifisert eller signert original fra serveren. Filtrering av aktivt HTML-innhold og kildeprotokoller er en del av SVEN-L10.

## Kontrollert ved kartleggingen

- Eksakt commit og gren er bekreftet; privat utsjekk er uendret.
- Alle 13 JavaScript-filer består `node --check`; alle 20 direkte lokale ressurslenker i `index.html` finnes.
- Klientartefakten er pakket med den dokumenterte kommandoen og har registrert SHA-256.
- 27 ruter er åpnet i Chromium med mobilbredde 390 × 844: offentlige sider, åtte verktøy, lokal registrering, profil, lagrede analyser og ti innstillingsgrupper. Sven, prosjekt- og kapasitetsdialog er kontrollert i tilkoblet klientmodus med kontrollert API-konfigurasjon.
- En kildebelagt testsvar-kopi ble delt, åpnet i en ny gjesteøkt og beholdt innholdet etter at testoriginalen ble endret. Delingens HTML-filter fjernet testens skript, bilde med hendelseskode og `javascript:`-lenke.
- Ingen JavaScript-sidefeil ble observert i disse kontrollene. Skjermbilder av Sven og gjestens delte kopi er visuelt kontrollert.

Kontrollene bruker lokale testdata og kontrollerte svar, uten nye modellkall eller publisering. De godkjenner ikke fysisk iPhone/Android, produksjonsinnlogging, betaling, Google OAuth eller reelle modell-/søkekjøringer; disse kontrollene ligger i arbeidslisten. Aktiv produksjonskonfigurasjon for Google Drive er heller ikke bekreftet her. Full sammenligning av Vercel-utrullingens filer mot klient- og serverversjonene inngår i SVEN-L08 og SVEN-L12.
