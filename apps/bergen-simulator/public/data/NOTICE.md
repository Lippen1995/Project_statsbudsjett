# Bergen Reimagined geographic data attribution

## Mapping

© OpenStreetMap contributors. Mapping and the redistributed OSM extract are
available under the Open Database Licence (ODbL) 1.0.

https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

Source extract: bergen-osm.json.gz. Input URLs and SHA-256: source-manifest.json.
The application transforms WGS84 coordinates into local metres, clips to its view,
extrudes footprints and drapes roads. Explicit storey-based estimates,
schematic road widths and unresolved flat roofs are application assumptions, not OSM facts.

## Historical terrain (superseded)

Mapzen / Tilezen Terrain Tiles, hosted by AWS Open Data.
https://registry.opendata.aws/terrain-tiles/
https://github.com/tilezen/joerd/blob/master/docs/attribution.md
https://github.com/tilezen/joerd/blob/master/docs/data-sources.md

All four tile response source headers identify:
`kartverket/Terrengdata_67m1_2_UTM33_10m_DEM.tif`.
Tile Last-Modified: 15 November 2017 (not a survey date).

Applicable upstream attribution:

- Norway terrain data © Kartverket. Creative Commons Attribution 4.0 International:
  https://creativecommons.org/licenses/by/4.0/

The precise tile URLs and hashes are in source-manifest.json. The prototype decodes
Terrarium RGB, bilinearly samples elevations into a 32 m mesh, clamps negative
coastal heights to zero and clips the mesh to mapped coastline/lakes. Lake levels
are schematic. No vertical exaggeration. These transformations do not constitute
a current survey, and each output vertex has no individual source-provider label.

## Active terrain and presentation — milestone 2A

The active terrain surface supersedes the historical tile surface described above.
© Kartverket / Høydedata. Bergen 10pkt 2022 (project 6266, last flight 2022-04-18)
and Bergen 10pkt 2023 (project 6282, last flight 2023-06-02).
Creative Commons Attribution 4.0 International (CC BY 4.0).
https://www.kartverket.no/api-og-data/vilkar-for-bruk
https://creativecommons.org/licenses/by/4.0/
https://hoydedata.no/arcgis/rest/services/DTM/ImageServer

Open-export metadata, original EPSG:25832 / NN2000 (EPSG:5941), export EPSG:25833,
2 m crop, request URL, dates and checksums: terrain-source.json.
Transformations: pixel-centre bilinear sampling; local metre projection; 16 m
land-clipped display mesh; negative display heights clamped to zero. Ground-contact
skirts, water levels and vertical coast edges are schematic, not surveyed structures.
Fifteen gables use explicit OSM total and roof heights; inferred ridge direction
is labelled. Heights unknown in OSM remain unknown. Tints, lighting and static
water ripples are artistic; they are not a material or water survey.

Additional derived OSM green-area polygons: bergen-context-osm.json.gz, ODbL 1.0,
© OpenStreetMap contributors. Existing source mapping and source IDs are retained.

## Derived traffic network — milestone 3A

`bryggen-transport.json`: © OpenStreetMap contributors, ODbL 1.0.
https://www.openstreetmap.org/copyright
Original WGS84 node coordinates, node/way identifiers and tags extracted from the
same hash-pinned 30-tile OSM cache. No new geographic acquisition or vertical datum
is introduced. Display elevations use the existing Kartverket-derived terrain.
The extract includes source hashes, snapshot retrieval time and a restriction
relation audit. Shared node IDs alone establish connectivity; no inferred links.

Demand, speeds, capacities, permitted policy categories, congestion costs and
emissions proxy are **synthetic scenario assumptions**, not OSM observations or
forecasts for actual Bergen traffic. Traffic colours are a model visualization.
