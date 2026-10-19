# R1C source register and reconstruction alternatives

Reviewed/acquired 18 October 2026. This revision adds render assets only. The seven
original geographic snapshot files, OSM objects and saved scenarios are unchanged.
Use [R1B's register](r1b-asset-source-register.md) for the original OSM/DTM/DOM/atlas
acquisition. Public viewing is never treated as permission to extract a mesh.

## Adopted evidence

| Evidence | Publisher / original | Date, coverage, coordinates / accuracy | Rights and use |
|---|---|---|---|
| Skur footprint `way/393025479` | [OSM contributors](https://www.openstreetmap.org/way/393025479) in pinned 16 October snapshot | WGS84, existing local x-east/z-south grid. Four footprint corners; ~30.5×8.5 m envelope. Mapper geometry, not survey certification. Stable original IDs retained | ODbL 1.0; attribution, database share-alike/source availability retained. No geographic refresh |
| Roof envelope | [Kartverket Høydedata DOM](https://hoydedata.no/arcgis/rest/services/DOM/ImageServer), project 6266 Bergen 10pkt 2022 | Last project flight 18 April 2022, published 22 November 2024. Existing 0.5 m raster export, EPSG:25832 / NN2000 EPSG:5941; native grid 0.25 m. R1B symmetric fit: ridge 9.60, eave 8.26 m NN2000; 0.062 m inlier residual is **not independent accuracy** | Kartverket CC BY 4.0, BEST_OPEN=1. Original R1B lock/fixture/fit unchanged. No new LiDAR pixels acquired |
| Gable/quay-side form | [David40226543, Skur11.jpg](https://commons.wikimedia.org/wiki/File:Skur11.jpg) | 4 April 2009, 3072×2304. SE gable, visible side doors and piers. Uncalibrated photograph, no metric CRS, surveyed depth or current-condition guarantee | CC BY-SA 3.0 chosen from offered licences. Reused R1B pinned original. Approximate feature placement and geometry interpretation; attribution/share-alike retained |
| Capital, doors, cladding, street-side sequence | Jonatan Andersen / Commons: [11a](https://commons.wikimedia.org/wiki/File:Skur_11a.jpg), [11b](https://commons.wikimedia.org/wiki/File:Skur_11b.jpg), [11c](https://commons.wikimedia.org/wiki/File:Skur_11c.jpg), [11d](https://commons.wikimedia.org/wiki/File:Skur_11d.jpg) | 21 April 2012, respectively 3603×4503, 5103×3645, 5616×3744, 5159×3439 pixels. A: central port/piers; B: corrugation; C: oblique street side; D: three street-side doors. No calibrated camera poses/scale/CRS. Not synchronized with 2022 DOM | **CC BY-SA 3.0 Norway**; commercial transformation/hosting permitted with credit, licence and change notice. Photo-derived reconstruction contributions retain share-alike. Resized evidence copies; no runtime Skur photo texture, copied graffiti, people or background buildings |
| Existing six-front atlas | [Kognos / Commons](https://commons.wikimedia.org/wiki/File:Panorama_of_Bryggen,_Bergen.jpg) | 3 October 2022, 10872×3952, uncalibrated. Existing neighboring waterfront facades remain unchanged | CC BY-SA 4.0, existing cropped atlas/credits unchanged. No tenancy/current-condition claims |

Exact URLs, byte sizes and SHA-256 for the four new photos are in
[`scripts/r1c-inputs.json`](../../apps/bergen-simulator/scripts/r1c-inputs.json).
R1B source hashes remain in its original lock. Hashes detect drift, not publisher
signatures. Recompilation verifies every source before output. The original and
resized references retain their licences; no endorsement is implied.

## Alternatives investigated

| Approach / original source | Rights, geographic accuracy and completeness | Automation / cost / browser decision |
|---|---|---|
| [Bergen FKB service](https://kart.bergen.kommune.no/arcgis/rest/services/Basis_kartdata/Bygning_Flate/FeatureServer/0) | Publisher describes 2.5D building data and private access through resellers despite an ambiguous “open data” phrase. This polygon layer reports HasZ=false, EPSG:25832; it is **not a textured building mesh**. Specific redistribution entitlement/date/roof-line delivery not established | Roof-line triangulation could scale after explicit delivery clearance; no bulk acquisition, edit endpoint, purchase or replacement of current snapshot |
| [Bergen municipal city model](https://www.bergen.kommune.no/hvaskjer/bymiljo/bergen-har-fatt-sin-egen-bymodell-i-3d) / Bergenskart | Physical model and future digital model discussed; no authorized downloadable textured GLB/3D Tiles delivery established. Viewer access does not establish asset rights | Potentially strongest bulk source after a licensed georeferenced delivery; no viewer-cache extraction |
| Kartverket DOM / open LiDAR via [Høydedata](https://hoydedata.no/) | Open project selected in R1B supports dated roofs, not hidden wall openings. Airborne surfaces include vegetation and lack sufficient guaranteed facade coverage | Existing robust roof fitting is automated and retained. Point-cloud segmentation is promising, but does not supply a complete facade or warrant adding unobserved windows. No uncontrolled new geographic revision |
| [PAST Bredsgården 1A survey](https://past.no/bredsgarden/) | Publisher describes terrestrial laser scans, photogrammetry, point clouds and drawings. No open downloadable asset licence or redistributable delivery was established | Technically stronger landmark evidence if a permissioned delivery becomes available. Not copied or reconstructed from a restricted viewer; no paid engagement |
| [Anyscape Bergen](https://anyscape.io/3d-city-models/bergen/), [e-torg](https://kunnskapsbase.e-torg.no/3d-modell-inkl.-basiskart) | Commercial/source-derived massing offerings; no cleared free textured Skur asset. Vendor claims of open inputs do not themselves grant rehosting rights | No purchase/request/account creation. Generic massing would not solve window/door depth even if delivered |
| Sketchfab Bryggen candidates from R1B | No authorized downloadable/licensed asset established; page failures remain. Accuracy and georeferencing unverified | Rejected; no ripping, extraction of viewer buffers or scraping Google/Street View |
| Licensed photo-driven components (implemented) | Known historical photographic rights plus immutable footprint/roof anchor. Relative features inferred; missing sides explicit | Repeatable compiler, reusable relief/reveal/brace primitives, inexpensive offline LOD. Still requires per-building source correspondence and artistic/architectural review; not automatic photogrammetry |

## Truth and accuracy boundaries

The footprint, original tags/IDs, source ground and DOM pixels are observations with
source limitations. Roof fitting and photo-to-face correspondence are **inferred**.
Door/pier positions are approximate normalized registrations; widths, depths, capital
profiles, corrugation pitch and RGB/roughness are **illustrative reconstruction
parameters**, not measured construction dimensions. The northern end, an unobserved
part of the quay side, interiors and unseen fittings remain schematic. No windows,
dormers or additional entrances are invented to make a more impressive screenshot.
The historical views and 2022 roof are not a synchronized current survey. Different
apparent roof/facade proportions across them remain an accuracy limitation.
