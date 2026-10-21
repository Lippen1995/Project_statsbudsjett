# R1E — ferdige norske forespørsler

**Utkast, ikke sendt.** Ingen konto, kontaktmelding, klippeordre eller kjøp er opprettet. Brukeren trenger ikke hente filer eller kjøre programvare. Før utsendelse trengs samtykke til kontakt og en faktisk avsender-/leveringsadresse. Pris eller avtale aksepteres bare etter separat godkjenning.

Felles geografisk prøve: ETRS89 UTM32 (EPSG:25832), rektangel **E297372–297560, N6701150–6701402**, 188 × 252 m (47 376 m²), Bryggen/Vågen. Høyder ønskes i NN2000 (EPSG:5941). Om en kilde krever andre koordinater, må transformasjonen følge leveransens dokumenterte CRS.

## R1E-01 — rå laser og mobilskanning

Mottaker: Kartverkets kundesenter / Høydedata, [offisiell kontakt](https://www.kartverket.no/om-kartverket/kontakt-oss), kundesenter@kartverket.no (og videresending til prosjekt-/dataeier ved behov).

Emne: Liten klassifisert LAZ-prøve fra Bergen 10pkt 2022 og Bergen havn mobil 2022

Hei,

Vi utvikler Bergen Reimagined, en nettbasert 3D-visning av faktisk Bergen med en separat, tydelig hypotetisk spilldel. Vi ønsker å teste en liten, kildeetterprøvbar rekonstruksjon rundt Bryggen før større datainnhenting.

Kan dere tilby original klassifisert LAS/LAZ innen felles rektangel ovenfor, gjerne med inntil 5 m kontrollbuffer, fra prosjekt **6266 Bergen 10pkt 2022** og **5895 Bergen havn mobil 2022**? Mobilskanningen er særlig interessant for kaier og bygningsfasader. Dersom Bergen 10pkt 2023 er bedre, ber vi om faktisk lokal dekning: dagens prosjektmetadata oppgir **6282**, mens kataloglenken viser **6091**.

Vi har allerede hentet offentlig 25 cm DOM/DTM fra 6266. Den dokumenterte originalfil-listen returnerer 401; forhåndsleveransene vi fant gjelder nasjonale rasterprodukter. Vi ønsker en ordinær, tillatt kildelevering eller offisiell direkte nedlastingsadresse, ikke uttrekk fra punktskyvisningens cache.

Leveransen bør bevare original prosjekt-/flisidentitet, måledato, klassifisering, punktformat, eventuelle return-/intensity-felt, koordinatsystem og NN2000, nøyaktighets-/dekningsrapport samt vilkår for kommersiell bruk, transformasjon og selvhosting av avledede GLB-modeller. Opplys gjerne om en gratis utviklings-/evalueringsprøve er mulig og hvilke krediteringer som kreves.

Vi har også hentet en 2026-DOM-kontroll fra prosjekt **6621 Bilde Bergen Vest 2026**. DTM-eksporten for samme rektangel gir en TIFF med bare nullverdier, uten NoData-flagg. Har dette prosjektet en reell DTM-leveranse, og hva er faktisk fotodato? Feltet 2026-01-01 er ikke behandlet som kjent opptaksdag.

Ingen betalingsbestilling gjøres med denne forespørselen. Opplys eventuelle kostnader og avtalevilkår før leveranse som krever betaling.

Vennlig hilsen
Bergen Reimagined

## R1E-02 — FKB og bygningshøyder

Mottaker: Bergen kommune, Plan- og bygningsetaten / geodata, via [kommunens offisielle kontaktkanal](https://bestill.bergen.kommune.no/cms/kontaktoss), eventuelt postmottak@bergen.kommune.no for intern videresending.

Emne: Rettighetsavklart FKB-A/B-prøve med takgeometri ved Bryggen

Hei,

For Bergen Reimagined ønsker vi en liten prøve innen rektangelet ovenfor av **FKB-Bygning**, helst FKB-A/B med fasadeliv/bygningsomriss, takkant, mønelinje, gesims-/taksprang, Z-koordinater og nødvendige kilde-ID-er, datoer og kvalitetsattributter. Vi trenger ingen eier-, bolig- eller personopplysninger.

`Basis_kartdata/Bygning_Flate/FeatureServer/0` er et offentlig flateprodukt uten Z. ItemInfo sier «Norge digitalt begrenset», mens den generelle beskrivelsen også omtaler åpne FKB-data. Kan dere avklare hvilke konkrete lag og leveranser vi lovlig kan bruke i en potensielt kommersiell nettapplikasjon, transformere og hoste som 3D-geometri, med påkrevd kreditering? Vi har ikke kopiert feature-geometrien fra tjenesten.

Vi ønsker også forklaring av `Bygningshoyde/MapServer/0`, særlig `KOORDH`, punktenes Z, høydefeltets betydning, opptaksår, vertikalt datum og samme viderebruksrettigheter.

Kan dere levere en liten gratis prøve som GML/SOSI/GeoPackage eller tilsvarende med dokumentert EPSG:25832/NN2000? Hvis lisens/kjøp eller særskilt avtale kreves, ber vi om vilkår og eventuell pris uten å bestille eller godta betaling.

Vennlig hilsen
Bergen Reimagined

## R1E-03 — eksisterende digital bymodell og BIM

Mottaker: Samme kommunale kanal, til geodata/Plan- og bygningsetaten samt ansvarlig for Bymiljøetatens fysiske bymodell og Eiendoms-/utbyggingsfunksjonens BIM ved behov.

Emne: Eksisterende 3D-kildemodell av Bryggen/Vågen — liten prøve og viderebruksrett

Hei,

Før vi rekonstruerer flere bygninger manuelt, ønsker vi å bruke eksisterende oppmålt 3D-geometri dersom rettigheter og kvalitet tillater det.

Vi har funnet faktiske kommunale/tilknyttede SceneServer-modeller, blant annet **Dokken arealstrategi 3Dbygg 2022**, ArcGIS-item **3186ee3ed2a047f0a16d5b618a99db1a**, samt Årstad- og Alrek-modeller. Vi kjenner også til anskaffelsen av fysisk 3D-bymodell av sentrale Bergen (EØS 013-2020). Dette er ikke tolket som tillatelse til å trekke ut modeller fra visningsklienter.

Finnes en digital kilde som dekker Bryggen/Vågen, eventuelt Skur 11 og den dokumenterte sjøhusrekken? Vi ønsker faktisk kildefil som CityGML, CityJSON, IFC, OBJ, glTF/GLB eller annen eksport, original objektidentitet, målestokk/CRS/høydedatum, opprinnelig datakilde, oppmålingsdato, LOD/nøyaktighet og avgrensning mellom eksisterende og planlagt bebyggelse.

Kan en liten prøve innen felles rektangel leveres med uttrykkelig rett til kommersiell bruk, forenkling/LOD, transformasjon og selvhosting av avledet 3D-geometri/teksturer? Opplys hvem som eier kilde- og modellrettigheter dersom andre leverandører må godkjenne. Vi aksepterer ikke abonnement eller betalingsvilkår med denne forespørselen.

Vennlig hilsen
Bergen Reimagined

## R1E-04 — ortofoto og eventuelle skråbilder

Mottaker: Kartverkets kundesenter / Norge i bilder, med videresending til Grunnkart Bergen og bildeier ved behov.

Emne: Liten rettighetsavklart 8 cm bildeprøve ved Bryggen

Hei,

Det offentlige metadata-API-et oppgir blant annet **prosjekt 4222 Bergen nord 2023**, fotodato **3. juni 2023**, 0,08 m piksler, eier **Grunnkart Bergen** og publisering **13. juni 2024**. Vi ønsker et lite RGB-ortofotouttrekk av felles rektangel til takkontroll og mulige avledede takteksturer. Vi ønsker ikke IR-bilder som erstatning for vanlig fargefoto.

Kan dere avklare lisens og tilgang for kommersiell bruk, bearbeiding, selvhostede teksturer og kreditering? Geonorge oppgir Norge digitalt begrenset og dagens WMS krever token. Vi har derfor bare hentet metadata, ingen bildepiksler eller tile-cache.

Finnes også lovlig tilgjengelige skråbilder eller kalibrerte fasadereferanser av bygningene, med tilstrekkelig overlapp og rett til rekonstruksjon? Et ortofoto alene er ikke grunnlag for å fastslå vinduer og fasadedybde.

En gratis utviklingsprøve foretrekkes. Opplys eventuelle kostnader/avtaler før noe bestilles.

Vennlig hilsen
Bergen Reimagined

## R1E-05 — kulturminnedata og dokumentert Bredsgården-survey

Mottaker: [Riksantikvarens offisielle kontakt](https://riksantikvaren.no/kontakt-oss/), eventuelt relevante offentlige kulturmiljø-/prosjekteiere og PAST gjennom deres publiserte kontaktkanal. Mottakere verifiseres før en eventuell autorisert utsendelse.

Emne: Kildelevering og rettigheter for Bryggen-survey / avklaring av Freda bygninger

Hei,

Vi ønsker en liten kildeetterprøvbar 3D-prøve av Bryggen. PASTs dokumentasjon av **Bredsgården 1A (2020)** beskriver terrestrisk laserskanning og fotogrammetri. Finnes en original punktsky, mesh, målsatte tak-/fasadetegninger eller fotografier med rettigheter som tillater rekonstruksjon og kommersiell selvhosting av avledede 3D-modeller? Vi trenger ikke interiører, eieropplysninger, sensitive kulturminneregistre eller andre unntatte data.

Vi ber også om lisensavklaring for **Kulturminner — Freda bygninger**, metadata-UUID **a4bfd879-120f-490e-9907-68ba870664b1**: posten viser NLOD, men inneholder samtidig en bestemmelse om skriftlig tillatelse ved kommersiell eller ikke-kommersiell videreformidling. Hvilke aktuelle vilkår gjelder for de offentlige feltene og en kildeangitt 3D-applikasjon?

Vi har ikke hentet visningsmodeller eller viderepublisert dette datasettet. Opplys kilde-ID, dato, koordinatsystem/høydedatum, dokumentert nøyaktighet, tillatte endringer og attribusjon for en eventuell prøve. Ingen betaling bestilles.

Vennlig hilsen
Bergen Reimagined

## Åpen Matrikkelen-levering, dersom WFS fortsatt er utilgjengelig

Dette er ikke en søknad om lukkede data. Produktet **Matrikkelen — Bygningspunkt**, UUID `24d7e9d1-87f6-45a0-b38e-3447f8d7f9a1`, er CC BY 4.0. Geonorges capabilities viser polygonvalg og aktuelle GML/FGDB-formater i UTM32. [Den dokumenterte bestillingsflyten](https://nedlasting.geonorge.no/help/documentation) krever reell e-post ved polygonklipping, selv om capability-feltet `deliveryNotificationByEmail` er false for vanlige ferdigfiler.

Ved godkjenning kan agenten bestille nøyaktig felles rektangel som UTM32 GML, kun beholde representasjonspunkt, bygningsnummer, type, status, stedfestingsverifisering og oppdateringsdato, og kontrollere faktiske antall medlemmer i stedet for å stole på WFS `numberReturned`. Ingen slike jobber er sendt i denne iterasjonen. Et senere fungerende anonymt WFS-oppslag krever ikke e-post eller ny konto.
