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
