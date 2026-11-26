# Lansering av Fellestall og Sven

Målet er å lansere mobilløsningen med Sven **torsdag 10. desember 2026**, med både gratisversjon og betalt versjon. Arbeidet gjøres på `feat/sven-grunnmur` i [PR #90](https://github.com/Lippen1995/Project_statsbudsjett/pull/90). PR-en beholdes som utkast til hele leveransen er klar for lansering. Alle datoer følger Europe/Oslo.

Dette er arbeidslisten for lanseringen. [Kjøringsveiledningen](sven-kjoring.md) beskriver dagens implementering. Å være med i lanseringsomfanget betyr at funksjonen skal ferdigstilles og kontrolleres; det betyr ikke at den allerede er klar.

## Plan og milepæler

| Steg | Dato i 2026 | Leveranse | Ferdigkriterium |
| --- | --- | --- | --- |
| 1 | 26. november | Avgrensning og arbeidsliste | Synlige funksjoner er kartlagt; oppgavene har avhengigheter og kontrollerbare ferdigkriterier. |
| 2 | 27. november | Kundekontoer og tilgangskontroll | To brukere kan arbeide samtidig uten tilgang til hverandres data, også via API. |
| 3 | 30. november | Varig lagring | Arbeid finnes igjen på en annen enhet, etter utlogging og etter utløpt cache. |
| 4 | 1. desember | Gratis og betalt tilgang, kvoter og betaling | Serverens avregning er riktig; kjøp og gjentatte betalingshendelser gir riktig tilgang og belastning. |
| 5 | 2. desember | Samtidighetsvern og repeterbar utrulling | Samme jobb starter ikke doble samtidige modellkall; klient, API og køarbeider kan bygges fra kjente versjoner. |
| 6 | 3. desember | Komplett brukerflyt og drift | Registrering, chat, lagring, eksport og begge kontotypene fungerer med ekte modellkall; overvåking og tilbakeføring er prøvd. |
| 7 | 4. desember | Første lanseringskandidat | Mobilflyter og faktiske Sven-svar er kontrollert; feil, kvalitet, svartid og kostnad er dokumentert. |
| 8 | 7.–8. desember | Pilot og feilretting | Brukerne løser faktiske oppgaver uten veiledning; ingen alvorlige feil står åpne. |
| 9 | 9. desember | Endelig lanseringsbeslutning | Alle krav nedenfor er bestått for den eksakte kodeversjonen som skal lanseres. |
| 10 | 10. desember | Merge og lansering | Godkjent versjon er publisert og kontrollert på produksjonsdomenet; drift følges gjennom dagen. |

Kontoer, lagring og avregning er den største tidsrisikoen. Hvis den komplette brukerflyten ikke fungerer 3. desember, må lanseringsdatoen vurderes på nytt. Testuken skal bevares. Datoene er arbeidsfrister, ikke planlagte automatiske kjøringer.

## Første lansering

Hovedreisen er å åpne Fellestall på mobilen, opprette en konto, få en kildebelagt analyse fra Sven, følge opp spørsmålet, lagre arbeidet og bruke resultatet videre. Gratis og betalt tilgang skal bygge på den samme sikre konto- og forbruksplattformen.

| Område | Krav ved lansering | Arbeid |
| --- | --- | --- |
| Offentlige sider og mobilnavigasjon | Eksisterende gratis innhold, analyser, kommunetall og direkte lenker fungerer sammen med mobilklienten. | SVEN-L01, SVEN-L08 |
| Kunde og konto | Registrering, innlogging, utlogging, kontogjenoppretting og sletting har reell serverfunksjonalitet. | SVEN-L03, SVEN-L04, SVEN-L09 |
| Gratisversjon | Egen serverstyrt tilgang og begrenset kapasitet; brukeren ser grensen og kan oppgradere. | SVEN-L02, SVEN-L05, SVEN-L06 |
| Betalt versjon | Reelt abonnement, tydelig pris og kapasitet, betalingsstatus og oppsigelse; tilgangen følger bekreftede betalingshendelser. | SVEN-L02, SVEN-L05, SVEN-L06 |
| Kapasitet og modellvalg | Måleren viser avregnet bruk og riktig periode. Tilgang til modeller og resonneringsnivåer håndheves på serveren. | SVEN-L02, SVEN-L05 |
| Chat og undersøkelser | Samtalekontekst, arbeidsstatus, datagap, feil og gjenopptak fungerer med ekte modeller og kilder. | SVEN-L07, SVEN-L08, SVEN-L10 |
| Kommunesammenligning | År, regnskapsomfang, enhet, utvalg, median og kilde fremgår. Kostnadsavvik er grunnlag for undersøkelse; dokumenterte innsparinger krever eget grunnlag. | SVEN-L08, SVEN-L10 |
| Prosjekter og historikk | Samtaler, prosjektvedlegg, svar og leveranseversjoner er private, varige og tilgjengelige på tvers av enheter. | SVEN-L03, SVEN-L04 |
| Vedlegg og dokumentredigering | Dagens støttede filtyper, størrelsesgrenser og leseavgrensninger oppgis. Originalfiler og nye versjoner håndteres riktig. | SVEN-L04, SVEN-L08, SVEN-L10 |
| Leveranser | Synlige tabeller, grafer, kart, scenarioer og nedlastingsvalg virker. Dagens eksportformater er CSV, XLSX, PPTX, DOCX, PDF og SVG. | SVEN-L08, SVEN-L10 |
| Følger og varsler | Lagrede valg og endringer vises korrekt. Dagens kontroll ved åpning og under aktiv bruk beskrives presist. Bakgrunnsvarsling og push inngår ikke som nytt løfte. | SVEN-L04, SVEN-L08, SVEN-L10 |
| Google Drive | Hvis importen aktiveres i lanseringsklienten, må filvalg, autorisasjon og import være prøvd på lanseringsdomenet. | SVEN-L01, SVEN-L08, SVEN-L10 |
| Personvern og drift | Vilkår og personverntekst beskriver faktisk behandling, lagring og sletting; chat, kø, feil og kostnader overvåkes. | SVEN-L09 |

Ingen synlig konto-, kapasitets- eller betalingsfunksjon kan leveres med simulert bekreftelse. En eksisterende synlig funksjon kan bare tas ut av lanseringsomfanget etter en uttrykkelig avklaring med Simen; fristen alene er ikke grunnlag for å skjule en uferdig funksjon.

Autonom læring i produksjon, en komplett historisk kildekatalog, ny generell analyseeditor utover dagens prosjekt- og versjonsfunksjoner og markedsføring som hevder generell overlegenhet over andre AI-produkter legges etter første lansering. Eksisterende avgrensede scenarioer erstatter ikke kommunens formelle budsjettverktøy. Nye integrasjoner, nye filformater og nye funksjonsområder tas ikke inn i denne perioden.

## Beslutninger og åpne produktvalg

| Valg | Status | Ansvar og frist |
| --- | --- | --- |
| Både gratis og betalt versjon | Bekreftet av Simen 26. november. | Inngår i alle relevante konto-, kvote- og betalingstester. |
| Pris, valuta, faktureringsperiode og visning av eventuell merverdiavgift | Åpent. | Simen, før SVEN-L06 ferdigstilles 1. desember. |
| Inkludert kapasitet, periode og funksjons-/modelltilgang for hvert nivå | Åpent. | Simen, med målt kostnadsgrunnlag fra implementeringen, før SVEN-L05 og SVEN-L06 ferdigstilles. |
| Kjøp av ekstra kapasitet, pris, utløp og overføring til ny periode | Åpent. Previewens gratis påfyll er ikke et vedtatt produktvilkår. | Simen, før SVEN-L06 ferdigstilles. |
| Mobilklientens kanoniske kilde, bygg og fullstendige funksjonsinventar | Må bekreftes; klientkilden inngår ikke i det gjennomgåtte endringssettet i PR #90. | SVEN-L01, 27. november. |

Demoens 100 000 tokens og påfyll på 25 % er ikke vedtatte lanseringskvoter. Priser og produktvilkår skal ikke utledes fra disse tallene. Åpne prisvalg stopper ikke arbeid med kontoer, lagring og konfigurerbare kvoter.

## Arbeidsliste

Status 26. november: Steg 1 er startet. Omfanget og oppgavene nedenfor er etablert. Fullstendig låsing av funksjonsinventaret krever SVEN-L01 og avklaringene i SVEN-L02. Implementeringsoppgavene står åpne.

Codex utfører implementering og automatiserte kontroller i aktive arbeidsøkter. Simen avklarer kommersielle vilkår og organiserer faglig vurdering og pilotbruk. Hver ferdig oppgave skal ha dato, kodeversjon og kontrollbevis; en avkryssing alene erstatter ikke beviset. Kundeopplysninger og private testdialoger lagres utenfor det offentlige repoet.

### SVEN-L01 Mobilkilde og lanseringsinventar

**Frist:** 27. november. **Avhengigheter:** Tilgang til mobilklientens kanoniske kilde. **Status:** Åpen.

- [ ] Registrer repo, ref og commit for mobilklienten, og dokumenter bygg og kobling til serveren.
- [ ] Gå gjennom alle skjermer, knapper og funksjonsflagg; avstem inventaret over mot faktisk klient.
- [ ] Registrer aktiverte integrasjoner og miljøavhengigheter uten hemmelige verdier.
- [ ] Bekreft at lanseringsartefakten kan bygges fra registrerte versjoner, uten en udokumentert lokal `dist`-mappe.

### SVEN-L02 Vilkår for gratis og betalt versjon

**Frist:** Før SVEN-L05 og SVEN-L06 ferdigstilles 1. desember. **Avhengigheter:** Simens produktvalg og målt kostnadsgrunnlag. **Status:** Åpen.

- [ ] Registrer pris, faktureringsperiode, valuta og avgiftsvisning.
- [ ] Definer kvoteperiode, inkludert kapasitet, modellvekting og funksjonstilgang per nivå.
- [ ] Avklar om ekstra kapasitet selges ved lansering, og hvilke saldo-/utløpsvilkår som gjelder.
- [ ] Definer virkningen av oppgradering, oppsigelse, mislykket betaling og eventuell refusjon på tilgang og saldo.

### SVEN-L03 Kundekontoer og tilgangsskille

**Frist:** 27. november. **Avhengigheter:** Kan bygges mens SVEN-L01 og SVEN-L02 avklares. **Status:** Åpen.

- [ ] Registrering, innlogging, utlogging og kontogjenoppretting fungerer mot en reell kundetjeneste, adskilt fra administratortilgang.
- [ ] Serveren kontrollerer eierskap til alle samtaler, prosjekter, filer, resultater og jobber, også ved gjenopptak.
- [ ] To kontoer, utlogget bruker og utløpt økt er testet direkte mot API-et; kunnskap om en annen brukers ID gir ikke tilgang.
- [ ] Alle kontotyper får tilgang gjennom samme serverkontroll; klienten kan ikke gi seg selv betalt tilgang.

### SVEN-L04 Varig lagring og sletting

**Frist:** 30. november. **Avhengigheter:** SVEN-L03. **Status:** Åpen.

- [ ] Samtaler, prosjekter, vedlegg, leveranseversjoner og følgevalg lagres med eierskap og hentes på en annen enhet.
- [ ] Utløpt cache og ny utrulling mister ikke lagrede eller pågående kundeoppdrag.
- [ ] Håndtering av lokale preview-data og bytte av domene er besluttet og beskrevet for brukeren.
- [ ] Sletting av innhold og konto er prøvd; kømeldinger kan ikke gjenopprette slettet kundeinnhold.
- [ ] Sikkerhetskopi og gjenoppretting er prøvd med isolerte testdata.

### SVEN-L05 Forbruksregnskap og kvoter

**Frist:** 1. desember. **Avhengigheter:** SVEN-L03; sluttverdier fra SVEN-L02. **Status:** Åpen.

- [ ] Serveren reserverer kapasitet før fakturerbart arbeid og avstemmer mot faktisk modell-, cache-, søke- og visuelt filforbruk.
- [ ] Gratis og betalt kvote, modellvalg, perioder og eventuell tilleggssaldo håndheves på tvers av enheter og samtidige forespørsler.
- [ ] Gjenopptak, avbrudd, avvist svar, ukjent forbruk og mislykket modellkall er avregnet uten skjult nullføring eller dobbel belastning av samme registrerte forbruk.
- [ ] Brukeren får forståelig status ved brukt kvote; oppgradering bruker den eksisterende kontoen og historikken.
- [ ] Kontogrenser og samlet kostnadsgrense er prøvd med samtidige analyser; klientens måler samsvarer med serveren.

### SVEN-L06 Betaling og abonnement

**Frist:** 1. desember. **Avhengigheter:** SVEN-L02, SVEN-L03 og SVEN-L05. **Status:** Åpen.

- [ ] En gratiskonto kan kjøpe abonnement og få riktig tilgang etter en bekreftet hendelse fra betalingsleverandøren.
- [ ] Signaturkontroll og idempotent behandling dekker duplikate, forsinkede og omordnede betalingshendelser.
- [ ] Oppsigelse, fornyelse og betalingsfeil gir riktig tilgang og kapasitetsperiode.
- [ ] Dersom påfyll tilbys, krediteres faktisk kjøpt kapasitet én gang og synkroniseres mellom enheter.
- [ ] Testbetaling og produksjonsoppsett er kontrollert; klientretur fra betaling alene kan ikke aktivere abonnement.

### SVEN-L07 Kø og samtidige modellkall

**Frist:** 2. desember. **Avhengigheter:** Eierskap fra SVEN-L03 ved integrasjon. Kjernelåsen kan rettes uavhengig. **Status:** Åpen.

- [ ] Reserver jobber atomisk på tvers av serverinstanser; en lokal prosesslås og separat cachelesing/-skriving er utilstrekkelig.
- [ ] Gjenta reproduksjonen fra gjennomgangen: To instanser behandler samme jobb samtidig. Før retting startet begge modellkallet; etter retting starter bare én.
- [ ] Gjentatt kølevering, lease-utløp, prosessavbrudd, gjenopptak og allerede fullført jobb er testet med samme jobb-ID.
- [ ] Eventuell gjentakelse etter et uavklart leverandørkall er uttrykkelig håndtert og registrert i forbruksregnskapet.

Grunnlag: [forespørselslageret](../server/sven/preview-requests.mjs) og [køarbeideren](../scripts/sven/queued-preview.mjs).

### SVEN-L08 Komplett mobilflyt og produksjonspakke

**Frist:** 3. desember. **Avhengigheter:** SVEN-L01, SVEN-L03 til SVEN-L07. **Status:** Åpen.

- [ ] Klient, chat-, fil-, følge- og arbeidsruter inngår i en repeterbar utrulling og kan konfigureres for produksjon med kundetilgangskontroll.
- [ ] Hele reisen registrering → spørsmål → kilder → oppfølging → prosjekt → eksport → gjenåpning fungerer med ekte modellkall.
- [ ] Alle synlige funksjoner i inventaret er koblet til reell serverfunksjonalitet; modellvalg og kontotype er konsistente.
- [ ] Tastatur, kildeåpning, venting, nettverksbrudd, bakgrunnsmodus og avbrudd gir forståelig status uten utilsiktet ny innsending.
- [ ] Alle synlige eksportformater og dokumentredigering er prøvd; original og endret versjon kan åpnes i relevant filprogram.

### SVEN-L09 Personvern, drift og tilbakeføring

**Frist:** 3. desember. **Avhengigheter:** SVEN-L03 til SVEN-L08. **Status:** Åpen.

- [ ] Personvern og vilkår dekker kundekonto, samtaler, vedlegg, AI-leverandør, betaling, lagringstid og faktisk sletting.
- [ ] Brukeren forstår hvordan private vedlegg behandles; produksjonslogger unngår privat dialog og filinnhold.
- [ ] Overvåking kontrollerer chat-API, kø, fastlåste jobber, modellfeil og kostnader; redaksjonell GitHub-helse brukes ikke som bevis for chathelse.
- [ ] En ansvarlig kan undersøke en feil via jobb-ID og stoppe nytt fakturerbart arbeid uten å miste lagrede resultater.
- [ ] Tilbakeføring av den samlede klient- og serverleveransen er prøvd med kontroll av lagrede data og kvoter.

### SVEN-L10 Lanseringskandidat og kvalitetskontroll

**Frist:** 4. desember. **Avhengigheter:** SVEN-L08 og SVEN-L09. **Status:** Åpen.

- [ ] Backend-, frontend-, bygg- og relevante ende-til-ende-kontroller består på registrert kodeversjon.
- [ ] Gratis og betalt brukerreise er prøvd i Safari på iPhone og Chrome på Android, med enhet og nettleserversjon registrert.
- [ ] Tastatur, fokus, skjermleserens viktigste kontroller, redusert bevegelse og smal mobilbredde er kontrollert.
- [ ] Faktiske Sven-svar fra et på forhånd fastsatt spørsmålssett er fagvurdert mot originalkilder. Bruk eksisterende utviklingssaker og pilotens kommuneoppgaver; dokumenter utvalg og modell.
- [ ] Det er ingen åpne kritiske tall-/kildefeil, datalekkasjer eller feil i tilgang/belastning. Datagap og manglende verdier behandles korrekt.
- [ ] Faktisk svartid, feilrate og leverandørkostnad er registrert, også for avbrutte oppdrag og begge modellvalg dersom begge tilbys.

Det eksisterende [utviklingssettet](../evaluation/sven/README.md) er ikke et uavhengig grunnlag for generelle konkurransepåstander. Bruk eksisterende [nettlesertest](../web/browser-tests/startup-intro.mjs) som kontroll av forsiden; den erstatter ikke tester av Sven-flyten.

### SVEN-L11 Pilot og retting

**Frist:** 8. desember. **Avhengigheter:** SVEN-L10. **Status:** Åpen.

- [ ] Noen få brukere prøver den registrerte lanseringskandidaten uten løpende veiledning; Simen organiserer deltakelsen.
- [ ] Pilotoppgaven gjennomføres: Finn relevante kommunale kostnadsavvik, etterprøv sammenligningen, undersøk forklaringer, formuler spørsmål til administrasjonen og lagre eller eksporter resultatet.
- [ ] Prøv også en gratiskonto som når kvoten og oppgraderer uten å miste historikk eller starte analysen dobbelt.
- [ ] Registrer fullføring, misforståelser og feil. Rett alvorlige feil og kontroller berørte flyter på nytt.

### SVEN-L12 Endelig kontroll før merge

**Frist:** 9. desember. **Avhengigheter:** SVEN-L01 til SVEN-L11. **Status:** Åpen.

- [ ] Alle påkrevde oppgaver har kontrollbevis for versjonen som skal lanseres; ingen alvorlige feil er åpne.
- [ ] Produktvilkårene er fastsatt, og gratis og betalt funksjonalitet stemmer med dem.
- [ ] Utrullingsartefakt, konfigurasjon og klient-/serverversjoner er registrert; tilbakeføring og overvåking er klare.
- [ ] Lanseringsbeslutningen er registrert før PR-en gjøres klar og merges. Kalenderdato og grønn CI alene er ikke ferdigkriterier.

### SVEN-L13 Lansering og produksjonskontroll

**Frist:** 10. desember. **Avhengigheter:** SVEN-L12. **Status:** Åpen.

- [ ] Merge og publiser versjonen som besto SVEN-L12.
- [ ] Kontroller offentlig side, registrering, innlogging, chat, kilder, lagring og eksport på produksjonsdomenet.
- [ ] Kontroller gratisgrenser, betalingsoppsett og abonnementstilgang med avklart testmetode.
- [ ] Følg feil, kø, ventetider og kostnader gjennom lanseringsdagen; registrer og håndter avvik.

## Kontrollbevis

Fyll inn dato, eksakt kodeversjon, metode/enhet, resultat og lenke eller privat referanse før en oppgave lukkes. Ved nye kodeendringer skal relevante berørte kontroller gjentas. Dokumentendringer alene krever kontroll av tekst, oppgavereferanser og lenker.

| Oppgave | Dato og kodeversjon | Kontroll og resultat | Bevis |
| --- | --- | --- | --- |
| Ingen implementeringsoppgaver lukket | — | Lanseringsarbeidslisten ble opprettet 26. november 2026. | — |
