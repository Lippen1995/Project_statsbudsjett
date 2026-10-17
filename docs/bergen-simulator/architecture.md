# Architecture and initial repository assessment

## Assessment before implementation

Baseline: `3ff897f4a21372b05cd732df54843605bb2e6593`, recorded in `baseline.json`.
The clean checkout initially had a local `work` branch. Development moved to
`feature/bergen-simulator` before any repository file changes.

Fellestall is already Vite/React, not Next.js. `web/package.json` declares React 19,
Recharts 3 and Vite 8; JavaScript/JSX sources live under `web/src/`. Its custom
build generates sitemap and SEO fallback content and renders analysis pages.
Python ETL under `etl/` prepares static data. Root npm scripts delegate frontend
builds to `web/` and contain Neon and deployment tooling. Node 24 is the baseline.

Neon uses `@neondatabase/serverless`, `@neon/config` and `@neon/env`, with config
in `neon.ts`. `scripts/neon/` stores compressed, versioned files in the
`fellestall_data` schema and verifies export hashes before activating a snapshot.
GitHub Actions obtains production connections in a protected environment during
publication. The frontend consumes exported static files; Neon is not a client-side
database integration. No Neon commands or remote database operations were used here.

`deploy.yml` builds on `main`, publishes to `gh-pages` and calls the Vercel mirror.
`vercel-mirror.yml` uploads the same static output into the existing `fellestall`
project, with a `main` guard. Neither workflow has been edited or invoked. Existing
Neon variables, deployment settings, DNS and production project remain untouched.

Reuse opportunity: repository history, Node/npm familiarity, Vite/React practices
and later explicit data contracts. Reusing runtime modules, root package scripts,
Neon branches, secrets or publication workflows would introduce unnecessary coupling.
The selected boundary is two new folders with independent package ownership.

## Directory structure

```text
apps/bergen-simulator/
  package.json, package-lock.json   # independent dependencies
  vite.config.ts, tsconfig.json     # ignores all env files
  vercel.json                      # separate static build; Git deployment disabled
  src/
    App.tsx, main.tsx, styles.css   # accessible HTML UI and failure states
    components/                    # scene, camera controls, inspector
    geo/                           # types, validation, projection, mesh generation
    state/                         # transient Zustand state
  public/data/                     # versioned geography and source manifests
  scripts/                         # opt-in importer and isolation checker
  tests/                           # Vitest and local Chromium verification
  dist/                            # ignored; this app's build only
docs/bergen-simulator/
  product-spec.md, architecture.md, roadmap.md, data-sources.md
  development-rules.md, deployment.md, validation.md, baseline.json
```

No npm workspace conversion or root build changes. No imports escape the application.
Vite's `envDir: false` disables `.env` loading; the client reads no environment values.
The static app fetches only its own `/data/bergen.json`. Geographic services are
authoring-time inputs, never browser dependencies.

## Geographic model

WGS84 input becomes a local equirectangular metre grid around the bounding-box
centre, 5.3235 E / 60.395 N. X=east, Y=up, Z=south. This approximation is suitable
for a ~3 km view; it is not the future national GIS coordinate system. Elevation
uses decoded Terrarium tiles at native metre scale. No vertical exaggeration.

OSM coastline orientation identifies land. A 16 m display grid is clipped to the land
polygon, preserving the actual coastal boundary, then triangulated. Mapped inland
water polygons cut holes in the terrain. Roads fit both strip edges to the rendered TIN along observed centrelines. Widths use valid source tags or explicit class assumptions; unresolved bridge decks are omitted while source records remain. Buildings extrude mapped
polygons, preserve courtyard holes and connect a flat sampled height reference to terrain with schematic skirts. Explicit total/roof heights permit conservative gables; unknown roof geometry stays simplified. Storey-derived heights are explicit estimates; absent height/storey data stays null and renders as a footprint. Relations with incomplete
geometry are excluded rather than invented.

## Rendering and state

React Three Fiber owns Three.js resource lifetime. Terrain, buildings and streets
are batched; triangle ranges map pointer selection back to original OSM IDs. No
per-building React components or animation loop. All water surfaces share one batch. Balanced mode uses a fixed 1024px directional shadow map, updated only for scene/layer/quality changes; low power disables shadows. Water tonal detail is static, without an animation loop. Demand rendering,
bounded camera travel and a 1–1.5 device pixel ratio limit work. Low power mode
uses DPR 1. Camera controls are Three.js OrbitControls, with keyboard alternatives.
GPU buffers are disposed on replacement/unmount.

Zustand holds visibility, selected source feature, camera commands and quality.
No persistence or network state mutation. The renderer loads lazily so the HTML
interface and failure messages can appear first. Error boundaries and snapshot
validation prevent a broken GPU or data file from silently substituting a city.

## Growth without coupling

Future modules should separate geographic source records, presentation geometry,
simulation state and scenario policy. Start the engine as a deterministic pure
TypeScript module, then move heavier ticks into a worker. Only introduce packages
shared across municipalities once a second real consumer exists. A future database
must be a dedicated simulator development project with synthetic game state and
independent credentials. Do not branch from or connect to Fellestall production.

Later Fellestall integration should begin as a link to this separately hosted app.
Sharing authentication, embedding it or moving it under a common domain requires
a separate reviewed integration milestone, with versioned read-only fact exports,
failure boundaries and independent release/rollback paths.

## Milestone 2A geographic processing

`refine-geography.py` reads the fixed pre-2A snapshot from Git history, verifies cached source hashes, imports an explicitly restricted Kartverket project DTM crop, and retains the original OSM land mask and feature identities. `terrain-source.json` records licensing, dates, coordinate systems and NN2000. OSM landcover comes from the existing pinned inputs. Rendering helpers separate conservative roof interpretation (`roofs.ts`), barycentric TIN sampling (`surface.ts`) and batched geometry. A localhost-only capture probe supplies reproducible cameras and diagnostics without affecting hosted authentication or adding an idle render loop. See [milestone evidence](milestone-2a.md).

## Milestone 3A — bounded traffic simulation

The active application additionally fetches its own static
`/data/bryggen-transport.json` when the player enters the planning scenario.
`simulation/network.ts` validates a 27-way ODbL extract and builds a directed graph
using shared original OSM node IDs and observed one-way tags. Display geometry is
never used for topological snapping. `scripts/import-transport.py` requires the
complete, unchanged 30-tile source cache and refuses relevant turn restrictions
that would need additional handling. Terrain/feature snapshots remain unchanged.

`simulation/engine.ts` contains deterministic 30-second assignment ticks, bounded
Dijkstra routing, common congestion costs, policy permissions and conservation
accounting. It imports no UI, rendering, database or network libraries. There is
no stochastic input and therefore no seed to configure. All demand, capacity,
speed and policy access settings are explicitly assumed. It is a small planning
game model, not a traffic forecast or a microscopic simulation.

`simulation/worker.ts` owns baseline and intervention engines, advanced in lockstep
against identical synthetic OD inputs. Wall-clock scheduling controls playback
only; it never enters model calculations. Progress is sent every five ticks and
at pause/completion. A fresh worker starts each run; reset, policy change and exit
terminate it. Identity checks discard stale messages. State copies prevent workers
or result inspection from mutating source geography.

`state/scenario.ts` separates transient scenario state from geographic selections.
`ScenarioPanel` supplies policy/play/pause/reset/comparison and accessible results;
`TrafficOverlay` merges the corridor and intensity ribbons into two bounded draw
passes. Both reuse the rendered terrain sampler. Opposing directions share one
strip coloured by their worse period-average V/C; full source IDs remain selectable.
No continuously animated vehicles, lights or render loops are introduced. See
[the exact assumptions and acceptance evidence](milestone-3a.md).

## Milestone 3B — planning sandbox

The transport engine now accepts a versioned `Plan`, not global policy choices.
`simulation/interventions.ts` identifies 31 physical road sections from the 54
original directed edges. A section key consists of its OSM way and sorted endpoint
node IDs. Access/capacity edits affect existing mapped directions only; they cannot
create a junction, reverse a one-way street or change coordinates. Plans normalize
no-op edits and reject duplicate, unknown or contradictory settings. `applyPlan`
clones the model graph; the observed snapshot and original source tags are immutable.

The plan has its own schema version and baseline-network compatibility checksum.
The checksum includes original edge identities, node references, rounded geometry
and assumed capacities; it is not a cryptographic signature. Strict validation of
IDs, fields, access enums and discrete capacity multipliers is the trust boundary.
Model assumption or topology revisions require a reviewed compatibility-version
change and explicit migration; there were no persisted scenarios in 3A to migrate.

The worker evaluates the original baseline, working plan and optional saved
reference against the same fixed demand in lockstep. Outcomes are never loaded
from saved files. History changes and imports stop the worker, clear derived results
and discard late replies. The bounded 51-frame history stores plan data only.
`corridorThroughTrips` distinguishes through travel from all Bryggen passages.
Challenge scoring is derived separately from raw results, with accessibility loss
always scoring below any fully routed plan.

`planning/scenarios.ts` validates named JSON exports and the versioned local library.
Only `bergen.reimagined.plans.v1` is read/written; up to 20 plans fit a bounded key.
Writes validate the entire library, reread other-tab additions, reject conflicting
updates, then atomically replace that key. Broken, future-version, quota-blocked or
incompatible storage is preserved. Export remains a recovery path. Names/timestamps
and random local record IDs are metadata, excluded from deterministic model inputs.
No authentication, database or remote save service is introduced.

The scene's merged road meshes and a two-pass model overlay resolve pointer hits
to source way/section identities. Unsupported roads remain geographic selections
with an explicit inspect-only readout. Teal outlines show editable sections; dashed
proposal colours encode hypothetical edits. Selection and traffic intensity share
these batches, without per-road React meshes. The main terrain sampler, demand
rendering, DPR caps and independent release architecture remain intact.

## Milestone 4A — hypothetical physical public spaces

`physical/polygon.ts` is a small, pure TypeScript geometry kernel: finite simple
rings, bounded ear clipping, ring/segment tests (including courtyard holes), and
convex clipping. `physical/model.ts` builds a read-only placement context from the
unchanged city snapshot. It clips every proposed triangle against overlapping
rendered TIN triangles. Coverage area and maximum intersected TIN grade establish
placement eligibility; barycentric lifting produces the exact surface geometry.
Corner-only sampling cannot approve a footprint over an interior water/terrain gap.

The context filters TIN/building candidates to a small authoring window. Placement
also checks mapped coast, inland water, observed building rings, proposal overlap
and proximity to verified transport sections. A compatibility checksum covers all
placement-relevant records. It is not a security signature: schema and geometric
revalidation against the loaded snapshot are required regardless of the checksum.
Numeric limits and their meaning are documented in [the 4A specification](milestone-4a.md).
No parcel ownership, heritage, utility, permission or engineering data is inferred.

`state/physical.ts` owns an unapplied, bounded authoring draft. Terrain raycasts
translate pointer/touch taps into proposed coordinates; handles can be dragged on
the TIN. The same coordinates can be edited with keyboard-friendly numeric inputs
and metre-step buttons. Camera navigation is explicitly available while drawing.
An invalid preview never replaces a confirmed surface. Application commits both
street and physical data into one bounded scenario history; results are invalidated
and the transport worker stopped. Drafts are excluded from saves and simulations.

`PublicSpaces` renders clipped surfaces and dashed boundaries in two merged passes,
plus one instanced handle pass while editing (maximum eight handles). Replaced
geometries/materials are disposed. No source triangle, building or road is edited;
no shadow, animation loop, excavation or demolition is added. The transport worker,
fixed ticks, routing engine and all existing synthetic parameters are unchanged.

Version-2 scenario exports add a version-1 `physical` object alongside the unchanged
version-1 transport `plan`. Version-1 3B exports remain valid. The library keeps its
original version/key and can contain both file versions. Legacy records are read
without rewriting them; opening a legacy record creates an empty physical layer in
memory. Only an explicit save writes a version-2 record. The existing whole-library
validation, bounds, atomic write, quota handling and other-tab conflict checks remain.
Physical imports and library records require the matching geographic context and
pass every placement constraint before replacing any current state.

Road proximity is a conflict warning, not a traffic effect. The player may explicitly
apply the existing `local` model rule to a conflicted **whole verified section**,
preserving assumed local/servicing categories, the current capacity multiplier and
original mapped directions.
This is an ordinary, separately undoable street edit; removing a surface retains
that explicit traffic decision until the player restores it. No partial-section
capacity, pedestrian-demand or economic effect is invented.

## Milestone 4B — reversible conceptual construction

`physical/buildings.ts` derives bounded rotated rectangles and validates them through
the existing TIN/OSM constraint context, with additional building relief, clearance
and road-corridor checks. It remains pure TypeScript. `state/construction.ts` owns
unapplied direct-manipulation drafts; `state/scenario.ts` keeps all three confirmed
layers in one bounded undo/redo history. Construction-only edits retain traffic
results and do not alter the worker engine or demand. `geo/development.ts` batches
all proposed building bodies/roofs into one mesh and edges into one additional pass;
`ProposedBuildings.tsx` handles terrain picking, bounded handles and resource disposal.

Scenario version 3 adds a version-1 development wrapper containing strict numeric
parameters, never imported meshes, terrain or validity flags. Version-1/2 scenarios
remain readable and their saved bytes are untouched until an explicit save. All
layers are validated together before applying an import or replacing storage.
See [4B contracts, assumptions and evidence](milestone-4b.md).

## Milestone 5A — monthly living district

`district/model.ts` and `engine.ts` define a pure deterministic stock-flow system for
proposed buildings only, with strict versioned coefficients, immutable owned inputs,
monthly demand queues, turnover, bounded recruitment/admissions and service use.
The independent district worker holds at most two 25-month histories for current and
saved designs. Generation and worker-identity guards reject stale results; validated
replies enforce stock/flow and capacity invariants. Construction/input changes reset
the district to identical month-zero stocks. The existing traffic worker and source
graph remain unchanged and uncoupled because no site entrance is verified.

Scenario version 4 adds version-1 living coefficients. Legacy versions 1/2/3 are
read without storage writes and initialize defaults in memory. Results, elapsed
months and completion flags are never imported or saved. Coefficients join the
existing bounded shared history. The proposed-building renderer updates its existing
vertex colour attribute on visible monthly changes; no additional passes, meshes,
agents or continuous rendering are introduced. See [5A equations and contracts](milestone-5a.md).

## Milestone 5B — managed construction and public services

`management/` contains independent pure TypeScript contracts, a monthly construction
state machine, integer-subunit capital/operating accounts and reconciliation checks.
The district worker commissions projects and funds effective civic capacity before
running the existing household/job recurrence. A full civic capital reservation is
required before work; installments spend that reservation, cancellations retain sunk
expenditure, and insufficient capital defers the actual start. Potential commissioned
services and operating-funded services are separate quantities.

Scenario version 5 adds version-1 management inputs, never trusted dates, balances,
results or completion flags. Legacy versions 1–4 initialize an explicit immediate
contract and keep the original version-1 district calculation/output path. An explicit
player action converts to schedules; source design and old library bytes are retained.
Management joins the existing shared history and worker generation invalidation.

The existing two building batches render planned/cancelled outlines, subdued work
massing and operational activity through reusable index/colour buffers. Indexed faces
map back to original per-proposal ranges; outlines remain selectable. No source mesh,
extra per-building React tree, continuous render loop or transport coupling is added.
See [5B contracts, units and evidence](milestone-5b.md).


## Milestone 5C boundaries

Observed-city batching now runs in a bounded one-shot geometry worker (protocol v1),
with transferable attribute buffers, validated source-ID pick ranges and explicit
cleanup/cancellation. Rendering remains demand based. District, construction, finance
and traffic contracts are unchanged; scenario version 5 remains current. A read-only
site-access boundary reports unverified access and zero added trips. The source-audited
48-way candidate remains offline until access/boundary/turn review supports activation.
See [5C architecture and audit](milestone-5c.md).
