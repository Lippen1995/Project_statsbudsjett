# Bergen Reimagined geographic data attribution

## Mapping

© OpenStreetMap contributors. Mapping and the redistributed OSM extract are
available under the Open Database Licence (ODbL) 1.0.

https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

Source extract: bergen-osm.json.gz. Input URLs and SHA-256: source-manifest.json.
The application transforms WGS84 coordinates into local metres, clips to its view,
extrudes footprints and drapes roads. Explicit storey-based estimates,
schematic road widths and flat roofs are application assumptions, not OSM facts.

## Terrain

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
