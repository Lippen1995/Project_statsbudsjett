# R1E — lisens- og tilgangsregister

Kontrollert 21. oktober 2026. Det komplette produktregisteret er [JSON](r1e-source-inventory.json). En offentlig tjeneste og en lovlig viderepublisering er to separate spørsmål. Ingen lisens gis ved å få HTTP 200.

## Hentet og tillatt i den avgrensede leveransen

| Produkt | Rettighetsgrunnlag | Hva som faktisk er brukt |
| --- | --- | --- |
| 2022 DOM/DTM, prosjekt 6266 | [Kartverkets frie datavilkår](https://www.kartverket.no/api-og-data/vilkar-for-bruk), CC BY 4.0, og [offisiell veiledning for eksport uten innlogging](https://test.hoydedata.no/LaserInnsyn2/help_no/topics/idh-topic230.htm). [Høyde-/dybdedataoversikten](https://www.kartverket.no/en/api-and-data/terrengdata) beskriver gratis API/nedlasting. | Egen anonym offentlig ImageServer-eksport, avgrenset geografisk og til ett prosjekt. Originale GeoTIFF-er, dato, CRS/datum, URL og SHA beholdes. Seks tak er transformerte estimater med kreditering og endringsbeskrivelse. |
| 2026 DOM/DTM-responser, prosjekt 6621 | Samme offentlige høydeeksportkanal og vilkår. Prosjektets generelle katalogfelt gir ikke i seg selv rett til alle andre leveranser. | Originaler bare i offline-evidens. DOM sammenlignes med 2022; null-DTM avvises. Ingen 2026-geometri eller bilder settes inn i byen. |
| OSM | [ODbL 1.0 / OpenStreetMap](https://www.openstreetmap.org/copyright). | Originale ringer og kilde-ID-er beholdes i separat tilgjengelig katalog; kildeangivelse både i visning og NOTICE. Ingen endring av originaldatabasen. |
| NVDB | [Offisielle NVDB-vilkår](https://www.nvdb.no/rammer-regelverk/vilkar-og-ansvar/vilkar-for-bruk-av-data/), NLOD, også kommersiell bruk med kreditering. | Uendret liten V4-prøve og valideringsresultat. Ingen ny rutetopologi eller tilgangsrett utledes. Kreditering: Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Statens vegvesen. |
| UiB-fotoreferanse | [Vilkår for det konkrete Marcus-objektet](https://marcus.uib.no/instance/photograph/ubb-kk-n-165-017.html) tillater gratis bruk, deling, kopiering og distribusjon med fotograf og institusjon. Bilder er **ikke CC0**, selv om Marcus-metadata er åpne. | Uendret middels JPEG: Atelier KK / Universitetsbiblioteket i Bergen, 1918–1922. Kun datert arkitekturreferanse. Ingen ny fototekstur, ansiktsanalyse eller fotogrammetrisk dimensjonering. |
| Norge i bilder metadata | Offentlig dokumentert `/projects`-API, avgrenset punktforespørsel. | Prosjektnavn, opptaksdato, eier, oppløsning og tekniske metadata; ingen rettighetsbegrensede bildepiksler. Metadatatilgang overfører ikke bildelisensen. |

Kreditering og transformasjon finnes også i [runtime-NOTICE](../../apps/bergen-simulator/public/enhancements/NOTICE.md). R1B/R1C-fotografier og GLB-er har uendrede egne CC BY-SA-vilkår og manifests. Nye materialfarger er skjematiske; det er ingen lisensiert eller oppmålt fasadetekstur på de seks nye volumene.

### Viktig motstrid for høyder

Geonorge-katalogen for prosjekt 6266 sier Norge digitalt-lisens. Dette er ikke ignorert: R1E bruker en særskilt offentlig høydeeksport der Kartverkets egen eksportveiledning henviser til gratisproduktenes vilkår. Det er dette konkrete distribusjonssporet som ligger til grunn for rasterprøven og dens krediterte derivater. Katalogens generelle felt kan ikke brukes til å oppheve de konkrete frie eksportvilkårene, og frie høydevilkår kan heller ikke overføres til **FKB, ortofoto eller tredjepartsmodeller**. Originale LAZ-rettigheter/levering avklares separat. `BEST_OPEN`, oppløsning og offentlig visning er tekniske egenskaper, ikke selvstendige lisenser.

## Krever avtale eller avklaring før innhenting/publisering

| Produkt | Nøyaktig hinder | Alternativer som er kontrollert | Neste handling |
| --- | --- | --- | --- |
| Originale klassifiserte LAZ, 6266 og mobil 5895 | Dokumentert originalfil-liste svarer 401; klippeeksport krever ekte e-post. Dette beviser ikke at data koster penger. | Prosjektmetadata, Geonorge, offentlige forhåndspakker og visningsmetadata. Forhåndspakker var nasjonale raster-/metadataprodukter, ikke passende råprøve. Ingen visningsbuffere er ekstrahert. | Godkjenn reell leveringsadresse eller forespørsel R1E-01. Ikke opprett konto, bestill eller send e-post uten godkjenning. |
| FKB Bygning_Flate og nødvendige 3D-taklinjer | ItemInfo: Norge digitalt begrenset; hasZ=false i flateproduktet. | FeatureServer, MapServer, kommunal tjenesteliste og Geonorge/distributørinformasjon. Generell «åpne data»-tekst gir ikke entydig rett. | R1E-02: nøyaktig avgrenset FKB-A/B-prøve + bekreftelse på kommersiell bruk, avledning og GLB-hosting; eventuell pris først etter eget samtykke. |
| Bygningshoyde | Offentlig punktlag med Z, men dato, høydefeltets betydning, vertikalt datum og viderebruk ikke bekreftet. | Lagmetadata og separat høyde-/grunnkartkatalog. | R1E-02; ingen feature-geometri kopiert i mellomtiden. |
| Kommunal 3D / Dokken / Årstad / Alrek | Faktiske 3D-tjenester finnes; tom/itemspesifikk lisens, uavklart observed/proposed-status og dekning. | Kommunal portal, global ArcGIS-katalog og faktiske SceneServer-metadata. | R1E-03. Ingen modell-/teksturbuffere fra seere eller cache. |
| Sandsli-BIM | Uttrykkelig krav om tillatelse fra Kime arkitektur og landskap AS; dessuten utenfor pilot. | Konkrete itemmetadata. | Ikke anskaff som pilot; kommunen kan peke til annet lisensiert BIM. |
| Ortofoto Bergen | Digitale ortofoto: Norge digitalt begrenset. WMS 499, nåværende GeoID-/tilgangsavtale. | Kommunal bildekatalog, offisiell ny metadata- og eksport-API, historisk fotoarkiv. | R1E-04. Ikke hent bruker-token, eksportjobb eller bildepiksler. |
| Matrikkelen-polygonklipp | Data er åpne CC BY 4.0; WFS 504 er teknisk feil. Alternativ dokumentert klippejobb krever e-post. | WFS 2.0, mindre bokser, schema, capabilities, formater, projeksjoner og områder. | Godkjenn faktisk leveringsadresse, eller bruk senere fungerende offentlig WFS. Ikke kall det et generelt lukket datasett. |
| Freda bygninger | Samme katalogpost sier NLOD og har samtidig særvilkår om skriftlig tillatelse. | Riksantikvarens åpne kanaler og eget lokalitetsprodukt. | R1E-05 for nøyaktig UUID; ikke viderepubliser mens motstriden består. |
| Bredsgården-skanning | Faktisk oppmåling dokumentert, men ingen eksplisitt gjenbruksrett eller originalfil-leveranse i gjennomgått side. | PAST, offentlig heritage-/universitetsdokumentasjon, UiB-foto. | R1E-05, ikke hent modeller fra visningscache. |

**Ingen pris er innhentet eller godtatt.** `REQUIRES_PAYMENT` finnes som tillatt status i JSON, men brukes ikke uten faktisk opplyst betalingskrav for den konkrete leveransen. Mulige FKB-, ortofoto- eller spesialdigitaliseringskostnader er uavklarte, ikke kalkulerte Bergen-kostnader.

## Rålaserforsøk når lovlig prøve foreligger

Eksperimentet er **ikke kjørt**: ingen original klassifisert LAZ ble anskaffet. Raster eksporteres ikke som en oppdiktet punktsky for å påstå at PDAL/roofer er testet.

Avgrenset neste test: kontroller leveransens SHA, LAS-header/CRS, NN2000, acquisition dates, original-ID og klassefordeling med PDAL. Bekreft faktiske ground/building-klasser før filtrering, ikke anta 2/6 bare fra standardnavn. Klipp med 5 m kontrollbuffer rundt samme pilot, behold originalpunktene uendret, rekonstruer i roofer mot uendret fotavtrykk. Sammenlign holdout-punkter, gesims/møne, planaritets-/dekningstap, trekantbudsjett og uavhengige kontrollmål. Lag GLB kun av aksepterte resultater og rettighetsklarerte teksturer. Verktøyversjoner, parametere og determinisme må dokumenteres når dette faktisk kjøres.
