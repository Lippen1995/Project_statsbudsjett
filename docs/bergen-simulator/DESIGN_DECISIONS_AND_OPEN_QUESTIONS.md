# Design decisions and open questions — 18 October 2026

## Confirmed product decisions

1. Two experiences: Bergen LIVE (factual exploration) and Bergen Reimagined (political/municipal strategy), sharing source-verified 3D geography but not mutable state.
2. Player leads Bergen's byråd and is subject to real institutional and legal authority.
3. The 3D city is the primary acquisition/visual differentiator; high-fidelity benchmark precedes wider geographic expansion.
4. Clickable buildings/projects expose status, budget, cost incurred, estimated final cost, funding roles, physical progress, expected completion, milestones and provenance.
5. Actual ongoing projects, including Sotrasambandet, belong in the as-of starting register; later evolution is simulated. No inferred Bergen guarantee.
6. Office/calendar, annual municipal budgets, state-budget events, messages, time controls, meetings and cinematic transitions are core gameplay.
7. Stochastic processes must be causally meaningful, seed-reproducible and clearly distinguished from observed history.
8. Existing Fellestall production, `main`, Neon, secrets and protected Bergen deployment are out of scope.

## Proposed (requires validation)

- Quarterly strategic decision windows, day-scale office clock and monthly accounting ticks.
- Hybrid stochastic models rather than a single HMM.
- React Three Fiber incumbent versus Cesium/3D Tiles benchmark.
- Append-only game event log with validated checkpoints and snapshot-versioned saves.
- Separate public LIVE deployment and game-save service after approval.

## Unresolved / explicit approval gates

1. Minimum visual quality and acceptable performance on iPhone-class mobile hardware.
2. Geographic scope of first landmark-quality pilot; suggested Bryggen/Vågen block.
3. Licensing and procurement of facade/roof/photogrammetry assets.
4. Historical start date(s), update cadence and editorial policy for LIVE.
5. Which government processes are fully interactive versus summarized.
6. Full formula versioning and reproducibility of Norwegian rammetilskudd.
7. Source of authoritative municipal building/project inventories.
8. Exact treatment of contract risk, procurement and guarantees by project type.
9. Stochastic calibration samples, uncertainty disclosures and gameplay difficulty.
10. Public LIVE hosting/authentication, privacy and anti-abuse controls.

## Next requested approval

Approve **R1 — 3D Quality Benchmark** only after reviewing its technical scope and evidence requirements. No implementation, public release, production access or branch merge is authorized by these planning documents.
