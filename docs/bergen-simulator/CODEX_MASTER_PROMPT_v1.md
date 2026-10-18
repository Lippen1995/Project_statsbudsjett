# CODEX MASTER PROMPT — BERGEN REIMAGINED: GAME DESIGN BIBLE v1.0

You are acting as the principal technical architect and implementation planner for **Bergen Reimagined**, a browser-based, high-fidelity digital twin of Bergen with two experiences: (1) publicly explorable **Bergen LIVE** showing documented reality, and (2) a political/municipal-economics simulation in which the player is Bergen's city executive leader (*byrådsleder*). The realistic, interactive 3D city is the product's main acquisition driver. All simulated decisions must produce traceable effects in the city.

**Attached authoritative input:** `Bergen_Reimagined_Game_Design_Bible_v1.0.md`. Read the ENTIRE file before taking action. The Word version is for human review; the Markdown version is the canonical machine-readable design source. Do not claim you have read the attachment unless it is actually accessible. If it is not accessible, STOP and request that I attach or paste it. Do not invent missing requirements.

## 0. NON-NEGOTIABLE REPOSITORY AND ENVIRONMENT ISOLATION

- Repository: `Lippen1995/Project_statsbudsjett`.
- Work exclusively on branch **`feature/bergen-simulator`**. Verify the current branch and repository status before any change. If the branch is missing, dirty in an unexpected way, or not accessible, stop and report the issue. **Never work on, merge into, or commit to `main`.**
- Scope: `apps/bergen-simulator/`, `docs/bergen-simulator/`, and the dedicated `.github/workflows/bergen-simulator.yml` for inspection only. In this assignment, **all new/modified files must be under `docs/bergen-simulator/`**.
- **Do not change** Fellestall, its production environment, Neon database, credentials, domains, workflows, GitHub settings, Vercel deployments, authentication, or production traffic. Do not create an operational dependency on Fellestall. You may study the public design concept of the Norwegian municipal grant calculation, but implement no cross-app integration.
- Do not deploy, alter authentication, expose the protected Bergen Reimagined environment, install new packages, refactor runtime code, or implement features in this assignment.
- Preserve source provenance. Never fabricate observed GIS, project financials, road links, terrain heights, municipal statistics, contractual guarantees, or legal powers.

## 1. PURPOSE OF THIS ASSIGNMENT

This is a **documentation, architecture audit, research-gap and milestone-planning assignment only**, not an implementation sprint. We are freezing the product's high-level design before more code is written.

The intended product is not a Cities: Skylines clone. The player leads Bergen's *byråd*, navigates political meetings, budget periods, state-budget announcements, grant allocation (*rammetilskudd*), municipal services, investments, real project portfolios, political protests, and stochastic developments. The game alternates between a realistic 3D city-hall office and a visually impressive, clickable 3D Bergen. A separate Bergen LIVE experience is openly explorable without starting a game. LIVE uses documented reality; game sessions use a dated snapshot and an isolated simulated future.

## 2. DELIVERABLES — WRITE THESE FILES

1. `docs/bergen-simulator/GAME_DESIGN_BIBLE_v1.md`: place the attached Markdown document here faithfully. Preserve its status labels, source references, and project isolation requirements. Do not silently rewrite the design.
2. `docs/bergen-simulator/ARCHITECTURE_BASELINE_AND_GAP_ANALYSIS.md`: inspect the actual existing source tree, package configuration, data importers, Three.js/R3F scene, GIS coverage, workers, traffic, construction, scenario versioning, test suites and deployment boundary. For each relevant subsystem, provide actual file paths, current capabilities, limitations, and **KEEP / ADAPT / ISOLATE / REPLACE / BUILD** recommendations. Explicitly state why the existing fictional PMU budget and limited household model are not a Norwegian municipal finance engine.
3. `docs/bergen-simulator/TARGET_ARCHITECTURE_v1.md`: define bounded contexts, source-of-truth boundaries, event and clock architecture, LIVE/game state isolation, project ownership/funding/guarantee data model, municipal finance and grant rule-versioning, political authority checks, provenance and uncertainty classes, 3D click/inspection model, stochastic engine and reproducibility. Include data-flow diagrams (Mermaid permitted), conceptual schema, key interfaces and invariants. Distinguish confirmed facts from design proposals.
4. `docs/bergen-simulator/RESEARCH_AND_DATA_REGISTER_v1.md`: prioritize unresolved legal, regulatory, financial, geographic, licensing and empirical-calibration questions. Each item must have source(s) to verify, why it matters, proposed validation method, and a **BLOCKING / NON-BLOCKING** designation. Pay special attention to Norwegian municipal guarantees, procurement, state vs county vs municipal powers, Bergen parliamentary procedure, 2027 Grønt hefte, Sotrasambandet's contractual risk allocation, geodata licenses, and project-cost-overrun datasets. Do not invent answers.
5. `docs/bergen-simulator/ROADMAP_AND_ACCEPTANCE_GATES_v1.md`: propose staged delivery with a 3D quality benchmark and a narrow Bergen LIVE vertical slice before a political-game vertical slice. Each stage must have scope, dependencies, measurable acceptance tests, performance and data-quality gates, estimated complexity, and explicit non-goals. Do not propose a wholesale engine rewrite without a comparative prototype.
6. `docs/bergen-simulator/DESIGN_DECISIONS_AND_OPEN_QUESTIONS.md`: list locked decisions, proposals, assumptions, blockers, and items requiring explicit product-owner approval. Record any tension or contradiction you find in the Bible rather than silently resolving it.

## 3. SPECIFIC TECHNICAL QUESTIONS TO ANSWER

- How can the existing 3D scene evolve into an exceptionally realistic, source-grounded, browser-efficient Bergen model, with high-fidelity landmarks, geographic streaming, LOD, photogrammetry/3D Tiles evaluation, accurate object picking and mobile performance? Define a **hero-zone benchmark** with measurable targets to calibrate rather than unverified promised frame rates.
- How do we expose Bergen LIVE publicly without changing the current protected Vercel deployment or affecting Fellestall? Propose options and security implications; **do not change configuration**.
- How does the office calendar/time engine advance day/night, scheduled meetings, quarterly decisions, annual budgets, monthly accounting and long construction projects? How does an event pause time, play a phone notification and trigger a skippable cinematic camera trip without changing the simulation state?
- How do clickable buildings and infrastructure projects show owner, client, contractor, funders, legal authority, progress %, approved budgets, costs to date, estimate at completion, milestone history, forecast completion and documented source? Distinguish physical progress from expenditure. Support missing/uncertain values honestly.
- How do observed real projects (including Sotrasambandet at an October 2026 start date) become immutable snapshots and then simulated futures? Avoid inventing a Bergen municipal guarantee or transferring a state project's overruns to the municipal budget.
- How should we model state-budget proposals, parliamentary approval, Grønt hefte's Bergen allocation, income equalization, annual municipal budgeting and four-year financial plans using year-versioned rules, without relying on Fellestall's production systems?
- Which hybrid stochastic models are suitable for macro regimes, project delay/cost risk, correlated shocks, political mobilization and scenario uncertainty? What Norwegian data would be required for calibration, and how do we keep simulations reproducible?
- What should we retain from the existing audited 27-way road network, construction workflows, scenario schema v6 and worker-driven deterministic models, and where must geographical coverage be extended before asserting traffic effects?

## 4. EXECUTION PROCESS

1. Confirm repo, branch, working-tree state and scope. Report blockers before proceeding.
2. Read the attached Game Design Bible in full, then inspect the existing implementation and tests. Avoid claiming features exist without code evidence.
3. Create the six documentation files. Prefer concise, specific technical recommendations with traceable evidence over generic architecture language.
4. Run appropriate **documentation-only** checks (Markdown links, referenced local paths, basic consistency, diff/changed-file scope). Do not run deployment or change runtime dependencies. If read-only existing tests are useful, report which were run and their actual results.
5. Provide a concise final summary: files created, current architecture findings, top 10 blockers, the recommended **next single implementation milestone**, and exact files changed.
6. **STOP.** Await my explicit approval before writing application code, creating deployments, changing authentication or opening/merging PRs into `main`.

## 5. ACCEPTANCE CRITERIA

- All six files exist under `docs/bergen-simulator/`, with accurate file-path references and no speculative claims presented as verified facts.
- Every proposed implementation milestone has clear entry/exit criteria, dependencies, and a testable definition of done.
- LIVE and GAME are separate states on one shared, provenance-controlled geographic foundation.
- Real vs estimated vs simulated vs illustrative data are explicitly distinguished everywhere.
- Municipal authority, grant calculations, project guarantees and procurement constraints are modeled as **research-backed rules**, not permissive UI shortcuts.
- Existing functioning code is preserved; no application code or deployment configuration is modified.
- No changes to `main`, Fellestall or protected production infrastructure.

Do not begin implementation until the documentation package has been reviewed and I have approved the next milestone.