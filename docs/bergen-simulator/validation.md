# Validation — 16 October 2026

## Production isolation

Baseline commit: `3ff897f4a21372b05cd732df54843605bb2e6593`.
All **1,472 original tracked files** were compared with their initial SHA-256
manifest and remained byte-identical. All changes are additions under
`apps/bergen-simulator/` or `docs/bergen-simulator/`. Development and the local
commit stay on `feature/bergen-simulator`; no main commit, merge, PR or push.

No database connection, Neon command, environment pull, deployment workflow,
remote project mutation, deployment or DNS operation was performed. Root tests use
local in-memory PGlite and mocked deployment requests. Installing the missing local
PGlite test dependency changed no root manifest or lockfile. The simulator has no
database dependencies, client environment access or imports into Fellestall.

Vercel was inspected through a read-only project listing. The simulator project
has not been created or connected because Git import can trigger an immediate
public deployment. Exact independent configuration is in [deployment.md](deployment.md).

## Checks and results

| Check | Result |
| --- | --- |
| Independent `npm ci` | Lockfile-based install supported; independent app dependency tree |
| `npm test` in simulator | 11 Vitest tests pass |
| `npm run lint` in simulator | ESLint passes with zero warnings |
| `npm run build` in simulator | TypeScript and Vite 8 production build pass |
| `npm run check:isolation` | Branch, additions-only boundary, imports, env isolation and disabled Git deployment pass |
| `npm audit --audit-level=high` | Zero reported vulnerabilities, including dev tooling |
| Existing `npm --prefix web test` | 177 tests pass |
| Existing root `npm test` | 7 tests pass; local PGlite/mocks only |
| Existing frontend build | Vite build and SEO checks pass in `/tmp/bergen-fellestall-check/` |
| SHA-256 comparison | All 1,472 existing tracked files unchanged |
| Local built-preview Chromium flow | Pass; zero runtime errors and failed asset requests |

The existing frontend build was run in a disposable copy because its sitemap
generator writes a source file. Its dependencies and source structure were
preserved; no production data fetch or publication took place.

## Browser story and evidence

Story: open the standalone explorer → load its local geographic snapshot → build
Three.js geometry → navigate and select source features → inspect provenance.
`npm run test:browser` runs against `http://127.0.0.1:4180` after starting the
independent built preview. Chromium uses SwiftShader in this environment.

Verified:

- Canvas starts and contains the real mapped Bergen scene. Desktop screenshots
  were visually inspected for the Vågen/Bryggen/Nordnes/coastline arrangement.
- Zoom, orbit and pan each change the rendered image.
- Building visibility changes, and low power mode reduces canvas DPR to 1.
- Named-place search and focus work. Pointer selection on the merged mesh resolves
  a source feature and displays its OSM ID, coordinates and height provenance.
- Object focus, overview reset and data/accuracy panel work.
- At 390 px width the canvas remains visible and the page has no horizontal overflow.
- All five initial asset requests are local; there are no map, database, analytics
  or other external runtime requests.
- A deliberately unavailable geographic snapshot produces an explicit error and
  no canvas or substitute city.

Ignored local `apps/bergen-simulator/artifacts/` contains `browser-report.json`,
`desktop.png`, `selection.png` and `mobile.png`. They can be regenerated with the
checked-in browser test. Screenshots are QA evidence, not geographic inputs.

## Known limits and outstanding work

There is no blocker to running this prototype locally. Public deployment remains
pending explicit approval and the new project setup. Authoritative current heights
and a current DTM are not available in this milestone. Unknown heights remain null
and render as flat footprints; OSM storeys × 3 m is an explicit estimate.

Terrain tile metadata identifies a historical Kartverket DEM, published as tiles
in 2017. This is not the survey date. Quay alignment, bridges, tunnels, lake levels,
roofs and flat building bases require further fidelity work. OSM completeness and
historical accuracy have not been certified.

The lazy 3D chunk is approximately **902 kB minified / 240 kB gzip**, and the static
snapshot is about **6.2 MB JSON / 1.4 MB gzip**. Vite reports its default chunk-size
warning. The 3D bundle is loaded separately from the UI; demand rendering and
merged geometry bound recurring work. Spatial tiling, worker preparation, geometry
budgets and measurements on physical mobile hardware are the next performance work.
The automated responsive check is not a device lab or a full accessibility audit.

## Automated-release follow-up

The simulator now owns `.github/workflows/bergen-simulator.yml` and isolated
release-policy/orchestration scripts. Native Git deployment is disabled; only the
explicit Actions production release path targets the existing Bergen project.

Local follow-up checks pass: actionlint 1.7.11, YAML/branch/job/permission/secret
boundary inspection, 11 existing Vitest tests plus 7 release-policy tests, ESLint,
isolation and the unchanged Vite build. CLI 63.1.2 also produced valid production
Build Output API v3 output in a disposable copy without credentials or deployment.
All 1,362 inspected existing production workflow/deploy/frontend/ETL/root files
match their pre-task hashes. The game bundle hashes are unchanged.

Bergen's existing project was observed READY with Authentication covering All
Deployments; an anonymous request redirected to Vercel Authentication. The GitHub
integration rejected creation of the dedicated environment and secret/variable
metadata reads with HTTP 403. No token was accessed. Initial CI must validate and
skip deployment until the environment, its scoped secret and the repository arming
variable in `deployment.md` are configured. No changes to main are required for
branch-push testing; manual-dispatch discovery may require the default branch.
