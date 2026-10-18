# Roadmap and acceptance gates v1 — proposed

**Sequencing principle:** Demonstrate recognisable, performant Bergen before adding the full game. No code implementation or public release is authorized by this roadmap.

## Phase R0 — Concept and architectural safety (documentation only)

Deliver canonical Bible, baseline/gap analysis, target architecture, research register, decisions and scope of first benchmark. **Gate:** all six documents linked, no changes outside `docs/bergen-simulator/`, no changes to `main` or Fellestall. This phase does not claim runtime test results.

## Phase R1 — 3D Quality Benchmark (next proposed implementation milestone)

**Scope:** one tightly bounded, source-verifiable landmark block around Bryggen/Vågen; accurate terrain alignment, representative facade/roof materials, distinctive landmark, high-quality lighting, clear asset provenance, clickable object inspector and camera navigation. Compare incumbent Three.js pipeline against a streaming/3D Tiles option if source rights and engineering time permit. Do not expand geographic area in parallel.

**Definition of done:**
- Independent reference photos, survey/geodata or licensed assets support geometry and landmark identity; all inferred components labelled.
- Visual before/after captures from at least three fixed cameras and a reviewer-accepted landmark-recognition checklist.
- Fixed-device measurements for initial usable view, median and P95 frame time, GPU/CPU memory, draw calls, idle CPU/GPU and touch controls. Establish target thresholds before implementation, rather than fabricating them here.
- Stable source IDs and object picking, no phantom geometry, no regression to 5D saves.
- `npm test`, lint, build, isolation checker, relevant browser tests and visual regression pass; deployment remains protected.

**Gate:** user reviews benchmark screenshots and quantitative performance, then explicitly approves chosen 3D approach.

## Phase R2 — LIVE read-only prototype

Read-only factual snapshot, search, building inspector, project registry, provenance/updated-at labels, missingness, URL deep links and thematic overlays. Start with verified central coverage; represent outside projects as registry entries without false 3D geometry. **Gate:** no scenario state leakage, no factual fabrication, source/license audit and public-access plan reviewed. Keep protected deployment unchanged until authorized.

## Phase R3 — Office/time/event vertical slice

Cinematic office, calendar, scheduled meetings, adjustable game clock, phone notifications, interruption priority, camera transitions and deterministic event log. Implement one synthetic, clearly marked demonstration event. **Gate:** save/reload/fast-forward yields same state and same event sequence; animation does not mutate engine state.

## Phase R4 — Political and municipal-finance vertical slice

A source-backed Bergen opening balance and service needs; one full budget season with annual operating/investment separation, four-year plan, state-budget/rammetilskudd proposal/adopted phases, executive and council decisions. **Gate:** accounting reconciles; jurisdiction/approval gates enforce real rules; date and provenance visible.

## Phase R5 — Project consequence vertical slice

One documented municipal asset and hypothetical upgrade; approval, financing, staged construction, cost-to-complete risk, traffic only where validated, completion and service operations. A second political controversy with mobilization and a possible Torgallmenningen scene. **Gate:** costs, stage, 3D and political events share a single source of simulated truth; legal roles explicit.

## Phase R6 — Scale and publish

Expand coverage via licensed streaming GIS; municipality-wide economics and services without implying every location has detailed 3D; accessibility/mobile optimization; public LIVE on isolated release architecture, approved separately. **Gate:** public security/privacy, licenses, rate limits, load and rollback tested.

## Required release process

No automatic merges to `main`. Changes restricted to isolated app/docs and dedicated workflow. Preserve Vercel All Deployments Authentication unless a separate public LIVE project is explicitly approved. No production DB or Fellestall service access. Every phase ends with measurable evidence and user approval.
