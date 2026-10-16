# Bergen Reimagined

Independent React / TypeScript / Vite / React Three Fiber prototype of central Bergen.
No database, backend, credentials, map API keys, or Fellestall runtime dependencies.

```sh
cd apps/bergen-simulator
npm ci
npm run dev                 # http://localhost:5180
npm test
npm run lint
npm run build
npm run check:isolation
npm run preview             # http://localhost:4180
npm run test:browser        # separate terminal, preview running; system Chromium
npm run test:scenario       # full traffic-policy acceptance + performance captures
```

Node 24+ is required. Dependencies and the lockfile belong to this application only.
Use `CHROMIUM_PATH` for an alternative installed Chromium executable during browser QA.
Browser screenshots and reports go into ignored `artifacts/`.

Drag to orbit; right-drag to pan; scroll/pinch to zoom. Touch: one finger orbits,
two fingers pan/zoom. Focus the canvas for arrow-key pan, +/− zoom, R reset and
Escape to clear selection. Search provides a keyboard-accessible selection path.
Select a building or street for source identity and height provenance.

The checked-in static snapshot works without geographic services at runtime.
For pinned reproduction, create a separate Python virtual environment, install
`scripts/requirements-geo.txt`, then run `scripts/refine-geography.py`. Inputs cache
in ignored `data-cache/` and must match recorded hashes. A fresh OSM acquisition
is a separate reviewed dataset revision, never part of application build/install.

The initial snapshot covers 5.298–5.349 E, 60.382–60.408 N, including Vågen,
Bryggen, Nordnes, Bergenhus, the city centre, Lille Lungegårdsvannet and Fløyen.
OSM storey-based height estimates are labelled. Buildings without height or storey data remain draped footprints. This is not a surveyed
digital twin. Traffic results are synthetic model outputs, not Bergen forecasts.

Start with [architecture](../../docs/bergen-simulator/architecture.md),
[data sources](../../docs/bergen-simulator/data-sources.md),
[development rules](../../docs/bergen-simulator/development-rules.md) and
[Vercel setup](../../docs/bergen-simulator/deployment.md).

Work only on `feature/bergen-simulator`. Native Vercel Git deployments remain
disabled. The dedicated GitHub Actions workflow validates simulator pushes and,
after the isolated environment/secret setup, releases only the existing protected
Bergen project. See [deployment setup](../../docs/bergen-simulator/deployment.md).
Never link this application to Fellestall's Vercel project or production services.

## Milestone 2A

The active snapshot uses project-specific Kartverket / Høydedata 2022–2023 DTM,
NN2000, a 16 m display mesh, observed OSM green areas, conservative tagged gables
and explicit unresolved bridge omissions. Existing height estimates remain labelled.
Use `scripts/refine-geography.py` for the pinned refinement; the initial importer
refuses to downgrade it. See [source checks and reproduction](../../docs/bergen-simulator/data-sources.md).

With the preview running, `npm run test:visual` records the four fixed acceptance
cameras and local renderer/latency counters. `npm run test:baseline` reconstructs
commit `ab92713` in a disposable archive, adds the same localhost-only capture
probe and captures identical cameras on port 4181; it never switches branches.
Node dependencies must already be installed. All evidence goes to ignored
`artifacts/milestone-2a/`. Hardware FPS is not inferred from software-renderer timing.

## Milestone 3A — the first playable planning scenario

Choose **Plan Bryggen traffic**, select a traffic policy and run the 30-minute
synthetic period. Pause/resume, compare baseline/policy on the map, inspect the
source roads, reset and try another decision. The compact planning desk labels
assumptions and access trade-offs; the road colours show directional V/C using
assumed capacities. No traffic counts, municipal costs or CO₂ forecasts are claimed.

The pure TypeScript engine runs in a disposable Web Worker, uses fixed 30-second
ticks and no randomness, and never modifies geography. The bounded network is
extracted from original OSM shared node IDs, not snapped display coordinates.
`python scripts/import-transport.py` reproduces it **only** from the complete pinned
30-tile XML cache created by the original import; changed or missing sources fail.
The checked-in 27-way derived extract contains original node IDs, WGS84 coordinates,
source tags and hashes, licensed ODbL. Builds do not fetch geographic services.

`npm run test:scenario-baseline` reconstructs clean `e068704` in a disposable
archive on port 4181 and captures the same four geographic cameras without changing
any branch or baseline source.

`npm run test:scenario` checks desktop and 390px mobile flows, worker pause/reset,
repeatability, visible comparison at a fixed camera, resource disposal and idle
rendering. It records screenshots and software-renderer metrics in ignored
`artifacts/milestone-3a/`. See [model, evidence and limits](../../docs/bergen-simulator/milestone-3a.md).

## Milestone 3B — interactive planning sandbox

**Enter Planning Mode**, click a teal outlined road section, change its proposed
access or assumed capacity, select a second section and run your plan. Dashed
colours mark hypothetical edits; source geometry never changes. Undo/redo, inspect
unmodelled streets, compare baseline and saved configurations, or take **Rethinking
Bryggen**. Unrouted trips are prominent and penalized in game objectives.

Expand **Save, open & compare plans** to name/save locally, duplicate, reopen,
export JSON or import a compatible file. Saved plans contain interventions only;
outcomes are recalculated. No data leaves the browser. The storage namespace is
`bergen.reimagined.plans.v1`, limited to 20 plans. Keep JSON exports before clearing
browser storage. An example accepted by the same importer lives at
[`public/plans/rethinking-example.json`](public/plans/rethinking-example.json).

`npm run test:scenario` now covers the complete direct-edit/save/reload/import flow,
worker comparisons, challenge/accessibility, desktop and touch/mobile layouts under
the existing Vercel CSP. Evidence goes to `artifacts/milestone-3b/`.
`npm run test:sandbox-baseline` reconstructs clean `54c6531` in a disposable archive
on port 4181, using the same fixed cameras and visible-canvas profiling correction.
It never switches a branch. See [3B model and evidence](../../docs/bergen-simulator/milestone-3b.md).

## Milestone 4A — physical public spaces

Enter Planning Mode → **Physical public spaces** → **New public-space footprint**.
Tap 3–8 corners on the waterfront terrain. Preview validity/area, use **Move corners**
or the keyboard-friendly coordinate tools, choose paving/landscaping and apply.
Select the resulting surface to reshape/remove it. Undo/redo supports both the draft
and the combined street/physical plan. **Navigate camera** temporarily restores orbit.

Placement validates the entire footprint against the unchanged TIN, slope, buildings,
coast, inland water and other proposals. Passing means geometric eligibility only:
ownership, heritage, utilities, structural capacity and permission are unknown.
Road conflicts identify original model section IDs; only an explicit player action
changes traffic rules. Removing a surface retains separately chosen street edits;
**Reset city** clears both. Traffic remains synthetic, not a Bergen forecast.

Version-2 combined JSON files and version-1 3B plans are supported together in the
existing local library. Reads do not rewrite legacy records. Try importing
[`public/plans/waterfront-example.json`](public/plans/waterfront-example.json) for an
independently validated 315 m² study and an achievable optional challenge solution.
It demonstrates trade-offs, not a transport recommendation or legal feasibility.

With the preview running, `npm run test:physical` exercises the entire desktop/touch
physical-design/save/reload/legacy-import journey under the existing CSP. Evidence
is written to ignored `artifacts/milestone-4a/`. `npm run test:physical-baseline`
reconstructs exact 3B commit e047904 on port 4181 without switching branches.
Run captures sequentially. See [geometry limits, evidence and performance](../../docs/bergen-simulator/milestone-4a.md).
