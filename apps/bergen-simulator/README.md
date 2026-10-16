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
digital twin or a simulation engine yet.

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
