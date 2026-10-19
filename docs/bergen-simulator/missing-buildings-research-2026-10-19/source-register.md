# Kilder, rettigheter og egnethet

Kontrollert 19.10.2026. Programvare, datasett, modellvekter og bilder har separate
rettigheter. Gratis visning er ikke redistribusjonsrett. Ingen betalte produkter
er kjøpt eller restriktive kartvisere ekstrahert.

## Faktisk anvendte geometrier og høyder

| Kilde / utgiver / original | Dekning, epoke, CRS og nøyaktighet | Rettigheter og konkret bruk |
|---|---|---|
| Eksisterende [OSM-grunnlag](../data-sources.md), © OSM-bidragsytere | Sentrum, WGS84 5.298/60.382/5.349/60.408; API-uttak 16.10.2026, ikke survey-dato. 6 502 fotavtrykk/6 501 kilde-ID-er. Lokal omregning bevares | [ODbL 1.0](https://www.openstreetmap.org/copyright). Bare lesing av låst snapshot. Alle OSM-ID-er, komponenter, gårdsrom og tidligere kildehistorikk beholdes |
| [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), Microsoft; [tilgjengelig indeks](https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv) | Norway quadkey 120020133; manifest oppgir UploadDate **2026-02-23**, URL-mappe 2026-02-03. Dette er publiseringsdatoer, ikke eksakt bildeopptak. Modellen er bildeavledet; lokal survey-nøyaktighet ikke dokumentert. GeoJSON/WGS84; ingen vertikal datumhøyde. Alle lokale høyder/confidence er -1 | Dagens offisielle README lenker [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/) og repo-LICENSE oppgir samme avtale med skrivefeilen «CLDA». Kommersiell bearbeiding/redistribusjon tillatt under vilkårene; lisensen beholdes. Bounded subset publisert separat; kryssdatabase mot OSM/Overture under ODbL |
| Microsoft, nyere [README-indeks august 2026](https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv) | README viser nyere globale oppdateringer. Denne indeksens host ble avvist av sesjonens proxy med HTTP 403 ved CONNECT | Ikke hentet gjennom omgåelse. Den undersøkte eldre flisen omtales **ikke som nyeste**. Ingen nye Microsoft-høyder antas på grunnlag av annonserte globale tall |
| [Overture Buildings](https://docs.overturemaps.org/guides/buildings/), Overture Maps Foundation, [STAC](https://stac.overturemaps.org/catalog.json) | **2026-09-23.1**, lest 19.10.2026. GERS, source record IDs, per-egenskap-opphav og versjon beholdes. GeoParquet/WGS84, høyde meter over bakke, ikke absolutt NN2000-kote. OSM-kildene her oppgir planetversjon **2026-09-06**; mange Microsoft-høydereferanser oppgir versjon **2026-08-11** | Bygningstema er [ODbL](https://docs.overturemaps.org/attribution/#buildings). Microsoft-oppføringer i denne utgaven merkes ODbL-1.0. Ikke bruk dagens separate Microsoft-CDLA til å ommerke Overture. Kommersiell hosting/bearbeiding med database-/attribusjonsvilkår. Azure-vert avvist av sesjonsproxy; data ble lest fra utgivers **publiserte offentlige AWS-alternativ** over vanlig HTTPS, uten credentials/policyendring |
| [Kartverket DOM/DTM](https://hoydedata.no/arcgis/rest/services), Bergen kommune / Terratec–Field | Eksisterende DOM prosjekt 6266 Bergen 10pkt 2022: siste flydato 18.4.2022, publisert 22.11.2024, native 0,25 m / undersøkt raster 0,5 m, EPSG:25832. DTM er eksisterende 2 m EPSG:25833-crop med 6266/6282 (2023). Begge NN2000, EPSG:5941. Lokal registrerings-/epokeusikkerhet beholdes | Åpne prosjekter har `BEST_OPEN=1`, `TILGANG=1`. [Kartverkets gratisproduktvilkår](https://www.kartverket.no/api-og-data/vilkar-for-bruk): CC BY 4.0, kreditering og adgang til transformasjon/hosting. Ingen originaler overskrevet. Rastere er ikke rå laserpunkter; 10 pkt/m² er prosjektets oppgitte lasertetthet, ikke rasterets tetthet eller fasadenøyaktighet |

Alle faktiske analyseinnganger, filstørrelser, eksakte URL-er og SHA-256:
[`inputs.json`](inputs.json). Microsoft mangler en original objekt-ID i den
undersøkte filen. Vår identifikator er derfor **flis + linjenummer + råposthash**,
stabil i akkurat denne låste utgaven; aldri en oppfunnet OSM-/matrikkel-ID.
Råhash gir lokal integritetskontroll, ikke utgivers signatur.

## Uavhengig kontroll og mulige bedre kilder

| Kilde | Funn / kvalitet | Rettigheter, egnethet og status |
|---|---|---|
| [Matrikkelen — Bygningspunkt](https://kartkatalog.geonorge.no/metadata/uuid/24d7e9d1-87f6-45a0-b38e-3447f8d7f9a1), Kartverket; [offisiell oversikt](https://www.kartverket.no/api-og-data/eiendomsdata/apent-tilgjengelige-data-og-tjenester), [WFS](https://wfs.geonorge.no/skwms1/wfs.matrikkelen-bygningspunkt?service=WFS&request=GetCapabilities&version=2.0.0) | Metadata oppdatert 18.10.2026, data oppgitt oppdatert 17.10.2026. Registrerte representasjonspunkter/status/ID; ikke bygningsomriss, tak eller høyde. XSD sier at punkt kan registreres uten verifisering mot omriss, og omfatter også planlagte/under oppføring; status må kontrolleres | Metadata oppgir eksplisitt **CC BY 4.0**, åpne data og ingen oppgitt bruksbegrensning. Ingen søknad/BAAT kreves for dette åpne uttrekket. Relevant uavhengig kontroll av kandidater; et punkt alene gir aldri rett til å tegne en tilfeldig omkrets eller påstå at et planlagt bygg allerede finnes |
| [FKB-Bygning](https://dokument.geonorge.no/produktspesifikasjoner/fkb-bygning/Versjon%205.1.1/index.html), Geovekst/Kartverket/Bergen | Takkant/fasadeliv/møne kan være bedre enn ML-roofprints. Bergens undersøkte Bygning_Flate-lag er 2D; kilde-/epoke- og høydefullstendighet ikke etablert for våre kandidater | [Kartverkets kartgrunnlag](https://kartverket.no/api-og-data/kartgrunnlag-fastlands-norge) sier at FKB generelt ikke er åpne/gratis data. Lokale åpne unntak krever konkret leveranselisens, inkl. web-GLB. Ingen FKB-geometri hentet eller produksjonsrett antatt |
| [Høydedata LAZ-eksport](https://test.hoydedata.no/LaserInnsyn2/dok/webtjenester.pdf), Kartverket | Offisiell dokumentasjon beskriver prosjekt, geometri/CRS, LAZ-format, start/status. `CopyEmail` kreves uten BAAT-bruker. Hovedhostens dokumentasjons-/utvidet DOM-forespørsel ga HTTP 503; offisiell test-host-PDF var lesbar | Ingen eksportordre, e-post eller konto opprettet. Åpen rasterlisens er ikke bevis for at en rå fil allerede er hentet/klassifisert. Senere råpunktsky må låses med leveranse-CRS, vertikalt datum, datafangstdato, klasser, tetthet, hull og lisens |
| [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas), Zhu et al. | Global polygon/height/LoD1; interessant dekning, men ingen lokal Bergen-kvalitetsprøve her | Gjeldende repo skiller **GBA.ODbLPolygon (ODbL)** fra **GBA.Polygon/GBA.LoD1/GBA.Height (CC BY-NC 4.0)**. Artikkelens åpne publiseringslisens er ikke datasettlisens. NC-utdata ikke tatt inn i kommersiell produktpipeline; ingen geometri lastet ned |
| [Google Open Buildings](https://sites.research.google/open-buildings/), Google Research | Bygningsdeteksjon og temporal 2.5D i publisert dekning. Ingen verifisert Bergen-uttrekk i denne studien | Ikke forveksle åpne forskningsdata med Google Maps/Earth/Street View. Ingen kommersiell viewer eller bilder ekstrahert. Ingen inngang i denne prototypen |

## Verktøy / AI

| Verktøy | Rolle og rettigheter | Hva er bevist her |
|---|---|---|
| [3dfier](https://github.com/tudelft3d/3dfier), TU Delft, GPLv3 | Kjente 2D-flater + punktsky til LoD0/1-volumer og terreng; [LoD1](https://tudelft3d.github.io/3dfier/generate_lod1.html) bruker bl.a. takpercentil. Programvarelisens klarlegger ikke rådatakilder | Vurdert, ikke kjørt på nye Bergen-laserpunkter; ingen 3dfier-tak eller vinduer hevdes |
| [roofer](https://github.com/3DBAG/roofer), 3DBAG, GPLv3; [datakrav](https://innovation.3dbag.nl/roofer/data_requirements.html) | Skalerbar LoD2.2 fra klassifisert bygnings-/bakkepunktsky og godt samregistrerte takavgrensninger; ikke fasadefotogrammetri | Anbefalt neste laserpilot, ikke benchmarktestet uten råpunkter. Ikke installer det uvedkommende gamle PyPI-prosjektet med samme navn |
| [PDAL](https://pdal.io/en/latest/), BSD-kjerne / egne plugins | Filtrering, klassesjekk, reprojeksjon, klipping. Ikke en fasadegenerator | Ikke kjørt på raw LAZ i dette forsøket |
| [OSM2World](https://github.com/tordanik/OSM2World) | Tidligere faktisk testet 0.4.0 LGPLv3, nyere master MIT. Grunnform/GLB fra eksisterende kartdata, defaults for ukjente egenskaper | [Forrige Skur-forsøk](../reconstruction-research-2026-10-19/prototype-results.md) ga udokumenterte standardvinduer/3,5 m-høyde. Ikke valgt som erstatning for R1C eller som ny bygningsdetektor |
| [SAM 2](https://github.com/facebookresearch/sam2), Meta | Repo/checkpoints oppgir Apache 2.0; bildedatasett og demoressurser har separate vilkår. Segmenteringsforslag, ikke autoritativt omriss | Ikke kjørt/trent, ingen nye vekter eller bildeassets hentet. Må evalueres på lisensiert Bergen-kontrollsett |
| [VGGT](https://github.com/facebookresearch/vggt), [DUSt3R](https://github.com/naver/dust3r), [MASt3R](https://github.com/naver/mast3r) | Lært dybde/pose kan hjelpe kontroll. VGGT har egen lisens med vilkår; DUSt3R/MASt3R har NC-begrensninger i undersøkte repoer | Ingen AI-generert bygning publisert. Se forrige [rettighetsregister](../reconstruction-research-2026-10-19/source-register.md); ikke bruk modellfrihet som mål på geografisk sannhet |

Den faktiske høyde-/takprototypen er egen liten Python-kode på allerede lisensierte
rastere, ikke en nytrent modell. Den gjør ingen påstand om oppmålt fasade,
materialer eller skjulte vindusplasseringer.

Fire små WFS-uttak er faktisk gjennomført: EPSG:25832, opprinnelige bygningsnumre/
UUID-er og status bevart, åtte punkter rundt tre Overture-kandidater og null rundt
én Microsoft-kandidat. Tjenesteoppgitt metadata/CRS og råsvarhash-er finnes i
`registry-metadata.json`/`registry-probes.json`; utvalgte felter er en eksplisitt
transformasjon, ikke en påstand om full rå-GML-arkivering. Ingen adresse-, eierskap-
eller bruksenhetsinformasjon beholdes. Datasettet er alene CC BY 4.0; sammenstilling
mot OSM/Overture distribueres som avledet database under ODbL.
Status IG/GR stoppet ferdigbyggstøtte; tolkning følger
[Kartverkets føringsinstruks](https://www.kartverket.no/globalassets/eiendom/matrikkel/foeringsinstruks-matrikkelen.pdf).
