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

OSM coastline orientation identifies land. A 32 m grid is clipped to the land
polygon, preserving the actual coastal boundary, then triangulated. Mapped inland
water polygons cut holes in the terrain. Roads are terrain-draped strips along
observed centrelines, with schematic class widths. Buildings extrude mapped
polygons, preserve courtyard holes and flatten their base to a sampled footprint
elevation. Storey-derived heights are explicit estimates; absent height/storey data stays null and renders as a footprint. Relations with incomplete
geometry are excluded rather than invented.

## Rendering and state

React Three Fiber owns Three.js resource lifetime. Terrain, buildings and streets
are batched; triangle ranges map pointer selection back to original OSM IDs. No
per-building React components or animation loop. Demand rendering, no shadows,
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
