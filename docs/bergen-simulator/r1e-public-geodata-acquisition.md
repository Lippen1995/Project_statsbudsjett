# R1E — norske offentlige geodata: anskaffelse og integrasjon

Undersøkt 21. oktober 2026. Utgangspunkt `c87db8bfe73e4e73a49bc0160a91116615274893` på `feature/bergen-simulator` (siste runtime-endring var R1C `358b3e0`). R1B/R1C, rekonstruksjonsstudien og missing-buildings-studien er beholdt. Ingen egen R1D-fil finnes på grenen; den siste missing-buildings-studien er relevant forarbeid. Brukerens R1E-oppdrag godkjenner den avgrensede implementasjonen selv om eldre veikart omtaler dokumentfasen som sperret for runtime-endringer.

## Faktisk levert

- Nye **native 25 cm DOM- og DTM-prøver** fra Bergen 10pkt 2022, prosjekt 6266. Begge er 752 × 1008 celler, 188 × 252 m, i EPSG:25832 og NN2000. Dette er en ny, finere romlig prøve av samme opptak som tidligere 50 cm-studie, ikke en ny uavhengig lasersurvey.
- Et **valgfritt, reversibelt taklag** for seks eksisterende OSM-bygg som før bare var fotavtrykk. Native overflatehøyder gir saltakhypoteser og volum. Ingen takvinduer, dører eller fasadematerialer er funnet på. Fargene er kunstnerisk, skjematisk presentasjon.
- Ny 2026-DOM fra separat flybildematching, brukt til kontroll, ikke automatisk erstatning. 2026-DTM-responsen er en tom nullflate og avvises. To av seks tak passerer samme enkle taktest i det nyere opptaket; fire har større overflateavvik og krever nærmere kontroll. Ingen av de seks merkes som en fullt verifisert nåtidsmodell.
- **93 kildeidentifiserte NVDB-seksjoner** i en avgrenset offentlig V4-prøve, inkludert veg, fortau, gangfelt, trapper og gang-/sykkelveger. De er kontrollert som 3D-linjer og holdes utenfor spillets nåværende transportnett. Dette er et nytt offline sammenligningsgrunnlag, ikke 93 ferdig validerte rutelenker.
- Norge i bilder: faktisk metadatauttrekk for **37 prosjekter** ved Bryggen, med opptaksdato, eier og oppløsning. Ingen rettighetsbegrensede bildepiksler er kopiert.
- En lovlig tilgjengelig, uendret **historisk UiB-fotoreferanse** av Bredsgården, Atelier KK 1918–1922. Den brukes som datert dokumentasjon, ikke som bevis for dagens fasade.
- [Maskinlesbart kilderegister](r1e-source-inventory.json): 35 produkter/kildegrupper, med konkrete endepunkter, rettigheter, statuser, alternativruter og neste handling. [Forsøkslogg](r1e-evidence/access-attempts.json) viser også feil og manglende leveranser.

## Hva datainnhentingen faktisk avklarte

| Kilde | Funn og konsekvens |
| --- | --- |
| Høydedata | Tidligere HTTP 503 var en tjenestefeil, ikke dokumentert datamangel. Offentlig rastereksport virker nå og er brukt. Originale LAZ-filer er fortsatt ikke levert: fil-listing krever autentisering og klippelevering krever ekte e-post. Også forhåndsleveranser, katalog, dokumentert REST og visningsmetadata ble undersøkt. |
| Nyere høyder | Bergen 2023 har nå prosjekt-ID 6282 i prosjektmetadata, mens Geonorge-lenken peker på 6091. Regionalt rektangel er ikke bevis for lokale native fliser. Bergen 2024 dekker sørligere område. Bilde Bergen Vest 2026 er faktisk hentet som rasterkontroll; null-DTM viser hvorfor HTTP 200 ikke er en kvalitetsgodkjenning. |
| Bergen havn mobil 2022 | Eget prosjekt 5895 finnes og dekker havneområdet. Dette er en særlig interessant kilde til kaier og fasader, men originalpunkter, synlige flater, nøyaktighet og viderebruk må avklares i en konkret levering. |
| FKB | Kommunens `Bygning_Flate` er et tilgjengelig polygonlag uten Z, ikke en ferdig 3D-takmodell. ItemInfo sier uttrykkelig «Norge digitalt begrenset», i motstrid til generell tekst om åpne FKB-data. Ingen FKB-geometri er kopiert eller publisert. |
| Kommunal 3D | Faktiske `3DObject`/multipatch-tjenester finnes, blant annet Dokken 2022. Det er mer enn et kartbilde, men tom lisensinformasjon gir ikke rett til å hente modellbuffere og hoste GLB. Ingen slike buffere er hentet. Sandsli-BIM har eksplisitt tillatelseskrav. |
| Ortofoto | Bergen nord 2023 har 8 cm RGB-bilder fra 3. juni 2023; Bergen IR 2022 er ikke en vanlig fargetekstur. Nåværende WMS krever token, og produktmetadata sier Norge digitalt begrenset. Kommunal bildekatalog og offisiell eksport-API ble også undersøkt. |
| Matrikkelen | Åpne felt er CC BY 4.0. En regional prøve og seks mindre byggebokser fikk HTTP 504. Format/projeksjon/område og klippetilbud i den alternative Geonorge-leveringen er funnet; dokumentasjonen krever reell e-post ved polygonklipping. Ingen falsk e-post eller bestilling er sendt. |
| NVDB | V3-feilen var avvikling/klientkrav, ikke en lukket database. V4 krever dokumentert `X-Client`. `kartutsnitt` må angis i UTM33 selv om resultatet bestilles i UTM32/NN2000. Korrigert offentlig uttrekk gav 93 gyldige seksjoner; neste side var tom. |
| Kulturminner | Åpent lokalitetsprodukt er dokumentert, men WFS 2.0 og 1.1 ga tidsavbrudd. Produktet Freda bygninger har motstridende lisens-/tillatelsesvilkår i samme metadata og er ikke viderepublisert. PAST dokumenterer faktisk Bredsgården-skanning, men ikke fri kildelevering. |
| UiB/NIBIO/BIM | UiB-bildet har konkrete frie bruksvilkår med kreditering. NIBIO har åpne produkter, men FKB-AR5 er et unntak; landdekke gir ikke tak-/fasadedetalj. Kommunale BIM-krav og fysisk bymodell-anskaffelse er spor til mulige kilder, ikke automatisk tilgjengelige modellfiler. |

Se [tilgang og lisenser](r1e-license-and-access-register.md) og [ferdige forespørsler](r1e-data-requests.md). Ingen penger, kontoer, bestillinger eller eksterne meldinger er brukt.

## Representativ bygningstest og kvalitetssperrer

Området omfatter 72 eksisterende fotavtrykk med full rasterdekning: 15 OSM-høyder, 23 etasjebaserte estimater og 34 uten høyde. Alle får et offline overflateestimat; dette er ikke et bekreftet antall nye høydeobservasjoner uavhengig av den tidligere 50 cm-prøven.

| Måling | Resultat |
| --- | ---: |
| Vurderte eksisterende bygninger | 72 |
| Uten høyde, med nye 25 cm overflatekvantiler til kontroll | 34 |
| Saltakhypoteser som passerer form-/residualtest | 17 |
| Integrert som nye, valgfrie render-volum | **6** |
| Øvrige uten akseptert takform | 54 høyde-only + 1 terreng/tak-konflikt |
| Bedre eller endrede fotavtrykk | **0** |
| Nye faktiske bygninger opptatt i byen | **0** |
| Nye konflikter flagget | 1 tak/terreng-konflikt; 4/6 nyere DOM-tak passerer ikke samme modelltest |
| Øvrige 66 bygninger uten aktiv renderendring | 66 |

`height-only` betyr overflatekvantiler, ikke godkjent bygningshøyde. Komplekse tak presses ikke gjennom en saltakmodell. Én konflikt, `way/292242384`, beholdes som original. Tidligere uavklarte missing-building-kandidater er fortsatt i karantene. Microsoft/Overture som deler inngangsdata er ikke uavhengige bekreftelser.

Seks kilde-ID-er: `way/331274546`, `way/331274548`, `way/331274573`, `way/331274580`, `way/331274594`, `way/331274542`. Navn eller dagens virksomheter er ikke oppfunnet. De ligger bak den eksisterende detaljerte sjøfasaden, slik at den største forbedringen ses ovenfra og inne mellom bygningene.

### Reproduserbar modell

1. Kontroller SHA-256 for originalt kart, prosjektmetadata og begge GeoTIFF-er. Krev identisk native rutenett, EPSG:25832, NN2000, prosjekt-ID og faktisk dekning. Avvis NaN, ugyldige verdier og tom/null terrengrespons.
2. Bruk eksisterende OSM-ring uendret. Transformer lokal x/øst og z/sør via original WGS84-origo til UTM32; ingen snapping til en ny database.
3. Trekk inn 0,75 m fra bygningskant for å dempe vegg-/naboblanding. Krev minst 80 rasterceller og minst 40 celler i både trening og holdout.
4. Sammenlign robust plan med `h(u,v) = b0 + b1*u + b2*abs(v)` (meter NN2000). `u/v` kommer fra originalfotavtrykkets orienterte rektangel. Takformen er **utledet**, ikke direkte oppmålt. 1 m sjakkbrettblokker deler trening/holdout; det er fortsatt samme opptak.
5. Krev rektangulær fyllgrad ≥0,85; helning 10–65°; holdout-RMSE ≤0,65 m; minst 85 % innen 0,65 m; minst 30 % lavere RMSE enn planmodellen. Avvis motsigende OSM-takform og tak under opprinnelig terrengkontakt +2 m.
6. Behold alle kjente høyder og de syv R1B/R1C-byggene. Kun seks ukjente høyder passerer både taktest og forrangsregler. Ingen ukjent fasadedetalj genereres.
7. Del kildepolygon ved utledet møne; trianguler innen eksakt ring. Vegger følger eksisterende grunnkontakt, ikke en omskrevet terrengflate. JSON/GLB inneholder kilde-ID, inngangshasher, sannhetsklasse, residualer og skjematisk fasadestatus.

Tersklene er konservative **pilotvalg**, ikke kartleggingsstandard eller dokumentert målenøyaktighet. Uavhengig tak-/fasadeoppmåling mangler. Den nyere bildematchede 2026-DOM-en er en annen opptaksmetode, men overflateendring kan skyldes både faktisk endring, matchingsfeil og okklusjon. Den beviser ikke at fire bygninger har blitt ombygd.

## Runtime-grense og kompatibilitet

`src/enhancements/` har versjonert render-katalog og integritetskontrollert, selvhostet GLB. `Kartverket roof pilot (2022)` står **av som standard**, huskes ikke i scenarioformatet og er tydelig merket som utledede estimater. Et eget NOTICE følger eksporten. Inspektøren viser opprinnelig ukjent høyde separat fra den estimerte render-konvolutten.

Laget streamer kun nær Bryggen i Balanced-kvalitet og når bygglaget er synlig. Lasting har 15 sekunders frist, avbrudd/stale-resultat-vakt, SHA-kontroll, strenge GLB-ressursgrenser og automatisk originalfallback. Utfasing, lav effekt, skjuling eller nettfeil frigjør egne ressurser. Én samlet mesh, ingen React-komponent per bygg, ingen nye teksturer eller løpende animasjon.

Originalgeometri eies fortsatt av eksisterende geometry-worker. Bare indeksvisningen filtreres; kildeattributter og plukkreferanser deles. Render-laget endrer **ikke** geografiske kollisjonstester, trafikk, økonomi, lagrede planer eller scenarioversjon. R1B/R1C har uendret forrang og uendrede råfiler. Dette er en bevisst begrensning: den visuelle konvolutten er ikke ny autoritativ byggehøyde for spillmotoren.

## Reproduksjon og målinger

Det finnes ingen nye runtime-tjenester, nøkler eller avhengigheter. Geobehandling er offline; nettleseren trenger bare egenhostet GLB på **15 160 byte**, 162 trekanter før gamle flater trekkes fra, 0 teksturer. Netto 128 ekstra synlige trekanter ved fast vannkantkamera; 7 → 8 draw calls, inkludert eksisterende arkitekturlag. Faktisk buffer- og latensmåling: [evidens](r1e-evidence/README.md). Forhåndsbudsjettet ble skrevet før integrasjon og er beholdt.

Utviklerkommandoer fra `apps/bergen-simulator` (allerede utført her, ikke en oppgave til mobilbrukeren):

```sh
python scripts/acquire-r1e.py --verify-only
python scripts/r1e_geodata.py
python tests/public_geodata.py
python scripts/r1e_compare.py
npm run lint
npm test
npm run check:isolation
npm run build
node tests/public-geodata-browser.mjs http://127.0.0.1:4180 after
```

GIS-miljøet trenger numpy, rasterio, pyproj og shapely med constrained triangulation; konkrete målte versjoner og kommandoer er i evidensen. `r1e_source_audit.py --name niib-projects.json` viser en låst offentlig metadataforespørsel; kun eksplisitt `--acquire` gjentar den til en ny ignorert artefaktmappe. Den gjør ingen eksportbestillinger eller innlogging. Nettbasert innhenting kjøres ikke av bygg eller ved vanlig bruk.

## Neste kildeprioritering

1. Skaff liten, klassifisert original LAZ-prøve av prosjekt 6266 og mobilprosjekt 5895 gjennom en godkjent reell leveringsadresse. Kjør PDAL-punktklassifisering og roofer mot samme OSM-utvalg; kontroller punkter mot egne terreng-/takflater. **Ikke kjørt i R1E**, siden originalpunkter ikke ble levert.
2. Be Bergen kommune om eksisterende **Bryggen/Vågen 3D-kilde**, taklinjer og rett til selvhostet transformert GLB. Dokken-tjenestene viser at modellenes leveransemiljø finnes, ikke at detaljert Bryggen-modell er lisensiert.
3. Avklar 8 cm RGB-ortofoto til kontroll og takteksturer; be separat om skråfoto/fasadebilder og rettigheter. Bruk datert UiB/Commons-materiale konservativt.
4. Utvid Matrikkelen-kontrollen etter at offentlig WFS fungerer eller polygonlevering er godkjent. Ingen registerpunktmodell som erstatning for et fotavtrykk.
5. Bare etter disse prøvene: separat gjennomgått kildeversjon for bedre fotavtrykk og et nytt sett bygg. R1E starter ingen masseproduksjon eller landsdekkende GIS-migrering.

Produksjonsgrensen er uendret: ingen endring av main, eksisterende workflows, produksjonsfiler, geografiske snapshots, databaser, domener eller autentisering. Utgivelse skjer kun gjennom den etablerte beskyttede Bergen-pipelinen etter kontrollene.
