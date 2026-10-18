# Architecture baseline and gap analysis — 18 October 2026

**Scope:** Read-only review of selected files on `feature/bergen-simulator`; this is not a full repository-wide code audit or runtime performance verification. Canonical product intent: [GAME_DESIGN_BIBLE_v1.md](GAME_DESIGN_BIBLE_v1.md).

## Verified baseline

- `apps/bergen-simulator/package.json`: standalone React 19, Vite 8, TypeScript, React Three Fiber 9, Three.js, Zustand, Vitest and Playwright. No app backend/database dependencies declared.
- `apps/bergen-simulator/src/App.tsx`, `src/components/Scene.tsx`, `src/components/Inspector.tsx`: source-based 3D viewer, selectable buildings/roads, inspector, scene controls and lazy scene loading. Inspector currently shows OSM identity, coordinates, inferred/observed height and source link—not owner, municipal function or project finance.
- `docs/bergen-simulator/data-sources.md`: pinned centre crop (5.298–5.349 E, 60.382–60.408 N), 6,502 building footprints, 6,542 road/path records, 49,313 terrain triangles. 2,878 buildings have unknown heights; existing geometry cannot honestly be called photorealistic.
- `src/state/scenario.ts`: versioned scenario composition, local saves, traffic/physical/living/management modules, worker execution, undo/redo. `src/management/model.ts` uses fictional Planning Monetary Units (PMU), not municipal NOK accounts. `src/district/model.ts` uses a 24-month synthetic district model.
- `docs/bergen-simulator/roadmap.md`: completed 2A–5D capabilities, synthetic 27-way transport model, conceptual construction, deterministic living district and scenario compatibility. Do not interpret this as citywide traffic forecasting.
- `docs/bergen-simulator/development-rules.md` and `.github/workflows/bergen-simulator.yml`: branch and production isolation; docs-only changes are outside workflow push path filters. `docs/bergen-simulator/deployment.md`: existing protected Bergen Vercel deployment. No LIVE public-access change is authorized.

## KEEP / ADAPT / ISOLATE / REPLACE / BUILD

| Capability | Decision | Rationale / next work |
|---|---|---|
| Pinned GIS provenance, source hashes, fail-closed validation | KEEP | Fundamental truth boundary; extend metadata, spatial extent and temporal validity |
| Batched Three.js scene, demand rendering, camera, picking | ADAPT | Benchmark visual fidelity and performance; do not discard before a measured alternative |
| OSM building inspector and selection | ADAPT | Stable object IDs, factual data, project registry and deep links |
| Existing GIS terrain and street data | ADAPT | Increase fidelity and coverage through licensed source ingestion; no invented elevations |
| Scenario serialization, deterministic workers, tests | KEEP + ADAPT | Add game-state versioning, event log, PRNG seed and replay |
| 27-way traffic scenario | ISOLATE | Preserve as local synthetic sandbox, not Bergen traffic or project-wide forecast |
| Direct private residential/commercial placement | ISOLATE | Legacy concept editor; municipal role instead controls planning, services and permitted projects |
| PMU project finance and 8-building district | ISOLATE / REPLACE for main game | Keep backward compatibility; build distinct NOK-based municipal ledger and population model |
| LIVE observed-state snapshot | BUILD | Immutable, dated, attributable facts, updated independently from game saves |
| Project/funding/guarantee registry | BUILD | Public vs private ownership, role, obligations, cost/progress, provenance and authority |
| Political institutions and decision calendar | BUILD | Council, executive, delegated powers, cases, meetings, annual budget cycle |
| State grant engine | BUILD | Versioned Green Book methodology, proposal/adopted phases, historical as-of inputs |
| City event director / cinematic office | BUILD | Pause/resume, phone notifications, meeting scenes, camera transition; no UI-induced state changes |
| Stochastic processes | BUILD | Seeded scenario models, calibrated where evidence permits, correlated risk |
| Public LIVE release channel | DESIGN ONLY | Separate public access; retain protected existing deployment |

## Key gaps / blockers

1. **Fidelity:** unknown building heights and roofs, simplified facades, no authoritative citywide 3D asset set, bridge/tunnel/landmark quality gap; browser GPU and mobile budgets unmeasured for the desired realism.
2. **Geography:** current centre crop excludes Sotrasambandet and much of Bergen municipality. Registry can list external projects before geometry exists, with clear coverage notice.
3. **Institutional model:** no Norwegian municipal accounting, legal authority graph, public procurement workflow, guarantees or actual project actors.
4. **Temporal architecture:** existing 24-month discrete district run is not a continuous office/day calendar with long-run municipal state.
5. **Source licensing:** OSM ODbL, Kartverket attribution and additional 3D/orthophoto/photogrammetry licenses need asset-by-asset review before public LIVE.
6. **Distribution:** existing protected Vercel target cannot be made public by shortcut.

## Audit limits and evidence

Inspected repository paths: `apps/bergen-simulator/package.json`, `src/App.tsx`, `src/components/Scene.tsx`, `src/components/Inspector.tsx`, `src/state/scenario.ts`, `src/state/physical.ts`, `src/management/model.ts`, `src/district/model.ts`, `vite.config.ts`, `README.md`, `docs/bergen-simulator/{architecture,data-sources,development-rules,deployment,roadmap,validation}.md`, and dedicated workflow. No build, browser test, full-file dependency audit or new geospatial ingestion was run in this documentation pass.
