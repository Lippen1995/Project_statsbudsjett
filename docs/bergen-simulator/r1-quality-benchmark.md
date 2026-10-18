# R1 — Bryggen / Vågen quality benchmark

## Scope and decision precedence

Baseline: `7243b53544ffbae88d680eb7df531cd67f273ded` (5D runtime plus approved design documents).
The 18 October R1 implementation request authorizes this bounded implementation and
protected simulator release. The earlier master prompt's documentation-only stop applied
to R0; it does not override this later instruction. The Bible's byrådsleder role supersedes
the old private-development product direction. Existing concept tools/saves remain intact;
R1 adds no municipal powers, private development mechanics, finance or political systems.
The target architecture and Cesium alternative are proposals, not an engine migration mandate.

The pilot is Bryggen's mapped waterfront block, local x −85…95 m, z −330…−120 m
(including the entire mapped Skur 11 footprint; 13 supported gables).
Camera positions are artistic viewing coordinates, not surveyed objects. The existing
Vågen and city context is retained; no source snapshot refresh or geographic expansion.

## Targets set before rendering changes

`tests/quality-views.json` fixes three cameras: waterfront, roof inspection and Vågen.
`tests/quality-browser.mjs` measures the exact unmodified baseline first, at 1440×1000
and touch-enabled 390×844, DPR 1, balanced and low-power settings, production CSP.
The same Chromium/SwiftShader process class and sequential probes are used afterward.

- At most 7 settled draw calls, 290,000 triangles and 28 MiB typed geometry attributes.
- No extra reflection/shadow textures; at most one lightweight source-roof accent batch.
- Zero frames over a settled 700 ms idle interval; stable live allocations across five
  camera cycles, post-GC heap growth under 5 MiB.
- Readiness no worse than baseline ×1.25 +500 ms; camera median no worse than ×1.25
  +30 ms and P95 ×1.25 +50 ms. These are software regression guards, not mobile FPS goals.
- Source coordinates/heights/IDs and all saved-scenario meanings unchanged; known
  roof edges must derive from the existing conservative source-supported gable model.
- Unknown heights stay footprints; no invented windows, dormers, entrances or storeys.
- Inspectable source identity and truth labels, keyboard and touch camera controls,
  working legacy concept tools; no external runtime asset requests.

Human landmark recognition and actual iPhone-class GPU thresholds remain review gates.
Screenshots are evidence for that review, not a claim of owner acceptance or a surveyed
photorealistic digital twin. Physical GPU/VRAM/idle GPU power are unverified here.

## Implemented presentation

- The opening view now frames the actual Bryggen waterfront. Three compact bookmarks
  reproduce waterfront, roofscape and across-Vågen cameras; overview reset remains.
- Thirteen already-supported gables get one distance-faded perimeter/ridge line batch,
  prepared in the existing one-shot worker. It adds 109 line segments / 7,848 typed
  bytes, zero source triangles. It is hidden in low power and beyond 900 m; hidden
  GPU buffers are disposed and can be uploaded again on demand.
- Pilot walls receive an illustrative baked vertical/contact tone. Additional mapper
  colour spellings and hex colours are interpreted conservatively inside the block.
  Skur 11 (`way/393025479`) now uses its reported `darkgreen`, rather than a random
  fallback. Its 3 m storey-derived height remains estimated; no missing gable height
  is invented. The full source building position and normal arrays are byte-identical.
- Balanced mode uses a subtle, anti-aliased, distance-faded static surface grain. It
  models neither windows nor surveyed cladding. Roof shapes/volumes are retained,
  not reconstructed from photographs or upgraded to a higher accuracy class.
- The existing 1024² shadow map has two stable extents: ±330 m around the waterfront
  when the camera is near and looking into the pilot, ±1900 m for the broader context.
  The view direction prevents the Nordnes context camera from accidentally selecting
  the pilot map. It is refit only on LOD
  transitions; ordinary orbit input reuses it. No larger shadow/reflection texture.
- Balanced water adds a simple view-dependent sky tone. There are no scene reflections,
  bathymetry, tides or animation. Low power retains the prior cheaper ripple finish;
  the initial software probe showed a regression worth removing from that path.
- Source building selection becomes an outline instead of opaque gold massing and a
  large floating marker. Object focus derives distance from the actual source footprint
  and labelled height. Minimum orbit distance is 18 m; keyboard/touch controls remain.
- The inspector distinguishes mapper colours, missing architectural detail and artistic
  finish. Source IDs and original source links remain selectable.

## Source and asset boundary

No geographic dataset or external image/texture/mesh asset was imported. All seven
`public/data/` records stay byte-identical. OSM footprints, source heights, colour tags,
landmark identities and roof attributes retain © OpenStreetMap contributors / ODbL 1.0;
Kartverket terrain retains CC BY 4.0, 2022/2023 project dates, NN2000 and its documented
CRS transformations. See [data sources](data-sources.md) and the unchanged source manifest.
The extra roof lines are visual derivatives of the same conservative `gableProfile`.
Unknown heights remain footprints; no source roof attributes are inferred from storeys.

Independent landmark reference checked on 18 October 2026:
[UNESCO — Bryggen](https://whc.unesco.org/en/list/59/) documents the narrow harbour-facing
rows and gabled fronts. It supports recognition criteria, not per-building dimensions,
window positions, current colours or ownership assignments. No UNESCO photo, logo or
text texture is redistributed. Existing data attribution is retained; newly authored
surface grain, lighting and colour swatches are illustrative code, not acquired assets.

No reviewed facade/photogrammetry asset set is available to this iteration. Accordingly
the benchmark improves presentation and source readability; it does not claim finished
high-fidelity architecture. FKB/photogrammetry/3D Tiles need a separately pinned licensed
delivery, datum/date/ID validation and a measured comparison before adoption. A renderer
replacement or streaming rewrite would not supply the missing building facts.

## Architecture and compatibility

`geo/benchmark.ts` contains presentation bounds/cameras; `geometry.ts` adds the bounded
source-roof batch and colour grading; `CityMaterials.tsx` owns disposable static finishes.
Scene lighting/LOD runs only on demand-rendered frames, without invalidating a new loop.
Geometry-worker protocol v2 adds the sixth bounded line buffer, with validation, transfer,
generation guards, deadline and disposal. This internal protocol is independent of saves.

Scenario schemas 1–6, saved input files, geographic IDs, placement constraints, construction,
PMU, district and transport engines are unchanged. Legacy concept tools remain available;
they are not recast as municipal powers. No game outcome enters the source render data.

## Verification and recognition checklist

Automated: fixed camera pose, bounded triangles/attributes/calls, source position/normal
hashes, every source-building pick range, finite/oversized/missing worker line buffers,
worker cancellation/disposal, zero settled frames, stable allocation cycles, source-map
clicks, source-sized focus, keyboard controls, real synthetic touch gestures, named Skur 11
inspection, no external requests and production CSP. Existing gameplay browser suites
retain their journeys; their near-view restoration counts explicitly include the one new
source-roof pass. Camera/source checks are regression tests, not a subjective beauty score.

Review the fixed before/after images for: (1) harbour-facing gable sequence; (2) preserved
narrow footprints/passages and missing-height honesty; (3) readable roof intersections;
(4) clear land/quay/water separation; (5) named Skur 11 colour and inspection; (6) mobile
city visibility and usable controls. Developer visual review and product-owner recognition
acceptance are distinct. R2/public LIVE and any engine-selection sign-off remain separate.

## Reproduction and physical devices

Use Node 24 and the app lockfile. `npm run test:quality-baseline` builds the exact baseline
in a disposable Git archive on port 4181, copies only the benchmark harness and cameras,
and leaves the active branch unchanged. Build/preview R1 on localhost:4180, then run
`npm run test:quality`. Run these sequentially without other CPU-heavy tasks. Artifacts
are local under `artifacts/r1/`. The capture/worker diagnostics still require localhost
and `?capture=1`; there is no public diagnostic endpoint or authentication bypass.

The first callback-only camera probe contained ~0 ms samples and a large outlier.
Two-RAF probes also varied substantially; one mobile-low run exceeded its median guard
by 2.4 ms. These diagnostics are retained, not presented as passing final measurements.
The final shared harness waits for two presentation opportunities and explicitly calls
WebGL `finish()` before sampling; readiness also waits for driver completion. Both the
exact baseline and R1 were rerun with this method. The numerical budgets/relative guards
were not relaxed. Raw callback and pre-finish RAF timings remain alongside completion
times. Driver synchronization is intrusive local QA, not completed display latency,
physical FPS, typical asynchronous throughput or touch-to-photon measurement. Software
and CPU-quota variation remains; this is not evidence of a native-device improvement.

Historical 5B/5C capture helpers retain the original five-batch profiler instead of
copying R1-only exports into older source. Their archived builds/profile checks are
verified separately; the new R1 baseline command is the visual benchmark here.

For native profiling follow the [physical-device procedure](milestone-5c-evidence/physical-device-profiling.md)
with baseline `7243b535` and the three R1 bookmarks. Use an authorized local checkout,
Chrome/Safari developer tools and owned-device USB debugging/forwarding where supported.
Do not use the automated SwiftShader launch flags for hardware measurement. Record device,
GPU, browser/OS, power mode, thermal state, viewport/DPR/quality, cold/warm runs, long tasks,
worker stages, camera median/P95, JS heap versus native/GPU memory, and idle frame counters.
Standard mobile browser profiling remains possible when localhost capture is unavailable;
do not weaken its hostname guard or Vercel Authentication. Keep recordings local and add
no telemetry. Native GPU, VRAM, worker peak memory, energy and physical touch latency remain
unverified until measured on real devices.
