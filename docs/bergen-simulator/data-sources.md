# Geographic sources and uncertainty

## Milestone 2A snapshot

The view retains the original WGS84 crop **5.298, 60.382, 5.349, 60.408**
(west, south, east, north), local equirectangular metre coordinates, and 1:1 vertical
scale. Original OSM acquisition was 16 October 2026, using 30 non-transactional map
API responses. Retrieval time is not a survey date.

| Content | Source and treatment |
| --- | --- |
| 6,502 building footprints | Original OSM IDs, tags, coordinates and heights unchanged |
| 6,542 road/path source records | Original centrelines unchanged; 88 unresolved bridge records omitted from the surface view |
| Coastline and 43 inland water outlines | Original OSM mask unchanged; terrain clipped to its land/lake boundaries |
| 46 named places | Original source-derived landmarks retained |
| 619 green-area records | Park/garden/grass/meadow/cemetery/wood/scrub/forest polygons from the **same pinned OSM XML inputs**; clipped to land, holes retained, sampled into terrain vertex colours |
| 49,313 terrain triangles | Project-specific Kartverket DTM, exported at 2 m, resampled to a 16 m display mesh |

`tests/geography-baseline.json` records geometry/height/source fingerprints from
commit `ab92713a99588dbf2458135e1bf7b41d892088a5`. Tests compare every building,
road centreline, coastline and water outline against those fingerprints and check
land-mask area. The original `bergen-osm.json.gz` and its SHA-256 remain unchanged.
New derived green-area mapping is redistributed as `bergen-context-osm.json.gz`
with OSM IDs, tags and polygons; its hash is embedded in the snapshot.

## Active terrain: verified acquisition and rights

The public [Høydedata DTM ImageServer](https://hoydedata.no/arcgis/rest/services/DTM/ImageServer)
was queried for the Bergen envelope. These two project records were checked:

| Project | ID | Last flight date | Published | Native CRS | Vertical datum | Native project grid |
| --- | --- | --- | --- | --- | --- | --- |
| Bergen 10pkt 2022 | 6266 | 2022-04-18 | 2024-11-22 | EUREF89 / UTM32, EPSG:25832 | NN2000, EPSG:5941 | 0.25 m |
| Bergen 10pkt 2023 | 6282 | 2023-06-02 | 2024-12-16 | EUREF89 / UTM32, EPSG:25832 | NN2000, EPSG:5941 | 0.25 m |

Dates describe the projects' **last flights**, not individual pixels. Metadata
reports `TILGANG=1` and `BEST_OPEN=1` for both. The official Høydedata export help
states that exports available without login are free and follow Kartverket's free
product terms. [Kartverket's terms](https://www.kartverket.no/api-og-data/vilkar-for-bruk)
license those products **CC BY 4.0**, permitting redistribution and adaptation with
attribution. The app credits Kartverket; this licence does not replace ODbL for OSM.

The export explicitly restricts the mosaic to `LAS_PROJECT_ID IN (6266,6282)`.
An independent public Identify response at Bryggen reports project 6266. The
GeoTIFF header verifies EPSG:25833 (server reprojection to EUREF89 / UTM33), 2 m
pixels, complete finite coverage, and an appropriate elevation range. Metadata
and input checksums, exact export URL, CRS, datum, dates and transformations are
in `public/data/terrain-source.json` and `source-manifest.json`. SHA-256 provides
local input integrity, not a publisher signature or a claim of survey accuracy.

The authoring importer bilinearly samples **pixel centres**, transforms WGS84/local
coordinates using `always_xy`, and triangulates a 16 m grid clipped to the retained
OSM land mask. Display terrain spans 0–398.14 m. Mesh spacing is not measurement
accuracy. Negative display ground heights are clamped to zero for the schematic
sea surface. A pixel-centre, CRS axis-order and checksum-drift regression suite
runs offline with the pinned Python GIS dependencies.

## Observed versus estimated geometry

- **69 buildings:** mapper-reported OSM metre heights; not independently surveyed.
- **3,555 buildings:** the existing `building:levels × 3 m` estimate, unchanged.
- **2,878 buildings:** unknown heights remain `null`; footprints drape over terrain
  and never acquire an invented height.
- **15 gables:** explicit OSM `height`, `roof:height` and `roof:shape=gabled`, with
  near-rectangular footprints and no courtyard. Roof height stays **inside** the
  reported total height. An explicit roof direction is used where present;
  otherwise ridge orientation follows the longest footprint edge and is labelled
  an inference. Unsupported/uncertain roof shapes retain simplified flat geometry.
  No roof height is inferred from storeys or assigned to an unknown building.
- Known volumes use a flat height reference at the highest sampled footprint ground point.
  Existing bottom wall vertices extend to the rendered terrain as schematic ground contact. This removes visible
  floating edges but does not establish surveyed floor levels, basements or walls.
- Road edges sample barycentric heights from the **rendered TIN**, rather than a
  different elevation interpolation. Valid OSM metre width tags are used when
  available (bounded to 30 m); other widths remain schematic: 7 m major roads,
  4 m other streets, 1.8 m paths. There is no transport capacity inference.
- Unresolved bridge decks are retained as source records but not ground-draped.
  Tunnels stay excluded; building passages remain surface paths beneath buildings.
  Missing bridge elevations are a visible gap, not an invented structure.
- Coastal edge skirts follow observed coast coordinates and DTM ground elevations.
  Their vertical cross-section/finish is artistic, **not surveyed quay geometry**.
  Water levels use the median sampled boundary elevation, sea level is schematic,
  and static tonal ripples are artistic. The sea outside the mapped crop is an illustrative backdrop, not verified coverage. No tides, bathymetry or measured lake levels.
- Green-area colours sample observed OSM polygons at display-mesh vertices;
  interpolated boundaries are approximate. No fictional trees, vegetation points,
  buildings or streets were inserted. Material tints interpret mapped colour names
  where available and otherwise use a deterministic artistic palette. No facade
  or material survey is implied.

## Reproduction and provenance

Application builds and browsers use checked-in static artifacts, with no GIS,
database or map-service connection at runtime. From `apps/bergen-simulator`:

```sh
python -m venv /tmp/bergen-geo
/tmp/bergen-geo/bin/pip install -r scripts/requirements-geo.txt
/tmp/bergen-geo/bin/python tests/importer.py
/tmp/bergen-geo/bin/python scripts/refine-geography.py
```

Refinement reads the fixed baseline from local Git history. Cached XML and raster
inputs must match the recorded hashes. Cache misses download the recorded inputs;
any upstream drift aborts before replacing the snapshot. Raw GIS inputs remain in
ignored `data-cache/`; the raster is not shipped to browsers. Reproduction requires
the baseline commit and the pinned dependencies, or the retained cache if an
upstream historical response changes. A second refinement produces identical
static outputs. `import-geography.py` remains the historical initial importer and
refuses to overwrite a refined snapshot. A fresh OSM acquisition is a separate,
reviewed dataset revision rather than an implicit refresh.

## Retained historical source

The original terrain lineage remains in provenance: four AWS/Mapzen Terrarium z13
tiles derived from `kartverket/Terrengdata_67m1_2_UTM33_10m_DEM.tif`, published
15 November 2017 (not survey date). Tile URLs, source headers and hashes remain in
the manifest; their output surface has been superseded. [Tilezen attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
identifies Norway terrain © Kartverket, CC BY 4.0. Historical credits are retained
in `public/data/NOTICE.md`.

## Evaluated but not imported / next iteration

Kartverket/Geonorge NHM WCS metadata was inspected, but the adopted import uses
project-specific DTM with traceable acquisition dates rather than an unidentified
nationwide mosaic. [FKB building specifications](https://register.geonorge.no/register/versjoner/produktspesifikasjoner/geovekst/fkb-bygning)
support richer roof/ground lines; no FKB building geometry was incorporated because
local delivery, redistribution rights and feature-height completeness have not
been verified for this app. Next: obtain an appropriately licensed Bergen building
height/roof extract and bridge deck levels, validate datum and dates, then improve
Bergenhus and the still-unknown building stock. No production services are involved.

## Traffic scenario extract — milestone 3A

No new external geographic dataset was acquired. `bryggen-transport.json` derives
27 motor-road ways and their original WGS84 OSM nodes from the same pinned snapshot
(© OpenStreetMap contributors, ODbL 1.0). It records source tile hashes, the source
manifest hash and retrieval time. There is no vertical datum in these 2D nodes;
the existing NN2000-derived display terrain supplies ribbon elevations only.

Reproduce with `python scripts/import-transport.py` after the original pinned XML
cache is present. All 30 tiles must match `source-manifest.json`; incomplete inputs,
changed hashes, absent selected ways or relevant restriction relations abort the
extract. Redistributed coordinates, tags and node/way IDs retain ODbL attribution.
No production data service or geographic API is accessed by build or gameplay.

Bryggen policy edges are OSM `way/9649862` and `way/488690111`. The detour uses
Slottsgaten, Sandbrogaten, Øvre Dreggsallmenningen, Dreggsallmenningen, Øvregaten,
Finnegårdsgaten, Rosenkrantzgaten, Vetrlidsallmenningen, Bryggesporden and Torget.
Lodin Lepps gate and Nikolaikirkeallmenningen provide a mapped one-way local
access branch. Graph junctions require shared original node identities; a crossing
or nearby endpoint is insufficient. One-way tags are retained. No selected-way
restriction relations were found in the pinned cache; absent tagging is not proof
of real-world turn legality or access. This extract deliberately omits other roads,
bridges and tunnels. See [model boundaries](milestone-3a.md).

Synthetic demand, speed, capacity, permitted trip categories and congestion and
emissions functions are model parameters, **not geographic observations**. They
are documented separately and must never be exported as municipal traffic facts.

## Player plans — milestone 3B

No new geographic dataset is imported. The original `bergen.json`, 27-way transport
extract, OSM/terrain manifests and source archives remain byte-identical to 3A.
Road-section keys derive solely from existing OSM way IDs and shared endpoint node
IDs; pointer proximity disambiguates a click and never establishes graph topology.

Plan files reference those keys and hold hypothetical access categories and capacity
multipliers. They contain no edited geographic geometry, vehicle observations,
financial data or traffic forecasts. The published example is an authored synthetic
model experiment, not a municipal proposal. A displayed capacity increase does not
assert that a real road could physically accommodate it. Mapped directions remain
fixed; real-world legal access and feasibility are not certified.

## Milestone 4A — unchanged sources, proposed surfaces

No source refresh or new geographic dataset. Public-space checks read the same
ODbL OSM footprints, coast, lakes and original road IDs, plus the existing CC BY 4.0
Kartverket DTM display TIN (NN2000, laser projects 2022/2023). Existing snapshot
hashes, acquisition/provenance metadata and attribution remain unchanged.

Player polygons are hypothetical authoring coordinates in the existing local metre
grid, not surveyed parcels or verified public land. Their colours, 0.22 m display
lift and dashed boundaries are presentation choices. A 4 m centreline conflict band
and 8 m proximity connection are explicit game assumptions, not measured road widths
or proof of pedestrian/vehicle access. The 16 m display terrain cannot resolve kerbs,
quay structures or detailed accessible grades. Missing ownership, heritage, utilities,
engineering feasibility, construction costs and pedestrian demand remain unknown.

### Milestone 4B source boundary

No new geographic dataset is imported and no source record is refreshed. Conceptual
buildings use player-authored local metre parameters, not asserted observations.
Placement reads the existing OSM footprints/coast/inland water (ODbL) and the pinned
Kartverket display terrain (CC BY 4.0, original acquisition/CRS/NN2000 records above).
The read-only grid survey and hashes in [4B evidence](milestone-4b-evidence/site-audit.json)
are derived screening results. Design-study coordinates and proposed dimensions do
not establish vacant land, cadastral boundaries, heritage clearance, surveyed
building heights, construction permission or engineering feasibility.

### Milestone 5A source boundary

No geographic, population, employment or service dataset was added or refreshed.
The 5A district is a proposed-building-only game model with authored conversion,
demand, uptake, workforce and turnover assumptions; none is calibrated to Bergen.
Existing OSM ODbL and Kartverket CC BY 4.0 attribution/CRS/vertical datum/acquisition
records remain authoritative for the unchanged scene. Derived monthly results must
never be exported as observed municipal statistics.

The [read-only site-access audit](milestone-5a-evidence/transport-access-audit.json)
retains source hashes and nearest audited OSM node/way IDs. It uses the existing
local metre projection, not invented road geometry. Node proximity is insufficient
to verify a site connector; no generated travel demand enters the 27-way graph.
All development coordinates, utilization tints and economic inputs remain separate
hypotheses. See [complete coefficients and model limits](milestone-5a.md).
