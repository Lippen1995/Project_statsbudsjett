# Milestone 4B — Building Placement & Urban Development

Baseline: `d9ab083387da97181ea5ed7e0ed56a1676a2669b` (4A). Only
`feature/bergen-simulator`, the standalone app and simulator documentation change.
No geographic records, transport engine, workflow or production settings change.

## Playable construction

Enter Planning Mode → **Buildings** → choose **Residential**, **Commercial** or
**Civic**. Tap verified land to locate a live preview. It is unapplied until
**Apply building** / **Confirm building** succeeds. Move the centre handle, rotate
using the forward handle or resize using the corner. The corresponding map tools
also enable dragging from the footprint. **Place** relocates by another land tap;
**Navigate camera** releases orbit/pan/zoom. Mouse and touch share pointer handling.
Numeric coordinates, dimensions, rotation, storeys and storey height provide a
keyboard/touch alternative. Flat and gabled roofs change real scene geometry.

Select a concept directly in 3D or from the bounded proposal list. Edit its form or
intended use without redrawing it, remove it, or remove all proposed buildings.
**Show proposed buildings** hides only construction; **Show observed city** hides
all proposal layers. Current and saved plans compare both in the world and by
floor area, footprint, intended use, storey distribution and retained public space.
Confirmed street, surface and construction changes share a 51-snapshot undo/redo
history. Unapplied construction has a separate 51-state parameter history.

The three uses are artistic proposal categories, not actual tenancies, architectural
materials or official building classifications. Gold edge outlines,
restrained colours and explicit labels distinguish concepts from observed Bergen.
No original structure is demolished, moved or reclassified. No residents, jobs,
rents, prices, taxes, construction costs or induced traffic are calculated.

## Site audit before selecting bounds

The read-only [site survey](milestone-4b-evidence/site-audit.json) screens the existing
pinned snapshot using 12 × 16 m rectangles on an 8 m grid. It checks observed
footprints and water, coast clearance, a hypothetical 6 m buffer around modelled
road centrelines, full TIN coverage, maximum intersected grade and terrain relief.
Grid candidates can overlap; their count is not a count of independent plots.

The original 4A Bryggen window contains enough ground. It is retained unchanged:
X −145…145 m, Z −335…−65 m. Alternative windows were surveyed but are **not enabled**.
The TypeScript acceptance test proves these three separate rectangles plus an
independent 189 m² public-space proposal simultaneously pass all current checks:

| Concept | Centre X, Z (local metres) | Footprint | Storeys | Assumed floor area |
| --- | --- | --- | --- | --- |
| Residential / Quay homes | −95, −317 | 12 × 16 m | 2 | 384 m² |
| Commercial / Quay workspace | −23, −237 | 12 × 16 m | 3 | 576 m² |
| Civic / Community pavilion | 9, −213 | 12 × 16 m | 2 | 384 m² |

The centres use the unchanged east-X/south-Z local projection from 5.3235° E,
60.395° N. These are **hypothetical design-study sites**, not claims that historic
waterfront land is vacant, available, buildable or approved. Parcels, heritage
rules, utilities, existing uses, ownership and permissions are unknown. The
16 m display TIN cannot establish detailed engineering suitability.

Reproduce the survey from the app with the pinned geo requirements environment:
`python scripts/audit-building-sites.py`. It writes only ignored artifacts. The
source hashes in the report bind it to the exact unchanged geographic inputs.

## Geometry and validation

`src/physical/buildings.ts` contains pure deterministic TypeScript, independent of
React and Three.js. A rotated rectangle is reconstructed from bounded parameters;
no arbitrary imported polygon or mesh is accepted. The existing 4A validator clips
the complete footprint against the source TIN and preserves holes in observed
building/water polygons. Construction adds stricter slope/relief and clearance
checks. Cross-layer validation works in both directions: a later public-space edit
cannot overlap a confirmed building either.

| Check | Inclusive bounds / rule | Prototype reason |
| --- | --- | --- |
| Width / depth | 6–30 m / 8–30 m | Useful small city-scale concepts; bounded geometry |
| Horizontal area | 48–600 m² | Excludes microscopic slivers and oversized blocks |
| Rectangle complexity | Four derived corners; rotation 0≤r<360° | Stable direct manipulation and predictable intersections |
| Storeys / floor height | Integer 1–6 / 2.8–4 m | Explicit player assumptions, controlled height range |
| Total height | ≤26 m including a fixed assumed 2 m gable rise | Bounded conceptual massing, not a statutory height limit |
| Count | Maximum eight buildings | Bounded import, validation, history and rendering work |
| Terrain | Full clipped area within 0.001 m² tolerance | Prevents spanning water or missing land, even between corners |
| Maximum TIN grade | ≤10% | Rejects steep coarse terrain; not a foundation/accessibility standard |
| Elevation relief | ≤1.5 m across all intersected vertices | No excavation, stepped floors or engineered foundations |
| Observed buildings | No collision; >0.25 m ring clearance | Preserve pinned source footprints and courtyard boundaries |
| Coast / inland water | No intersection; >0.25 m boundary clearance | Preserve source shorelines and holes |
| Proposed public space | No collision; ≥0.25 m separation | Prevent contradictory overlapping design layers |
| Other construction | No collision; ≥1 m separation | Simple, unambiguous conceptual forms; not a fire/access code |
| Protected modelled roads | ≥6 m from the original centreline | Assumed corridor; actual road widths and entrances are unknown |

Validation failures explain the conflicting source building/road ID where available.
The original 27-way topology and mapped directions are untouched. Roads outside
that audited transport model are not comprehensively assessed for building access.
Proximity is not a verified entrance, a walkable connection or a legal right of way.

The conceptual ground floor sits 0.08 m above the maximum terrain height clipped
by the footprint. A sampled contact skirt follows the actual ground; the floor
remains horizontal. No terrain is flattened or excavated. This is schematic
massing, not structural design or a statement about foundation feasibility.

Gross floor area is `width × depth × storeys`, without deductions for walls,
circulation or roof shape. It is an **assumption**, not a surveyed usable area.
Height is `storeys × assumedStoreyHeight + roofRise`. Conceptual volume adds the
rectangular storey volume and, for gables, half the footprint times the 2 m rise.
Development area is reported separately as footprint and assumed gross floor area.
Public-space area uses its actual proposed polygon, not a benefit forecast.

Construction changes no transport demand, capacity, access or simulation rules.
Existing traffic results survive construction edits and construction-only undo/redo.
Explicit street edits still invalidate and recalculate the deterministic worker
simulation exactly as before. Opening/importing a combined file restores only its
explicit traffic edits. No unsupported land-use-to-demand model is introduced.

## Versioned scenarios and safe persistence

The outer scenario advances to **version 3**:

```text
kind: bergen-reimagined-plan
version: 3
name
plan: existing version-1 operational road contract
physical: existing version-1 public-space contract
development: { version: 1, geographyId, proposals: BuildingProposal[] }
```

Each building contains only `id`, `name`, `purpose`, `center: [east,south]`, `width`,
`depth`, `rotation`, `storeys`, `storeyHeight`, and `roof`. The development wrapper
versions this parameter contract independently. Heights, vertices, materials,
meshes, source overrides, derived metrics and validity flags are not trusted inputs.
Unknown keys, non-finite numbers, incompatible geography, duplicate identities,
malformed last items and any geometric conflict reject the entire import before
state changes. File/library bounds remain 32,768 characters per imported scenario,
20 saved plans and 200,000 characters per local library; the upload is also bounded
before reading its contents. The existing atomic local-storage key and envelope
remain `bergen.reimagined.plans.v1` / envelope version 1.

| Existing format | Read behavior | Write behavior |
| --- | --- | --- |
| 3B / scenario 1 | Revalidate original traffic contract; initialize empty spaces/buildings in active memory | Original saved bytes untouched on load; explicit save emits scenario 3 |
| 4A / scenario 2 | Revalidate original physical and traffic contracts; initialize empty buildings in active memory | Original saved bytes untouched on load; explicit save emits scenario 3 |
| 4B / scenario 3 | Revalidate all layers against the actual source snapshot and each other | Strict bounded parameter-only scenario 3 |

The [combined example](../../apps/bergen-simulator/public/plans/urban-quarter-example.json)
contains all three uses, the 189 m² public space and an explicit inherited local-access
street edit. Importing it is a player choice; its traffic outcome is calculated,
not stored. It has 576 m² total footprint and 1,344 m² assumed floor area.
The browser acceptance export is a separate player-created combined example.

## A New Urban Quarter

The optional challenge evaluates actual valid geometry, not a preselected policy
or fixed outcome table. Goals are 3–6 compatible concepts with ≤700 m² combined
footprint; 1,000–1,800 m² assumed floor area; at least two intended uses; 120–350 m²
retained proposed public space; height ≤18 m and every building within 25 m of a
modelled road. These bands are transparent game objectives, not municipal standards.

The combined example wins through the same validators and metrics used by the UI.
Tests reject oversized volume, missing public space, a single use, invalid placement
and absent access geometry. Maximizing size does not win. Closing roads creates no
extra floor area or challenge reward; traffic accessibility and unrouted demand
remain separately visible in the existing simulation. Success is not development
permission or evidence of real-world public benefit.

## Evidence, performance and acceptance

See the evidence directory for fixed-camera original/developed city views, live
preview, rejected placement, saved comparison, mobile construction, reproducible
browser reports and the accepted player-created export. Commands from the app:

```sh
npm run test:building-baseline
npm run test:buildings
npm test
npm run lint
npm run check:isolation
npm run build
npm run test:physical
npm run test:scenario
npm run test:browser
npm run test:visual
```

The baseline command archives exact `d9ab083`, links the installed dependencies in
an isolated temporary tree, builds it and runs its unmodified 4A browser harness.
The first baseline for this iteration was captured at clean `d9ab083` before edits.
Current tests use the same Chromium, fixed camera probes, viewports and CSP as 4A.
A compatibility profile loads the unchanged 4A public-space example; a developed
profile measures the new combined plan. Warm-up probes are discarded; the report
records 12 settled camera samples per profile. Browser measurements use ANGLE
SwiftShader: they are not physical-device GPU FPS or evidence of hardware gains.

Proposed buildings have one merged body/roof mesh plus one merged edge pass.
An eight-building worst-case gabled set stays below 1,000 triangles and at most
104 line segments (rotation and floating-point edge subdivision are tested). One three-instance handle pass exists only while editing. Public spaces
retain their existing two passes. Replaced CPU/GPU geometries are disposed, and
browser tests check repeated edits and complete exit return to five source
geometries/draw calls. No vehicles, workers or static states add idle animation.

Measured acceptance results are recorded below. Deployment uses the existing protected Bergen pipeline.

### Measured construction acceptance

Chromium 151.0.7922.173, ANGLE SwiftShader; desktop 1440 × 1000 and mobile viewport
390 × 844, DPR 1. No physical device was tested. Load elapsed time is browser
navigation through first captured scene frame, not a cached production Web Vital.

| Settled profile | Draw calls / triangles | Desktop median / p95 camera probe | Mobile median / p95 camera probe |
| --- | --- | --- | --- |
| Exact 4A baseline, 315 m² surface | 9 / 289,358 | 409.6 / 490.8 ms | 265.0 / 572.2 ms |
| 4B with unchanged 4A example | 9 / 289,358 | 417.0 / 465.3 ms | 190.1 / 207.4 ms |
| 4B player development, three buildings + 189 m² space | 11 / 289,524 | 408.3 / 510.4 ms | 200.8 / 254.1 ms |

Initial scene readiness was 3,251 → 3,284 ms desktop and 2,038 → 1,989 ms mobile.
All profiles settled to **zero idle frames**. The developed profile adds two passes;
its total triangle delta also includes the smaller public-space polygon. Compared
within the current run, mobile construction changed the median by +10.7 ms (+5.6%).
The previously recorded 4A mobile median was about 191 ms; the fresh baseline's
much wider tail demonstrates host/software-renderer variability. Neither lower
samples nor changing baseline samples establish a hardware speed improvement.
Physical-device responsiveness remains a required follow-up.

Eight numeric resize commands took median 244.5 ms / p95 255.4 ms through the next
observed frame, including Playwright and software rendering overhead. Six confirmed
edits retained exactly 11 GPU geometries, not an accumulating series. Explicit-GC
JavaScript heap samples changed from 24,683,368 to 24,917,620 bytes (+0.22 MiB);
this is a bounded retention check, not a general proof of leak freedom. Removing
proposals and leaving Planning Mode restores five source geometries and draw calls.
The transport worker bundle remains byte-identical (`worker-BUILedqw.js`).

The new desktop/mobile acceptance journey passed direct world placement, movement,
rotation and resizing; numeric controls, use/roof/storey changes; observed-building
and terrain/water rejection; visible 3D changes; a valid combined public-space plan;
challenge completion; retained traffic outcomes; undo/redo; saved comparison;
save/reload; actual JSON download/import; rejection of arbitrary mesh and malformed
last-building imports; legacy 3B/4A imports; mobile touch placement; viewport fit;
resource disposal and return to the observed city. No external service requests or
browser runtime errors occurred.

## Validation and release isolation

112 Vitest tests, 10 Node release-policy tests and 3 Python geographic-transform tests
passed. Lint, independent build and isolation passed. Browser suites for construction,
4A public spaces, 3B street planning, the explorer and four geographic visual views
passed with no unexpected runtime errors. The existing large Three.js chunk warning
remains; no dependency or geographic-data refresh was introduced.

All 1,473 tracked Fellestall/workflow files outside simulator app/docs match their
pre-iteration SHA-256 hashes. Geographic snapshots and the transport engine are
unchanged from `d9ab083`. Root deployment paths are not touched, and the Bergen
workflow retains its own concurrency group, exact branch/project guards and
Authentication-for-All-Deployments checks. Only the simulator branch is committed
and pushed; no PR or merge is part of this release. Hosted authenticated browsing
requires an authorized Vercel session and is not substituted with a bypass secret.

## Remaining limits and next iteration

The coarse source terrain and incomplete map cannot certify empty land or safe
foundations. Protected corridors use assumed widths; many mapped paths, quays,
parcel boundaries, heritage constraints and utilities remain unmodelled. Rectangular
massing, flat floors and simple roofs are intentional bounds. No demolition,
excavation, new road connection, arbitrary architecture or economic/population
simulation is supported. Larger plans require measured rendering and validation
budgets, not removal of the current limits. Physical-device performance is unverified.

Next: an explicitly reversible redevelopment parcel study with verified parcel and
heritage provenance, conflict-aware land-use envelopes and deliberate hide/restore
of observed buildings as hypothetical demolition. Establish those source and legal
uncertainties before introducing real-world development feasibility claims or a
construction economy. Preserve this separate proposal contract and deterministic
geometry-based objectives as the foundation.

