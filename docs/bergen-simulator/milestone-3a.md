# Milestone 3A — first playable Bergen planning scenario

## What the player can do

Open **Plan Bryggen traffic**, take the planning desk, select a policy and run a
30-minute synthetic traffic period. Pause/resume, inspect mapped roads, switch the
3D overlay between baseline and intervention, toggle intensity, reset and try
another decision. A short decision readout explains the calculated trade-off.
The existing city navigation, geographic inspection, source attribution and
rendering controls remain available. Everything runs locally in the browser.

The first playable slice intentionally has no construction, budgets, population,
politics, accounts, persistence, moving-car agents or backend/database.

## Observations and topology

The unchanged geographic snapshot and the same 30 hash-pinned OSM XML tiles supply
27 ways, 151 original node coordinates, 26 graph junction/end nodes and 54 directed
edges (31 physical strips). © OpenStreetMap contributors, ODbL 1.0. There is no new
geographic acquisition. Coordinates are WGS84, projected by the existing local
metre transform; overlay heights sample the unchanged Kartverket-derived TIN.

Bryggen uses `way/9649862` and `way/488690111`, between original nodes `75457133`
and `645599`, through `645523`. Detours use Slottsgaten → Sandbrogaten → Øvre
Dreggsallmenningen → Dreggsallmenningen → Øvregaten, and mapped one-way links
through Finnegårdsgaten / Rosenkrantzgaten / Vetrlidsallmenningen / Bryggesporden /
Torget. Lodin Lepps gate, Rosenkrantzgaten and Nikolaikirkeallmenningen add the
mapped inbound local-access branch. Exact ways, node references, tags and source
hashes are in [the redistributed extract](../../apps/bergen-simulator/public/data/bryggen-transport.json).

Only shared original OSM node IDs create junctions. No snapping, crossing-line
joins, invented connectors, bridges or tunnels. Mapped one-way directions are
retained. All six OD entries are routable in the baseline. The complete pinned
cache contains no restriction relations involving these selected ways; that does
not certify real-world legal turns, traffic signs or access. Unsupported direction,
access, grade separation, duplicate/missing nodes, repeated-node ways and degenerate
geometry fail validation. The importer refuses future relevant restriction relations.

The pedestrian scenario's 80 outbound local trips have no permitted route within
this model. In the full eligible cached surface motor-road graph, no outbound
path from node `645523` to `75457133` was found with Bryggen removed either. We do
not infer a connection through nearby cycleways/footways. This is an OSM/model
boundary limitation, **not proof of real-world inaccessibility**. Other city routes,
signals, parking, public transport and delivery arrangements are not represented.

## Deterministic model and explicit assumptions

`simulation/engine.ts` is independent of React, Three.js, Zustand and I/O. One
30-second tick assigns synthetic vehicle-equivalent trips to permitted shortest
paths; 60 ticks represent 30 minutes. There is no randomness, so no seed is needed.
Identical inputs give identical outputs. Array ordering and tie-breaking are fixed.
Baseline and policy run in lockstep in a Web Worker; wall-clock playback never
changes model time. Workers terminate on completion, reset, policy change or exit;
late messages from cancelled workers are ignored.

Each quiet tick requests 12 trips: 4 through north→south, 4 through south→north,
1 local north→middle, 1 local middle→north, 1 servicing north→middle and 1 servicing
middle→south. Demand doubles during model minutes 10–20. Total **960 synthetic
trips**, unaffected by policy. These are not measured counts or calibrated OD flows.

| Policy | Assumed access on Bryggen | Consequence mechanism |
| --- | --- | --- |
| Baseline | All three synthetic categories | Common routing costs, mapped directions |
| Restricted through-traffic | Local and servicing only | Through-trips choose permitted mapped detours |
| Pedestrian priority | Servicing only | Through/local trips detour or become explicitly unrouted |

These are game policy assumptions, not claims about current legal restrictions,
actual local residents, emergency services, bus access or enforcement.

Free-flow speed is assumed **20 km/h** throughout. Directional capacities are
assumed **600/420/300/250 vehicles/hour** for primary/secondary/tertiary/other roads.
Trips assign incrementally within each tick using the same costs for every policy.
Travel cost follows `length / speed × (1 + 0.15 × min(4, V/C)^4)`. This bounded
BPR-style assignment is not a queue, spillback, vehicle movement or equilibrium
model. Per-tick assignment order may affect routes; it is reproducible, not calibrated.

Travel time totals are vehicle-minutes. The emissions burden is
`vehicle-km × [1 + 0.2 × max(0, V/C − 0.6)^2]`, indexed against baseline = 100.
It is an arbitrary distance/congestion proxy, **not grams of CO₂ or an emissions
forecast**. Travel time and emissions include routed trips only; lost access must
not be interpreted as efficiency. Detours use mean through-trip metres. The map
uses the worse directional **period-average** V/C per physical strip, saturated
visually at 1.5; it is not a real-time traffic observation or peak-hour forecast.

For this exact synthetic setup, restricted through-traffic changes Bryggen passages
940→320 and mean through distance 337→932 m, while travel time increases
1,938→10,532 vehicle-minutes. Pedestrian priority reduces Bryggen passages to 160,
leaves 80/960 trips unrouted and increases routed travel time to 15,811 vehicle-minutes.
These demonstrate model trade-offs, not recommendations for Bergen.

## Visual acceptance evidence

Fixed geographic cameras are unchanged from 2A. The original pre-implementation
capture on clean `e068704` is retained as `preimplementation-metrics.json`; the
before set was also reproduced from a disposable read-only archive of that commit.
The existing geographic JSON, original source archives, manifest, terrain metadata
and dependency lockfile remain byte-identical.

- [Before city overview](milestone-3a/before/overview.jpg) / [after](milestone-3a/after/overview.jpg).
- [Before Vågen](milestone-3a/before/vagen.jpg) / [after](milestone-3a/after/vagen.jpg).
- [Planning state](milestone-3a/scenario/01-planning.jpg).
- [Restricted policy](milestone-3a/scenario/02-restricted.jpg) / [baseline comparison at the identical camera](milestone-3a/scenario/03-baseline-comparison.jpg).
- [Pedestrian policy and access loss](milestone-3a/scenario/04-pedestrian.jpg).
- [390px mobile map](milestone-3a/scenario/05-mobile-map.jpg).

The browser test asserts changed canvas pixels under baseline/policy comparison
while checking identical camera vectors. It also picks a mapped Bryggen road
through the merged traffic mesh and verifies its original OSM identity in the
inspector. The evidence manifest records SHA-256 inputs and capture artifacts.

## Tests and performance

Passed: 30 Vitest tests, 10 release-policy tests, 3 offline Python geographic tests,
ESLint, TypeScript/Vite build, isolation check and actionlint on the unchanged
simulator workflow. Coverage includes determinism/reset, node-by-node conservation,
nonnegative/fully accounted demand, permitted routes, disconnected/coincident nodes,
source immutability, bounded execution/memory, stale worker rejection and rendering
colours/draping. Source extraction reproduces byte-identically from pinned inputs.

Existing explorer browser coverage passes navigation, selection/inspection, layers,
quality settings, source panel, missing-data failure, mobile and high-DPI caps.
The new end-to-end test passes policy/run/pause/resume/complete/compare/reset/repeat,
road-overlay inspection, overlay disposal, mobile and explicit missing-network error.
The complete scenario also passes under the unchanged Vercel Content Security
Policy, including module-worker loading. No external runtime services or browser
runtime errors were observed.

| Measurement | Explorer | Active completed scenario |
| --- | ---: | ---: |
| Settled draw calls | 5 | 7 |
| Triangles | 288,140 | 288,846 |
| Resident geometry buffers | 5 | 7 |
| Paused/complete idle frames | 0 | 0 |
| Desktop median camera probe latency | 401 ms | 443 ms |
| Desktop p95 camera probe latency | 692 ms | 497 ms |
| 390px low-power median camera latency | 159 ms | 138 ms |
| 390px low-power p95 camera latency | 190 ms | 179 ms |

These use 12 samples after two warm-up movements at the same scenario camera,
Chromium 151 / ANGLE **SwiftShader**, desktop 1440×1000 DPR1 balanced and mobile
**viewport emulation** 390×844 DPR1 low. They do not establish physical-device FPS,
GPU time or a performance improvement. Variation in the tails is not evidence of
an optimization. Fixed overview tests separately measured a 503 ms median on the
archived pre-3A build and 543 ms after; the pre-implementation sample was 509 ms.
Camera latency on this software renderer remains a limitation.

Both engines together used roughly **47–53 ms total worker calculation time** for
60 ticks in the recorded runs; accelerated playback deliberately spans about six
seconds plus browser scheduling. Sampled scene render-submission CPU time was 0.5–0.7 ms median;
this excludes GPU completion and is not an isolated overlay measurement.
No continuous loop animates static states. Traffic adds only 706 triangles and
two merged basic-material passes. Shadows and DPR safeguards remain unchanged.
The worker bundle is 5.94 kB; the existing ~910 kB lazy Three chunk still produces
Vite's chunk-size warning. No dependency was added.

Reproduce with a running preview on port 4180:

```sh
npm run lint
npm test
npm run check:isolation
npm run build
npm run test:browser
npm run test:scenario
npm run test:visual
npm run test:scenario-baseline  # disposable e068704 archive on 4181
python scripts/import-transport.py  # requires the original pinned XML cache
```

The independent Python geography regressions also require the existing pinned
`scripts/requirements-geo.txt` environment. Do not run benchmarks concurrently.

## Isolation and release

Work is confined to `feature/bergen-simulator`, application files and simulator
documentation. All 1,473 tracked files outside these folders match their initial
hashes, including every workflow and Fellestall production file. No database or
production environment values were read. Existing geographic data is unchanged.
The existing branch-filtered Bergen Actions pipeline is the sole release path;
its project/team checks, staged promotion and Authentication checks are unchanged.
Only the existing Bergen project is authorized. Release status is reported with
the triggering commit and Actions run after push; main and Fellestall remain isolated.

## Next gameplay iteration

3B should extend the audited network/access boundary, introduce versioned local
scenario save/replay and a demand/capacity sensitivity challenge. Validate traffic
signs and turn restrictions before describing access as representative. Seek real
traffic data and calibrate only in a separately reviewed modelling step. Physical
mobile/desktop profiling and moving mesh preparation away from the UI remain
priorities before adding animated agents. Budgets and nationwide systems stay later.
