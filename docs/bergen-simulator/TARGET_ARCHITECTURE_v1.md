# Target architecture v1 — proposal, not approved implementation

## Product boundaries

**Shared read-only source layer**: versioned GIS tiles, asset manifests, building IDs, geographic attribution, observed project records and public source metadata. **Bergen LIVE** reads only a dated published factual snapshot and approved synthetic ambient visualizations. **Game** forks an immutable starting snapshot and owns independent simulation state, decisions, time, stochastic seed and save versions. Game writes must never mutate LIVE source records.

```text
Source ingestion + license/provenance validation
           |
   Versioned geographic/factual snapshots
           |                         |
   Public LIVE read model        Game initial snapshot
           |                         |
   3D renderer + inspector      Game clock + case/event log
                                     |
           +-------------------------+--------------------------+
           |            |            |            |            |
        Political    Municipal     Public       Project       Society/
         process      finance      services     execution     mobility
           |            |            |            |            |
           +------------+------------+------------+------------+
                                     |
                          Deterministic event director
                                     |
                       Office UI / 3D scene / notifications
```

## Suggested domain contracts

- `ObservedFact`: stable ID, valid_from, valid_to, observed_at, retrieved_at, source URI, license, geometry ID, confidence/quality, jurisdiction, explicit missingness.
- `SpatialObject`: immutable geometry reference, object kind, owner where sourced, address where sourced, source version and LOD asset references.
- `PublicProject`: ID, geometry/coverage, owner, public procuring authority, contractor, funders, contract type, legal responsibilities, initial/approved/current estimate, currency/base-year, spent-to-date, physical progress and method, milestone dates, data timestamp and provenance.
- `FundingObligation`: actor, amount or cap, legal basis, trigger, approval, contingent/direct nature and effective interval. **No inferred Bergen guarantee for Sotrasambandet.**
- `MunicipalLedger`: fiscal year, functional/account classifications, operating/investment partitions, financing, borrowing, debt service, funds, constraints, source/model flags. All game values in NOK with price-year metadata.
- `PoliticalCase`: sponsor, authority, affected services/geography, evidence, alternatives, legal review, hearing, council/executive status, vote record, execution order.
- `GameEvent`: stable ID, game timestamp, causal inputs, severity, player choices, resulting state transitions, scene cue, model/seed version.
- `GameSave`: schema version, initial snapshot ID, policy/decision history, engine versions, deterministic PRNG seed/state, latest validated checkpoint.

## Engines

1. **GameClock / Calendar**: one authoritative game time; day/night animation derives from it; fiscal/meeting milestones scheduled; fast-forward processes all ordered events and pauses at qualifying interrupts.
2. **MunicipalFinance**: statutory budget process, annual and four-year plans, tax/grants, operating/investment separation, funds/debt/interest, balanced-budget constraints and audit reconciliation.
3. **NationalPolicy / GrantEngine**: versioned rules and inputs for rammetilskudd; government proposal vs parliamentary adopted budget; player cannot freely choose national parameters.
4. **PoliticalProcess**: delegated powers, byråd and bystyre decisions, coalition agreements, votes, procedural states, meetings and confidence.
5. **Services / Demography**: municipality-wide cohorts and service demand; separately identify resident population, present students, taxable incomes, workplaces and registered taxpayers.
6. **Projects**: work breakdown structure, dependency graph, procurement, contracting, funding, stage gates, physical progress, cost forecasts, delays, guarantees and post-opening operating effects.
7. **Mobility / Urban**: road graph and bounded impact zones; avoid claiming calibrated citywide traffic before validation.
8. **EventDirector / Visualization**: consumes engine events, selects interruption and presentation; no financial/political state mutation by camera animations.

## Stochastic strategy

Use **seeded regime-switching models** for macro conditions, conditional hazard/survival models for delay/failure events, probabilistic cost-to-complete with project-specific and shared shocks, and rule/agent-based political mobilization. Hidden Markov states are optional where data justify hidden regimes; not a universal engine. Recompute reproducibly under pinned versions. Maintain observed, calibrated, assumed and illustrative provenance labels. Never present invented frequencies as empirical facts.

## 3D technical decision gate

Keep React Three Fiber as incumbent benchmark. Compare (a) improved Three.js geometry + streaming/LOD, (b) Cesium/3D Tiles interoperability or a bounded alternative. Score with identical cameras, licensed data, fixed hardware classes and measured FPS, frame-time P95, load latency, GPU memory, draw calls, mobile interaction, picking accuracy, accessibility and asset licensing. Preserve demand rendering when idle; animate only when required.

## API and persistence proposal

Separate static fact/geometry delivery from authenticated game-save API. Prefer explicit snapshot version IDs and append-only decision/event log with periodic validated checkpoints. Never reuse Fellestall production DB, API keys or credentials. A new simulator database is **subject to later approval**, not part of this documentation assignment.

## Release safety

Existing Bergen Vercel project stays protected. A public LIVE surface requires separate deployment/access architecture, license clearance, privacy/security review, rate limits and deliberate authorization. No change to `main`, Fellestall, Neon or production secrets.
