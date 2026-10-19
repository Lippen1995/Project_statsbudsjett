# R1C repeatable architectural reconstruction

The existing React / Three / R3F renderer remains. No runtime GIS service, backend,
new dependency, account, database or authentication change. Source render data and
legacy hypothetical scenarios remain independent.

## Authoring contract and compilation

`build-architecture.py` checks the pinned source snapshot, R1B input hashes and new
`r1c-inputs.json` photo hashes. It reads `reconstructions/skur-11.v1.json`: version,
stable OSM ID, visual tier, dated/licensed references, normalized visible doors/piers,
explicit presentation coefficients and missingness. It accepts no executable code,
meshes, validity flags or source overrides. The opt-in Python compiler uses the
existing pinned GIS environment, never `public/data` writes or a build/install hook.

`reconstruction.py` provides shared vertex-coloured boxes, strips, braces and
recesses. The reusable rectangular adapter accepts stable source IDs, optional source-corner
anchors, evidenced-face lists and illustrative palettes; tests exercise a different
ID and reordered source corners without emitting another Bergen building. It supports
a single-ring, four-corner anchored warehouse and
source-fitted gable. A door opening removes wall triangles, adds jambs and a recessed
panel, then raised frames and crossed braces. Photo-supported corrugation is actual
shallow geometric relief. Granite piers have simplified joints, collars and rolled
capitals. No photographic facade plane substitutes for this geometry. A window
could use the same reveal/frame primitives only after its position is evidenced;
no window is added to Skur because the reviewed faces do not support one.

All dimensions are metres. Horizontal scale derives from the immutable four-corner
footprint. Roofs keep absolute NN2000 elevations. Relief/pier projections are limited
to a 0.6 m buffered footprint in QA, not inserted into observed geometry or planning
collision rules. Source ground spans 1.52–1.88 m; the simplified reconstruction uses
a conservative low skirt, not measured foundations. Depths, stone widths, normalized
registrations and material colours are explicitly approximate in the recipe/UI.

The deterministic output is one hash-addressed GLB 2.0 with one unchanged 1024² JPEG
atlas. Fourteen authoring meshes retain source IDs: seven medium bodies, six existing
photo faces and one close landmark replacement. The recipe hash, source hashes,
medium/high triangle counts and quality tier are recorded in render catalogue v2
(reconstruction recipe v1). Scenario versions 1–6 remain unchanged. No
arbitrary input meshes or remote buffer/image URI can bypass the runtime integrity,
resource, source-identity, finite geometry or size checks.

## Delivery tiers and LOD

| Visual class | Meaning / current coverage |
|---|---|
| 1 — Landmark | Individually sourced detailed reconstruction; Skur 11, **partial historical evidence**, not independently survey-verified |
| 2 — Recognizable building | Source-specific roof/photo facade; six R1B northern waterfront fronts, unknown sides explicit |
| 3 — Standard | Existing reliable footprint and reported/estimated height; schematic appearance, no invented architectural metadata |
| 4 — Geographic fallback | Original footprint or simplified volume for missing/failed detail, with original uncertainty |

These are visual delivery classes, not quality certificates or “fully observed” flags.

Two runtime draw batches remain: coloured bodies and the existing photo atlas. Near
100 m on desktop, the high body replaces the medium body **in the same mesh/material**; exit
hysteresis is 130 m. Both distances scale down by min(1, canvas CSS width / 1000):
a 390 px viewport enters at 39 m and exits at 50.7 m. A measured close front-view
software cost justified this conservative screen-detail budget; it does not claim
native GPU calibration. Medium geometry preserves piers and doors rather than losing
the entire landmark silhouette. High detail adds close corrugation, roof seams and
capital relief. Whole-tile bounds, 600/750 m streaming hysteresis and atlas fade are
retained. Low power keeps original source geography. No per-building React tree or
per-triangle component, no persistent render loop. A finite 1.8 s inspection flight
is the only new animation and stops on arrival/skip/new command/unmount.

GLB stays uncompressed geometry at this bounded size to avoid a decoder dependency;
HTTP delivery compression remains hosting-owned. Draco/Meshopt and KTX2 require a
measured larger tile/texture workload and hardware-specific validation. Geometry is
batched, photo texture reused; nothing justifies a renderer rewrite here.

## Ownership, picking and fallback

Loading begins beside the existing geography worker. Decode/hash/batch happens in
bounded async steps; a 15 s deadline, cancellation identity and explicit ownership
protect fallback. Medium/high/facade geometries, bitmap and texture are disposed on
tile eviction/unmount, including unused LOD resources. Pick handlers use the currently
active body’s triangle-to-source ranges; all Skur details resolve to `way/393025479`.
Selection is a ground perimeter, avoiding an intrusive x-ray of every internal edge.
Integrity/missing asset failures retain original geography and an explicit status.

Street inspection is read-only ephemeral state, never a scenario format change.
Four keyboard/touch-accessible views offer gable, quay, road side and stone capital;
skip/reduced-motion and return-to-city controls remain available. Conservative
expanded source-footprint camera bounds and terrain clearance prevent common clipping.
This is not a walkability map, collision-perfect navigation, legal access or a citywide
first-person system. Nearby unknown heights use a camera-only conservative envelope.

## Scaling to the next 100 buildings

Reusable now: stable source IDs, source locks, recipes/truth classes, component
assembly, hash-addressed GLB, two batches, LOD/pick ranges, cache/disposal, source-only
inspector, licence notices, reproducibility tests and identical-camera QA. Roof fits
and geometry assembly can be automated. Evidence matching, occlusions, ambiguous
openings, material interpretation and landmark acceptance still need human review.

Not delivered: an automatic 100-building reconstruction, full calibrated
photogrammetry, a citywide tile index, arbitrary facade grammar, streaming 3D Tiles,
complete nonrectangular landmark adapters or an approved native-GPU memory budget.
Scale the review/source recipe workflow first, then add a separately budgeted tile
index/eviction strategy. Do not convert schematic inputs into claimed observed facts.
