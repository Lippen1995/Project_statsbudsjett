# Neste fase: R1D – kildeanskaffelse og rekonstruksjonsvalidering

Forslag, ikke masseproduksjonsbeslutning. Ingen endring av renderer, snapshots,
lagrede scenarier eller produksjon er implementert av dette dokumentet.

## 1. Avklar en faktisk leveranse

Prioriter eksisterende terrestrisk oppmåling, for eksempel PAST/Bredsgården,
eller en tilsvarende dokumentert Skur-leveranse. Anskaffelse betyr her å undersøke
en rettighetsklarert leveranse, ikke å kjøpe noe eller hente ut en viewer.
Be om følgende før en fil godtas:

- Originalmodell/punktsky, rå/kalibrerte bilder der dette kan leveres, format,
  enheter, CRS, vertikalt datum, opptaksdato og måle-/registreringskvalitet.
- Presist bygningsomfang og hvilke sider/takdetaljer som er skjulte eller forenklede.
- Rettighet til kommersiell bruk i både LIVE og spill, bearbeiding, retopologi,
  teksturbaking, LOD/komprimering, nettlevering av hentbare GLB-/teksturfiler,
  kilde-/lisensmetadata og eventuelle delingskrav.
- Hvem som kan gi disse rettighetene, om underleverandør-/bilde-/databaserettigheter
  følger med, og om pris, varighet eller andre begrensninger gjelder.

En henvendelse er ikke sendt; dette er et ferdig leveransesjekkskjema. Ikke utvid
oppgaven til eksterne bestillinger, kontakt eller betalte tjenester uten mandat.
Hvis klarering ikke lykkes, behold dagens modeller og prøv åpent bildemateriale
med verifisert dekning. Ikke start manuell oppskalering for å skjule kildegapet.

**Gate:** én konkret, lovlig og faktisk tilgjengelig pilotleveranse eller fotoserie.
Publikumstilgang, et tomt copyright-felt eller et generelt CC-merke på en nettside
er ikke tilstrekkelig.

## 2. Valider grunnlaget på to ulike bygg

Bruk Skur 11 som enkel lagerbygning og ett særpreget Bryggen-bygg med dokumenterte
vinduer, tak og sider. Velg det andre først etter kildeavklaringen; ikke legg til
udokumenterte åpninger i Skur for å teste en vindusgenerator.

- Kontroller takavgrensning mot veggliv og eventuelle takoverheng; OSM er ikke
  automatisk et eksakt roofprint. Skill ut målte og avledede koordinater.
- Bruk en separat klassifisert LAS/LAZ-crop og kontroller faktisk lokal tetthet,
  klasse 2/6, hull og uteliggere før PDAL/roofer. Ikke gi et DOM-raster falske
  LAS-klasser. Registrer ny kildehash/epoke uten å overskrive historiske snapshots.
- For foto: prioriter en sammenhengende serie med samme omtrentlige epoke/lys,
  flervinkeldekning og uavhengige mål-/kontrollpunkter. En foreslått opptaksramme
  på 30–120 bilder er en **arbeidshypotese**, ikke et krav som garanterer suksess.
  Ingen fotografering, droneflyging eller lovlig tilgang på privat område er gitt her.
- Hold noen mål/bilder utenfor tilpassingen. Kontroller silhuett, port-/vindusposisjon,
  gesims/møne og grunnkontakt mot uavhengige data. Lav intern reprojeksjonsfeil
  skal ikke brukes som eneste bevis for metrisk nøyaktighet.

**Gate:** rapporter målbar feil mot kontrollpunkter, samt hva som ikke kan måles.
Foreslåtte pilotmål er ≤0,25 m horisontal registrering og ≤0,20 m tak-/hovedprofilfeil
mot egnet uavhengig kontrollgrunnlag. Dette er foreslåtte prosjektgrenser, ikke
presisjonskrav fra eller påstander om eksisterende kilder. Manglende kontrollgrunnlag
gir «uverifisert», ikke et bestått stempel. Fasadedetaljer får egne toleranser først
når faktisk oppløsning/kalibrering er kjent.

## 3. Gjennomfør den riktige algoritmesammenligningen

1. Kjør den klarerte modellen direkte som referanse hvis kvaliteten tillater det.
2. Kjør roofer på den faktisk egnede roofprint-/LAS-cropen og sammenlign med dagens
   begrensede gable-fit. Behold enkle, bedre underbygde tak der ny metode feiler.
3. Kjør COLMAP og tett OpenMVS, eventuelt Meshroom på egnet GPU. Mål registrerte
   bilder, spordekning på selve bygget, kontrollpunktsfeil, hull, maskin-/arbeidstid
   og behov for retting. Ikke forveksle bakgrunnsmatcher med Skur-geometri.
4. Bruk begrensede source-baserte komponenter for tydelig dokumenterte hull.
   Ukjente flater forblir skjematiske; ingen oppdiktet AI-fasade godkjennes.

**Gate:** samme fem arkitektoniske kriterier som R1C, nå med bedre uavhengig grunnlag:
silhuett, proporsjoner, fasadedybde, flervinkelkonsistens og materialtroverdighet.
Enkelte deler kan være godkjent uten at hele bygget kalles survey-verifisert.

## 4. Integrer optimalisert levering som egen, reversibel endring

Dagens loader krever 14 mesh-noder, uindekserte buffere, et bestemt atlas og ingen
required extensions. Den vil med rette avvise vårt indeks-/Meshopt-eksperiment.
Det må ikke omgås ved å fjerne validering.

- Lag en eksplisitt render-manifest-revisjon med bygnings-ID, LOD, kilder, lisens,
  master-/output-hash, transform, finitte koordinat-/vertex-/bytegrenser og feilbudsjett.
  Hold dette uavhengig av game-save v1–6 og snapshot-formatene.
- Tillat kun gjennomgåtte extensions, eksempelvis `EXT_meshopt_compression` og
  `KHR_mesh_quantization`, med versjonert dekoder og kilde-/ressursgrenser før decode.
- Behold kilde-ID på noder/ranges også når indekser/trekanter endrer rekkefølge.
  Ikke dedupliser på tvers av objekter slik at kildeplukking blir tvetydig.
- Batch per flis/materialgruppe, ikke per React-bygg. Behold medium/høy LOD,
  etterspørselsrendering, kansellering og eksplisitt dispose/fallback ved feil.
- Hold pilotens eksisterende 8-renderkall-/292 500-trekantbudsjett og null idle
  frames inntil en eventuell budsjettendring begrunnes eksplisitt med faktiske målinger.
- Mål 2 mm komprimeringsgrense mot master separat fra geodataenes reelle nøyaktighet.
  Vurder KTX2 først på aktuelle teksturer: mål skilt-/fasadelesbarhet, transkodering,
  decoded/native minne og støttede mobilformater. Ingen slik gevinst er bevist her.

## 5. Godkjenn på faktiske enheter og registrer kostnad

Bruk [R1C-prosedyren](../r1c-evidence/physical-device-procedure.md), samme kameraer,
kvalitet/DPR, versjoner og cache-/nettverksbetingelser. Test minst en faktisk desktop
og en fysisk iPhone/Safari eller Android-enhet. Mål oppstart, median/P95,
interaksjon, minne/retensjon, LOD-overgang og touch-plukking. Ingen authentication-
bypass, offentlig diagnostikk eller telemetri er nødvendig eller tillatt her.

Registrer faktiske minutter per godkjent bygg: kildeinnhenting, registrering,
automatisk beregning, gjennomgang og retting, samt avvisningsandel og byte/minne.
Først da kan vi anslå arbeid og kostnad for 10 eller 100 bygg. Ikke omregn en rask
modell av feil arkitektur til en «byproduksjonsrate».

**Sluttgate før oppskalering:** to gjenkjennelige, kildeklarerte bygg med måle-/bilde-
og enhetsaksept, alle regresjoner bestått, samt en begrunnet produksjonsrate. Brukeren
kan da vurdere tilnærmingen i henhold til den eksisterende roadmap-gaten. Et nytt
offentlig LIVE-nettsted eller byomfattende produksjon inngår ikke i denne fasen.
