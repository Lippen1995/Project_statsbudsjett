# Milestone 4A — Physical City Editing & Public Spaces

Baseline: `e04790448595e12c7936c6a86c0bfe1a9971555f` (3B).
Application and release remain on `feature/bergen-simulator`.

## Playable slice

Enter Planning Mode → **Physical public spaces** → **New public-space footprint**.
The camera focuses on the pinned Bryggen waterfront. Tap land to add corners; the
ring closes for live preview after the third corner. **Move corners** enables
terrain-constrained dragging; **Add corners** resumes drawing. **Navigate camera**
releases orbit/pan/zoom without losing the draft. Keyboard/number inputs, a corner
selector and 1 m step buttons provide a precision alternative to mouse/touch.
Unapplied corner changes have their own bounded undo/redo; confirmation records a
single physical edit in the shared street/physical plan history.

Choose pedestrian paving or landscaped treatment. A valid design can be applied,
selected directly in 3D, reshaped, removed, undone or redone. The surface follows the
existing terrain, with artistic colours and dashed proposal boundaries. It never
replaces a source building, road, land polygon or elevation. The display lift is
0.22 m (boundary 0.36 m), solely to avoid depth fighting; it is not construction
thickness or a surveyed design level. No buildings, furniture, excavation, bridges
or people are invented.

**Show observed city** hides proposed surfaces/operational edits. Saved designs can
be compared in 3D and by horizontal area. Traffic comparisons recalculate baseline,
current plan and saved reference from identical synthetic demand. Apply/discard a
draft before running or saving; it is not silently included in a simulation.

## Geometric eligibility, with explicit bounds

Coordinates are the existing local grid: east X, up Y, south Z in metres from
5.3235° E / 60.395° N. Areas are horizontal footprints in this local approximation,
not cadastral or geodesic survey areas. All thresholds are prototype/game choices.

| Check | Numeric rule | Reason / meaning |
| --- | --- | --- |
| Authoring window | X −145…145 m; Z −335…−65 m, inclusive | Bounded central Bryggen slice, not a land-availability boundary |
| Ring | 3–8 finite vertices, simple, no duplicate/crossing edges | Dependable direct editing and bounded triangulation; concave rings supported |
| Edge length | ≥1 m | Avoid near-duplicate corners and microscopic geometry |
| Area | 25…2,500 m² per proposal, inclusive | Useful small public spaces, controlled authoring/rendering work |
| Span | ≤100 m on either horizontal axis | Prevent long ribbons across the city |
| Proposal count | ≤4, no touching/overlap | Bounded footprint and unambiguous surface ownership within a plan |
| Terrain coverage | Exact clipped TIN coverage within 0.001 m² numerical tolerance | Checks interiors, not just corners; water/missing land cannot be spanned |
| Slope | Every intersected display-TIN triangle ≤15% grade | Reject steep areas/quay-edge artefacts; **not** an accessible-design or engineering standard |
| Buildings | No intersection, containment or boundary within 0.25 m of observed rings | Conservative numeric clearance; courtyard holes retained |
| Coast | No crossing/contact within 0.25 m of the mapped polyline | Avoid placing across the pinned shoreline |
| Inland water | No polygon intersection/containment | Respect observed lake/water polygons and holes |
| Road conflict | Within 4 m of an original modelled centreline | An **assumed** conflict band; real carriageway widths are not known |
| Challenge connection | Within 8 m of an existing modelled road line | Supported geometric proximity only, not proof of a walkable or legal connection |

The pure TypeScript validator triangulates the ring, clips each piece to overlapping
source TIN triangles and lifts intersection vertices barycentrically. Summed clipped
area checks full coverage. Maximum planar TIN gradient checks the whole footprint.
Boundary/containment checks catch a building or lake completely enclosed by a
proposal, as well as crossing its boundary. A read-only window index avoids scanning
all city buildings/TIN triangles for every edit. No generated point becomes an OSM
node, road connection or changed source record.

A rejected preview explains its failed checks and cannot replace the confirmed city.
Imported and stored polygons go through exactly these checks, regardless of any
checksum. Finite schema bounds are checked before clipping/allocation. Polygon
triangulation, pointer-boundary subdivision, history, plan count and file sizes have
explicit bounds. Source elevations cannot be supplied in a scenario file.

Passing checks means **geometric eligibility within this prototype only**. It says
nothing about cadastral ownership, heritage restrictions, underground infrastructure,
structural capacity, construction permission, legal availability or engineering
feasibility. The display terrain is sampled at 16 m and cannot resolve kerbs, quay
structures or accessible detailed grades. No such facts are inferred.

## Explicit transport connection

A selected surface lists affected source way/section IDs. The player can choose
**Apply local + servicing access**: the existing `local` rule on the entire verified
section, in its original mapped directions, retaining the player's current assumed
capacity multiplier (default 1). This is a clear,
explicit hypothetical game rule, not an inferred real restriction or proportional
capacity effect. The existing Street operations tool can then tune/remove it.

Drawing, resizing or removing a surface alone never changes traffic access/capacity.
Removing a surface retains separately chosen street edits, with an explanatory
notice; undo or restore those edits separately, or **Reset city** to remove both.
The unchanged worker/core computes the resulting detours, traffic redistribution,
travel time, V/C, unrouted demand and emissions proxy. Synthetic demand and every
capacity/speed assumption remain labelled. No pedestrian demand, retail, property,
economic benefit, construction cost or validated CO₂ forecast is added.

The interface separates geometric square metres, synthetic transport results and
unmodelled real-world consequences. Surface area does not improve traffic metrics
or any score by itself.

## Challenge: Transforming the Bryggen Waterfront

Optional objectives: 100–800 m² total valid proposed area; every space within the
8 m proximity band; each modelled road conflict has an explicit non-through access
rule; all synthetic trips routable (including local/servicing); mean through-trip
distance ≤3× baseline; highest period-average directional V/C ≤3. These are game
thresholds, calibrated against the actual limited topology, not Bergen policy limits.
There is no area-maximizing score, no cost/benefit model, and no reward for lost trips.

[The importable example](../../apps/bergen-simulator/public/plans/waterfront-example.json)
contains a 315 m² hypothetical footprint and six explicit street edits. Its footprint
has maximum intersected display grade about 1.95%, is near real modelled roads and
conflicts with `way/9649862:645523:75457133`. It is not a surveyed/approved public
parcel. The northern Bryggen local-access rule creates detours; the other capacity
edits are bounded assumptions that manage congestion in the same engine.

The tested solution routes all 960 trips. It is a feasible **game challenge** solution,
not an optimized transport recommendation. Its longer travel times/detours and
emissions proxy remain visible. An unresolved road conflict, oversized design,
invalid placement or all-roads-closed plan cannot pass. Free experimentation does
not require challenge success.

## Save compatibility and recovery

Scenario file version 2 contains `kind`, `version`, `name`, unchanged transport `plan`
and a `physical` object (`version:1`, geography compatibility ID, up to four proposals).
Each proposal has only `id`, `name`, `kind` and a finite bounded `[X,Z]` vertex ring.
There are no source overrides, user-supplied elevations, cached results or validity
flags. Transport network and geographic compatibility are validated independently.

Version-1 3B files and library records remain valid; opening one creates an empty
physical layer in memory. The local library keeps its original
`bergen.reimagined.plans.v1` key/envelope and may hold both versions. Loading never
writes/migrates/deletes storage. Explicitly saving upgrades that named record to v2;
duplicate preserves its original. Other records remain unchanged. Whole-library
validation, concurrent-tab conflict detection, atomic replacement, maximum 20 plans,
200,000-character library and 32,768-character scenario limits are preserved.
Future/malformed/incompatible/quota-blocked data is retained; an invalid import
cannot change the current city, its history, phase or results. JSON export provides
an independent local recovery copy. No database, backend or authentication is added.

## Evidence and reproducibility

Evidence is in [the 4A evidence directory](milestone-4a-evidence/).
Before/after waterfront cameras: position `[-90,115,-120]`, target `[-40,1,-240]`,
1440×1000 viewport. The geographic/camera setup is the same; surfaces remain a
proposal layer. Browser evidence includes live placement, invalid rejection,
combined traffic results, saved-design comparison, challenge and touch-landscaping.

A real downloaded combined file is retained as `combined-waterfront-plan.json`;
`public/plans/waterfront-example.json` is a second, independently validated example.
The browser journey saves, reloads, restores and reproduces the former, exports and
imports it, compares a duplicated alternative, rejects malformed geometry without
losing results, opens a 3B file, then removes/resets the proposal.

Reproduce from the app directory, sequentially to avoid CPU/rendering contention:

```sh
npm ci
npm run lint
npm test
npm run check:isolation
npm run build
npm run preview -- --host 127.0.0.1
# Separate terminal; run each browser command after the preceding one finishes:
npm run test:physical-baseline
npm run test:physical
npm run test:scenario
npm run test:browser
npm run test:visual
```

`test:physical-baseline` archives exact commit e047904 in a temporary directory,
links the same installed dependencies, builds and serves it on port 4181, runs its
3B browser harness (with an asynchronous-import completion wait and elapsed-load instrumentation only) and captures the fixed waterfront camera. It never
checks out another branch, modifies a source snapshot or touches a deployment.
The current localhost-only capture probe adds no idle loop or hosted access bypass.
Authoring regressions also run offline with `python tests/importer.py` using the
existing `scripts/requirements-geo.txt` environment.

The final validation and performance record follows the source/scope notes below.

## Geographic sources and scope

No geographic input was refreshed. Footprints, original road/node identities,
coast and lakes remain © OpenStreetMap contributors, ODbL. Terrain remains the
existing Kartverket/Høydedata project DTM, CC BY 4.0, acquired 2022/2023 with NN2000
vertical datum and the existing coordinate transformations/provenance hashes.
See [data sources](data-sources.md). Screenshots use those credited sources; proposed
colours/footprints are authored hypothetical designs, not new observed facts.

Future work should begin with a similarly bounded conceptual building-placement
layer: explicit dimensions/height assumptions, collision validation and reversible
visibility. Hypothetical demolition must preserve observed building records and IDs.
Land-use categories can then share the scenario schema. Engineering/legal, pedestrian
and financial effects require separately reviewed data/models; no database or national
GIS redesign is needed for the next slice.

## Final validation and performance

All checks passed: standalone TypeScript/Vite build; ESLint; 71 Vitest tests plus 10 release-policy tests; isolation; three offline Python geographic tests; actionlint; complete physical desktop/touch journey; complete 3B street journey; explorer/error/high-DPR/mobile checks; four fixed geographic views; and archived-baseline reproduction. The unchanged Three.js chunk still exceeds Vite’s 500 kB warning threshold.

Chromium 151 / ANGLE SwiftShader, DPR 1, desktop 1440×1000 and touch/mobile 390×844. Active-camera samples use the same 14 movements, discard two warm-ups and retain 12; captures run sequentially. Baseline and current use their validated example plans. These are observed browser workloads, not an isolated GPU benchmark.

| Measurement | 3B baseline | 4A |
| --- | ---: | ---: |
| Active draw calls | 7 | 9 |
| Active triangles | 289,336 | 289,358 |
| Active GPU geometries | 7 | 9 |
| Desktop median camera command latency | 442.9 ms | 376.4 ms |
| Desktop p95 camera command latency | 488.6 ms | 482.2 ms |
| Desktop initial canvas readiness (one load) | 2991 ms | 3589 ms |
| Mobile median camera command latency | 135.6 ms | 191.3 ms |
| Mobile p95 camera command latency | 164.3 ms | 226.2 ms |
| Mobile initial canvas readiness (one load) | 2050 ms | 2043 ms |
| Static idle frames | 0 | 0 |

The visible 315 m² proposal contributes 22 triangles and 34 dashed line pieces in two merged passes. Editing adds one instanced handle pass. Reset/exit returns to five draw calls **and five GPU geometries**, checked in the browser. No obsolete proposal/draft/traffic buffers remain attached. Four proposals still share the same two surface/boundary passes.

Mobile software-renderer camera latency increased; desktop timings varied in the opposite direction. Do not infer a hardware speed improvement, physical-device frame rate or GPU-completion timing. The probe measures command-to-render/CPU submission, and automation/software rendering affects it. Hardware testing, especially mobile, remains outstanding. Initial readiness is a single load per viewport, not a robust load-time benchmark.

Synthetic worker computation in the recorded physical journey took about 43–46 ms (engine stepping only, excluding initialization, playback and display). The 200-placement unit guard checks bounded execution, not hardware speed. Baseline/current source geometry and payloads are unchanged. Main JS grew 267.67→292.03 kB raw (84.54→91.77 kB gzip); lazy Three.js scene 910.92→915.88 kB (243.23→244.94 kB gzip). The worker bundle remains byte-identical at 8.06 kB; no dependency was added.

All 1,473 tracked files outside the simulator and its documentation match the pre-task hashes, including every workflow. Geographic snapshots and import scripts match e047904. The main branch, production connections, environment settings and Fellestall Vercel project were not changed. Release status and the new commit/Actions URL are provided with the deployment report.
