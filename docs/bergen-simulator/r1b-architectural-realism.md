# R1B — architectural realism and bounded asset pipeline

Baseline: `b827783c8ebb94e95c4722d1a695d8ab4790e190` (R1).
The explicit R1B implementation request supersedes the earlier R0 documentation-only
stop. The Game Design Bible's LIVE/game and municipal-authority boundaries remain.
No public LIVE release, engine migration, new simulation or source snapshot rewrite.

## What changed

Seven original buildings now have a separate, source-ID-linked GLB render layer.
The coherent northern waterfront group has six **dated photographic upper facades**,
not generic window stamps. Four accepted laser fits improve its proportions, eaves,
ridges and pitch. Two poor fits are rejected. Skur 11 changes from its flat 3 m
storey-estimated fallback to a conservative laser-fitted gabled envelope. These
changes are actual render geometry/appearance; gameplay is unchanged.

| OSM identity | Identification in the study, not current business/ownership | Roof evidence |
|---|---|---|
| way/488690084 | Northern brown waterfront gable; Jebsens signage in 2022 reference | DOM fit accepted |
| way/331274578 | Adjacent ochre gable; hotel signage in reference | DOM fit accepted |
| way/331274560 | Narrow red gable; Madam Felle signage in reference | DOM fit accepted |
| way/331274567 | Wider red gable; nightclub signage in reference | DOM fit rejected, original OSM dimensions |
| way/292320260 | Northern of the neighboring white gables | DOM fit accepted |
| way/292320261 | Southern neighboring white gable | DOM fit rejected, original OSM dimensions |
| way/393025479 | Skur 11 | DOM fit accepted; dated independent photo supports gable identity |

The [source register](r1b-asset-source-register.md) records publisher URLs, licences,
acquisition dates, CRS/datum, permissions, unknowns and rejected alternatives. The
[runtime notice](../../apps/bergen-simulator/public/architecture/NOTICE.md) identifies
adaptations and share-alike image rights. No restricted-map extraction, purchased
model, new infrastructure, proprietary texture or generated architectural detail.

## Architectural evidence and truth classes

**Observed input:** unchanged OSM footprints/IDs/tags and 2022 Kartverket surface
pixels; the dated 2022 panoramic image shows actual facade patterns.
**Inferred:** roof-plane envelopes, ridge axes, photograph-to-footprint correspondence,
perspective registration and texture scale. Fit residuals are not independent
survey accuracy. Two source roofs contain mixed surfaces that exceed the 0.65 m
inlier RMS threshold and are deliberately not replaced by failed fits.
**Illustrative:** matte shading, lower untextured bands, material colour interpretation,
photo-plane separation and lighting. No surveyed material roughness or current
commercial occupancy is asserted.

The new render layer keeps NN2000 roof elevations. It uses the original source
footprint and per-corner display-ground samples for horizontal placement and contact.
There are no new source buildings, footprint edits, entrances, roads or simulation
capacity changes. The old source geometry remains the fallback and the sole placement/
scenario reference. A modelled roof is not permission to build or a cadastral survey.

Photos retain baked light/perspective. They provide appearance on one plane, not
recessed windows, door geometry or calibrated photogrammetry. Occluded lower shops
are omitted instead of synthesized. Side/rear facades remain schematic. Skur 11's
recognizable pillars/corrugation are still absent; this is an explicit landmark gap.
The two rejected roofs create some mismatched relative heights. No unsupported
dormers/chimneys have been added. A familiar viewer can compare individual photographed
fronts, but independent Bergen-expert recognition acceptance has **not** been obtained.
This is a meaningful architectural benchmark, not a completed high-fidelity twin.

## Pipeline and rendering boundaries

`src/architecture/catalogue.json` is a version-1, source-only render contract. It pins
source-snapshot SHA, exact asset SHA/bytes, local tile bounds, original building IDs,
footprint/height/elevation compatibility, acquisition, truth labels and roof fit audit.
It contains no player objects or trusted game outcomes. Scenario versions 1–6 and
all saved data contracts stay unchanged.

`scripts/build-architecture.py` is opt-in authoring code using the existing pinned GIS
requirements. It verifies every raw input hash and the R1 source-snapshot hash before
writing **only** the separate catalogue/GLB. A retained small DOM fixture supports
fully offline fit tests. Image cache misses can fetch only exact locked URLs; drift
aborts. Buildings are grouped by stable OSM ID with `body` / `facade` mesh metadata.
Source heights remain unchanged even when a render envelope differs.

At runtime, the dynamically imported glTF loader validates byte size, GLB envelope,
SHA, bounded geometry, exact source compatibility and embedded texture dimensions.
It permits no remote image/resource URI. Thirteen authoring meshes become **two
render batches**, with triangle-to-source ranges for picking. There is no React node
per building. A single index-only view removes those seven original render ranges
atomically when the complete tile is available; shared source attributes remain
immutable. Unavailable/corrupt/mismatched/late assets retain the original geometry and
an explicit inspector status. The same source IDs remain inspectable in both paths.

LOD: balanced near enters at 600 m and evicts beyond 750 m; the photo pass fades over
350…480 m. Low power uses original R1 geometry and materials. The photographic plane
uses one transparent pass, not two front/back passes. The bounded tile is hash-addressed
and fetched with browser caching. CPU/GPU geometry, texture and ImageBitmap lifetimes
are owned and disposed on eviction/cancellation/unmount, with a 15 s deadline.
LOD observes existing demand frames and never runs an idle animation loop.

The first measured implementation loaded after the source frame and failed its desktop
readiness guard. Asset loading now starts alongside the existing geographic preparation
worker, before the first canvas frame; it does not block the source fallback. The
failed diagnostic is retained. The existing geometry worker protocol is unchanged.

Embedded JPEG bytes are decoded directly with `createImageBitmap` and a local glTF
texture plugin. The default loader's blob-URL fetch violated the existing production
CSP; the fix changes decoding, **not** the CSP. No Vercel setting/authentication change.

## Format/compression choice and scaling assessment

GLB 2.0 is the delivery format: self-contained, inspected source IDs and a single
shared 1024² JPEG atlas. At ~193 kB total, decoder overhead/complexity is not justified
for Draco/Meshopt; geometry is already tiny. KTX2 could reduce decoded texture memory
for a larger atlas population, but needs target-GPU tests and a maintained transcoder.
No new npm dependency was required. There are no fictional instanced facade details.

This proves the per-building registry, LOD/fallback, material reuse, picking and source
licence path. It is **not yet a citywide streaming system**: one bounded tile, explicit
caps and a single atlas. Scaling needs a geographic tile index, per-tile contracts,
asset QA, model-specific licence review and measured eviction/texture budgets. Preserve
this read-only boundary for LIVE and game rather than mixing it with saved proposals.

## Verification and reproduction

See [evidence and measurements](r1b-evidence/README.md), including identical R1/R1B
cameras, close-ups, rejected fits, raw benchmark reports and test outcomes.
The budgets were written before integration in
[r1b-evidence/preimplementation-budget.md](r1b-evidence/preimplementation-budget.md).

From this app with Node 24 and the existing lockfile:

```sh
npm ci
npm run lint
npm test
npm run check:isolation
npm run build
node tests/capture-architecture-baseline.mjs
# Run the local Vite preview on 127.0.0.1:4180, then sequentially:
node tests/architecture-browser.mjs
node tests/architectural-assets-browser.mjs
# Offline GIS regressions with the existing isolated GIS environment:
python tests/architectural-importer.py
```

The baseline helper archives the exact R1 commit without changing branch, verifies
the unchanged dependency lock, builds independently and copies only the benchmark
harness. Cameras/viewport/DPR/CSP/driver synchronization are identical. Existing
application, geographic, simulation, release-policy, browser and isolation checks
remain mandatory. Near-view restoration budgets now explicitly count the two asset
passes replacing R1's roof-accent pass; far/low source budgets stay unchanged.

For real hardware follow the existing
[physical-device profiling procedure](milestone-5c-evidence/physical-device-profiling.md)
with exact R1 and this release, the same five benchmark cameras and quality tiers.
Use owned-device Chrome/Safari developer tools and local authorized content, without
SwiftShader flags, hosted diagnostics, telemetry or any Vercel bypass. Record device,
GPU, thermals, DPR, browser, load/network, median/P95 interaction, CPU/VRAM, picking,
touch, tile eviction and idle counters. No physical GPU/device is available here;
software viewport results do not establish iPhone performance.

## Remaining gate and next work

Human recognition review and physical desktop/mobile GPU acceptance remain open.
Next bounded iteration: obtain reusable, dimensioned architecture/laser feature data
for one full landmark (Skur 11 or a complete waterfront house), including roof breaks,
pillars, facade depth and verified non-front faces; add a second tested tile/texture
budget only after the first is reviewed. Do not expand into politics, finance or
municipal geography to conceal the remaining architectural data gap.
