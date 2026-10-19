# R1C — Skur 11 landmark fidelity benchmark

Exact baseline: `d278ec9a5f17f5750c4a62a0bfae6c0ee891e0f8` (R1B).
The explicit R1C assignment authorizes this bounded implementation/protected Bergen
release. Earlier R0 documentation-only stops do not apply; public LIVE, geographic
expansion and political/economic gameplay remain outside scope.

## Candidate decision

All candidates lie inside existing central coverage. Availability means usable
source evidence, not merely a public viewer. These are qualitative engineering
judgments, not measured recognition scores.

| Candidate | Recognition / licensed photos | Reliable geometry / side coverage | Complexity / reuse | Gain / browser cost | Decision |
|---|---|---|---|---|---|
| Skur 11, `way/393025479` | Distinctive green shed, braced ports and rolled stone capitals; dated 2009 + four 2012 Commons views with explicit share-alike rights | Existing rectangular OSM footprint + accepted 2022 DOM gable fit. SE, NE and part SW evidenced; NW incomplete | Bounded warehouse; reusable anchored panels, reveals, braces, piers and LOD. No unverified windows needed | Large improvement from R1B's plain envelope, one shared body draw pass; small bounded geometry | **Selected**, with incomplete sides/metric depth explicit |
| Northern brown Bryggen gable, `way/488690084` | Strong waterfront identity and licensed 2022 upper-front image | Existing footprint and accepted DOM roof. Occluded lower shopfront, side/rear openings and recess dimensions not covered by current evidence | Multiple storeys/openings; generic window stamps would contradict the task. Requires more source registration | High potential front improvement; lower confidence in multi-angle result, more texture/geometry authoring | Retained as R1B Tier 2; not chosen merely for a photogenic front |
| Finnegaarden / Hanseatic Museum, `way/331274521` | Strong landmark; Commons [reference candidates](https://commons.wikimedia.org/wiki/Category:Finneg%C3%A5rden,_Bergen) available for per-photo rights review | Existing snapshot has storey-estimated height; no accepted roof fit in the bounded R1B study. No cleared complete current survey | Complex roof/openings and dated/restoration differences; substantially more work to verify all faces | Excellent eventual landmark, higher source and browser/asset risk for this iteration | Defer until a licensed, georeferenced multi-face survey/delivery |

The [source register](r1c-source-register.md) evaluates municipal/FKB, LiDAR/DOM,
commercial massing, licensed surveys and downloadable models. No better cleared
ready-to-host full landmark was established. A source gap is not filled by scraping
restricted maps or purchasing assets.

## Working implementation

Skur now has a separately compiled medium/high body anchored to its original OSM
identity and unchanged source-fitted roof. It includes six source-visible inferred
piers with segmented stone shafts/collars/rolled capitals, six supported port bays,
real recessed panels/jambs, raised frames/crossed braces, shallow corrugated wall
geometry and inexpensive roof seams. The northwest end and unobserved fittings stay
schematic. There are no invented windows, people, interiors or demolition.

The [pipeline](r1c-reconstruction-pipeline.md) is reproducible, parameter-driven and
versioned. The loader checks the GLB hash, source compatibility, embedded resources,
identity, finite bounds, triangle count and byte caps. Medium/high geometry shares
the same body material/draw pass. No per-building React trees or additional texture.

Four controlled street inspection views offer the gable, quay side, road side and
stone capital. A finite overhead approach avoids flying straight through the shed;
reduced-motion/skip, keyboard/touch orbit, conservative camera clearance and return
to Bergen are implemented. Selection retains the source ID without an intrusive
x-ray of all port and pier edges. Missing/corrupt/cancelled assets retain the original
geographic fallback and an explicit inspector message.

## Fidelity assessment

| Criterion | What the implementation supports | Remaining shortcoming |
|---|---|---|
| Recognizable silhouette | Green gable, distinctive port/pier sequence and rolled capitals have actual geometry; medium LOD retains the landmark silhouette | Simplified capitals and missing north-end detail; no independent Bergen-expert acceptance |
| Architectural proportions | Unchanged mapped horizontal footprint and source-fitted 2022 roof anchor every view | Source footprint is not a cadastral survey; historic photo registration and relative opening/stone dimensions are inferred. Apparent photo/DOM proportion differences need an independent survey |
| Geometric facade depth | Port bays cut through the outer wall surface; recessed panels/jambs, raised braces and piers are visible obliquely | Recess/relief depths are illustrative metre parameters, not measurements; no interior or hidden openings |
| Multi-angle consistency | One coherent 3D asset, SE/NE and supported SW features, stable OSM picking from near views | NW and unseen quay-side features deliberately schematic; not a complete current four-face reconstruction |
| Material credibility | Matte green metal, geometric corrugation, segmented stone and collar/capital relief | Restrained artistic RGB/roughness and simplified surfaces; no calibrated albedo, fine stone scan, measured weathering or photorealistic material claim |

This delivers an inspectable architectural reconstruction beyond a flat photo.
It **does not close the full high-fidelity/independent-recognition gate**. Human
recognition review, current multi-face survey and physical-device GPU acceptance
remain required before declaring a complete digital twin or scaling publicly.

## Evidence, validation and performance

[Before/after views, references and receipts](r1c-evidence/README.md) use exact R1B
archives without switching branch. Seven fixed cameras cover aerial, waterfront,
frontal/angled street, roof, detail, road side and both viewports. Street views respect
the old baseline camera's polar limit so before/after poses are identical; the new
inspection mode additionally supports closer controlled views.

Predeclared budgets are in [the evidence package](r1c-evidence/preimplementation-budget.md).
Software driver-completion probes are not physical FPS or touch-to-photon. Hardware
measurements are unavailable; follow the existing [local physical-device procedure](milestone-5c-evidence/physical-device-profiling.md)
with exact R1B/current commits and the added landmark cameras, without SwiftShader,
hosted diagnostics, telemetry or Vercel bypasses.

The first LOD test exposed a 5.1 cm cap-height loss from six-segment coarse circles.
The geometry was corrected to eight segments; the 4 cm silhouette guard was retained.
An initial frontal comparison was obstructed by an observed pavilion; the fixed pose
was corrected in **both** baseline and after captures, not by removing geography.
The legacy Living City and Management visibility tests also compared a distant profiling pose
against a near pose. R1C's extra medium-LOD geometry exposed that invalid comparison.
They now check proposed/observed triangle changes at the **same** camera and LOD;
the strict visibility assertion remains. The first close-front mobile software probe rose from 141.5 to 195.3 ms median
while satisfying the broad guard. Fine relief was unnecessary at that projected
size. Canvas-width-scaled high-detail thresholds now keep medium silhouettes at
that distance; closer source-supported detail remains. Paired final probes record
the result. Known diagnostics are not represented as passing measurements.

## Isolation and next step

All work is inside simulator app/docs on `feature/bergen-simulator`. No main/PR,
Fellestall frontend/ETL/workflow, Neon, source snapshot, scenario schema or Vercel
configuration changes. The existing protected Bergen workflow is the only release
path. See the evidence receipt for local validation and the released commit's
Bergen Actions run for deployment status; local screenshots do not prove a hosted release.

Next: source-verified dimensions/current photographs or a permissioned terrestrial
scan for the missing Skur faces and capital profiles, independent Bergen recognition
review and real desktop/mobile profiling. Then reconstruct one adjacent building
with evidenced windows/reveals using the same reviewed recipe, before a bounded
multi-tile/texture eviction experiment. Do not mass-produce guessed architecture.
