# 5D acceptance evidence

All geography is unchanged from exact 5C `830a39f`. Screenshots show hypothetical
construction/access and synthetic road results, never observed development or traffic.
The same city overview camera is used for before/after views. Gold dashed corridors
are vehicle proposals; teal dashed corridors are pedestrian-only proposals.

- `desktop-before-access.jpg` / `desktop-connected-city.jpg`: observed versus proposed
  connected quarter at the same camera.
- `desktop-access-preview-world.jpg` and `mobile-access-preview-world.jpg`: live proposed
  corridor on actual terrain; UI screenshots show validation and original node IDs.
- `desktop-outcomes.jpg` / `mobile-outcomes.jpg`: actual common-engine trip accounting.
- `access-browser-report.json`: complete desktop/touch workflow, building change,
  mode separation, comparison, undo/redo, local save/reload, input-only export/import,
  invalid-import rejection and legacy versions 1–5.
- `before-profile.json` / `after-profile.json`: same old-plan profiler and cameras,
  desktop/mobile viewports, long tasks, geometry/worker timing, memory/idle checks.
- `connected-example-results.json`: actual monthly activity and common-engine results.
- `access-audit.json`: accepted/rejected full-width candidate routes over pinned terrain.
- `physical-device-profiling.md`: reproducible native procedure; physical performance
  remains unverified.

Reproduce from `apps/bergen-simulator`: `npm ci`, `npm run lint`, `npm test`,
`npm run check:isolation`, `npm run build`. Serve the independent Vite preview on
localhost:4180, then run `npm run test:access`, `npm run test:connected` and existing
management/living/buildings/physical/scenario/browser/visual suites sequentially.
Browser tests apply the production CSP locally. No Vercel bypass or runtime service is
used. GIS regressions use the pinned `scripts/requirements-geo.txt` environment and
`tests/importer.py`, `tests/connectivity-audit.py`.

Release uses the existing protected Bergen Actions pipeline only. Exact SHA/READY,
stable alias and All Deployments Authentication are verified after publishing; unrelated
Fellestall project metadata/domains, source geography and protected files are compared.
