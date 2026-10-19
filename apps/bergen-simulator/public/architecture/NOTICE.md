# Bryggen architectural render assets — R1B / R1C

Geometry retains © OpenStreetMap contributors, ODbL 1.0:
https://www.openstreetmap.org/copyright . Original source records and share-alike
database are available at /data/bergen-osm.json.gz and in this repository.

Roof envelopes are inferred from © Kartverket, Bergen 10pkt 2022 digital surface
model (last project flight 18 April 2022), CC BY 4.0:
https://www.kartverket.no/api-og-data/vilkar-for-bruk . Raster resampled to 0.5 m,
project 6266 only, EPSG:25832 / NN2000. Robust fitted gable envelopes are derived
estimates, not surveyed architectural solids. Two failed fits retain OSM geometry.
The 16 m display terrain and original scenario geography are unchanged.

Facade atlas: Kognos / Wikimedia Commons, "Panorama of Bryggen, Bergen",
3 October 2022. https://commons.wikimedia.org/wiki/File:Panorama_of_Bryggen,_Bergen.jpg
CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . Changes: six upper
waterfront faces cropped, resampled, packed into an atlas and perspective-mapped.
The adapted atlas and image-mapping contributions are offered under CC BY-SA 4.0;
no additional restrictions apply. No endorsement is implied. Dated signs are part
of historical imagery, not assertions of current tenancies or ownership.

Reference only (not included in runtime texture): David40226543, "Skur11.jpg",
4 April 2009, https://commons.wikimedia.org/wiki/File:Skur11.jpg , CC BY-SA 3.0
https://creativecommons.org/licenses/by-sa/3.0/ . The documentation reference is
resized only. Pillars, corrugation and doors were unmodelled in R1B; the R1C
reconstruction and its separate rights/accuracy boundaries are described below.

Source checksums, rejected fits, transformations, reproducible asset compiler and
render catalogue are in scripts/r1b-inputs.json, scripts/build-architecture.py and
src/architecture/catalogue.json. Public/data files are not replaced. Windows are
photographed appearance on one plane, not geometric openings. Ridge axes,
photo registration, lower shop omissions and matte material shading are explicit
inferences/presentation. No invented dormers, entrances, dimensions or legal rights.

Source and adapted assets are also available from the feature branch:
https://github.com/Lippen1995/Project_statsbudsjett/tree/feature/bergen-simulator/apps/bergen-simulator/public/architecture

## R1C Skur 11 relief reconstruction

Observed footprint and IDs: OpenStreetMap contributors / ODbL 1.0. Unchanged
2022 Kartverket DOM roof envelope: CC BY 4.0. Ground contact: original source DTM.

Historical photographic evidence, adapted into parametric geometry and proportions:

- David40226543, 4 April 2009, [Skur11.jpg](https://commons.wikimedia.org/wiki/File:Skur11.jpg),
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- Jonatan Andersen, 21 April 2012,
  [Skur 11a](https://commons.wikimedia.org/wiki/File:Skur_11a.jpg),
  [11b](https://commons.wikimedia.org/wiki/File:Skur_11b.jpg),
  [11c](https://commons.wikimedia.org/wiki/File:Skur_11c.jpg),
  [11d](https://commons.wikimedia.org/wiki/File:Skur_11d.jpg),
  [CC BY-SA 3.0 Norway](https://creativecommons.org/licenses/by-sa/3.0/no/).

Photo-derived Skur reconstruction contributions are shared under CC BY-SA 3.0 NO
(and the compatible original 3.0 terms for David40226543's contributions). No
photographs are used as runtime Skur textures. Adaptations: relative feature tracing,
normalized placement on source envelope, simplified geometric ports/piers/capitals,
colour interpretation, illustrative metal relief/depth and automatic LOD. Not
calibrated photogrammetry or current condition; no endorsement. Northwest end and
unseen architecture remain schematic. Full source hashes, limitations and recipe:
[scripts/reconstructions/skur-11.v1.json](https://github.com/Lippen1995/Project_statsbudsjett/blob/feature/bergen-simulator/apps/bergen-simulator/scripts/reconstructions/skur-11.v1.json).
