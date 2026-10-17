# Living City acceptance evidence

These are local acceptance captures, not observations or forecasts of Bergen.
The app and harness use Chromium 151 / ANGLE SwiftShader, DPR 1, 1440×1000 desktop
and 390×844 touch viewport. The normal production CSP/security headers are applied.
Physical-device GPU performance is unverified. Protected hosted verification uses
project/deployment metadata and anonymous denial, without changing Authentication.

## Reproduce

From `apps/bergen-simulator/`, with Node 24 and the committed npm lockfile:

```sh
npm ci
npm run lint
npm test
npm run check:isolation
npm run build
npm run preview -- --host 127.0.0.1 --port 4180 --strictPort
```

In a second terminal, run **sequentially** to avoid CPU/GPU measurement contention:

```sh
npm run test:living
npm run test:buildings
npm run test:physical
npm run test:scenario
npm run test:browser
npm run test:visual
BERGEN_EVIDENCE=1 npx vitest run tests/district.test.ts
```

The exact pre-implementation 4B app/harness can be reconstructed without switching
branches or changing tracked files:

```sh
npm run test:living-baseline
```

The baseline report here was captured before implementation at commit `298d162`.
The reconstruction helper archives that exact source, uses the same installed
locked dependencies and an isolated temporary preview on port 4181. It does not
refresh source geography or invoke Fellestall builds. Reports/timings can vary by
host; retain both successful and adverse measurements when investigating latency.

The existing pinned `requirements-geo.txt` environment also runs the three offline
geographic authoring regression tests and the read-only access audit:

```sh
python tests/importer.py
python scripts/audit-district-access.py
```

## Evidence files and interpretation

- `before-browser-report.json`: exact 4B baseline. `baseline-4b-*` images show that
  baseline's source city and authored construction, not a monthly activity comparison.
- `after-browser-report.json`: complete final living journey, raw comparison values,
  measured timings, draw/triangle/geometry counts, worker time and retained heap.
- `first-complete-browser-report.json`: earlier successful run retained to expose
  timing variance, including its elevated mobile p95.
- `01-month-zero.jpg` / `02-six-month-activity.jpg`: same design, camera and triangles;
  HTML timeline overlay hidden. Visible building-colour change comes from simulated
  activity rather than a changed label. Neither shows real-world occupancy.
- `03-strategy-comparison.jpg`: saved two-storey residential strategy versus a
  three-storey strategy at the same month and identical input coefficients.
- `04-balanced-quarter.jpg`: achieved optional challenge at month 24.
- `05-mobile-living-quarter.jpg`: touch viewport and accessible time controls.
- `living-quarter-example.json`: strict version-4 input-only winning example.
- `combined-living-plan.json`: actual browser-exported combined plan, independently
  importable/reproducible. No derived results or completion flags.
- `legacy-3b.json`, `legacy-4a.json`, `legacy-4b.json`: byte-identical copies of the
  original published examples. Loading them initializes living defaults in memory.
- `sample-24-months.json`: all 25 monthly states and engine input, derived evidence;
  intentionally not the scenario import format.
- `transport-access-audit.json`: exact pinned source hashes, nearest source node/way
  identities and explicit missing-connector decision. Distances do not establish access.
- Regression reports preserve previous building, public-space, street, explorer and
  fixed geographic-view checks. `validation.json` and `manifest.json` index the checks
  and evidence hashes.

A returned READY deployment and the stable alias are verified after pushing through
the unchanged Bergen Actions pipeline. Authentication remains All Deployments.
An authenticated hosted playthrough cannot be claimed without an available user
session; the full game is exercised locally under the production security headers.

## Measured comparison and investigation

| Measurement | Original 4B | 5A living, final repeat |
|---|---:|---:|
| Desktop scene readiness | 3,045 ms | 3,185 ms |
| Mobile scene readiness | 2,002 ms | 1,993 ms |
| Settled developed draw calls | 11 | 11 |
| Developed triangles | 289,524 | 289,528 |
| Desktop camera median / p95 | 356 / 401 ms | 401 / 482 ms |
| Mobile camera median / p95 | 214 / 259 ms | 210 / 253 ms |
| Settled idle frames | 0 | 0 |

Both profiles include the independently run existing traffic overlay. The different
construction fixtures explain the four-triangle difference; the **identical 4B
construction journey on 5A** still produces exactly 11 calls / 289,524 triangles.
Within the living journey, month 0 versus month 6 keeps calls, triangles and geometries
identical. A unit test also checks position/normal attribute identity and exact
base-colour restoration. The district changes only the colour buffer.

The first complete living pass measured desktop 396/444 ms and mobile 208/393 ms.
The repeat's raw 12 samples are retained, rather than discarding the first mobile
tail. In the independent construction regression, with Living City unopened,
desktop was 422/493 ms and mobile 214/275 ms. This comparison and the unchanged render
path do not support attributing the entire latency change to monthly simulation.
They also do not establish a performance improvement. Desktop latency is worse than
the original baseline and remains a follow-up measurement concern; actual-device
profiling is still required. Small-sample p95 is particularly noisy (12 samples
makes it the maximum sample), and the capture includes scheduling/software-renderer
overhead rather than physical-device FPS. No timing-based hardware claim is made.

Worker computation through month 24 for current **and** saved reference was 3.5 ms
in the final run (4.8 ms in the first). This is cumulative worker command computation,
excluding startup, transport and UI/renderer time. The worker stores at most 50
monthly records across two runs, with eight building allocations per record.

Six district reset/replay cycles retain exactly 10 GPU geometry objects in the
non-traffic comparison phase; the main-thread used JS heap after explicit GC rises
from 24,466,652 to 24,640,444 bytes (~170 KiB). This is a bounded-cycle retention check,
not proof about all native/GPU/worker allocations on all devices. Exiting planning
restores the original five geometry objects/passes. Construction regression retains
11 geometries across six edits, with resize command median/p95 222/241 ms. Static
monthly activity has no rendering loop and no additional draw pass.

Validation: **141 application tests (including 29 district tests), 10 release-policy
tests, three geographic authoring tests, lint, standalone build, isolation and all
six browser suites pass**. The living journey passes twice. The existing large
Three.js scene chunk warning remains; the new district worker is 12.19 kB. Mobile
viewports, pointer/touch controls and exact model replay are tested, not physical
handset GPU performance.
