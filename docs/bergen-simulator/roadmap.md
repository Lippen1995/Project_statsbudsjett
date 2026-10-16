# Roadmap

## 1 — Geographic foundation (this prototype)

Independent build; central Bergen OSM snapshot; real terrain; navigation, layer
controls and inspection; documented provenance; isolated deployment preparation.
No public deployment is part of this milestone.

## 2 — Bergen data quality and spatial streaming (recommended next)

Milestone 2A completed the dated Kartverket DTM workflow, NN2000 verification,
source-supported gables, mapped green areas and batched visual improvements.
See [acceptance evidence and limits](milestone-2a.md).

Next confirm access and redistribution rights for authoritative building
heights where openly licensed, compare mapped samples at Bryggen/Bergenhus/Nordnes,
and resolve bridges, tunnels, quays and terrain/base alignment. Establish automated
source completeness and topology checks, stable snapshot versions, attribution and
repeatable updates. Tile the scene spatially, move mesh preparation to a worker,
add frustum culling and a geometry budget. Measure frame time/memory on representative
mobile hardware. Exit when recognition and source fidelity pass a documented review.

## 3 — First deterministic simulation

One small Bergen-only transport or land-use scenario. Define time, units, source
facts, initial conditions and validation bounds. A pure TypeScript engine produces
repeatable ticks from a scenario seed. Every policy impact is an explicit model
assumption, separate from observed geography and municipal facts. No black-box
claims of real-world predictive accuracy.

## 4 — Scenarios and independent persistence

Scenario saves, undo, version migrations and comparison views. Provision a dedicated
simulator database and identity boundary only when needed. Never reuse production
Neon credentials or a production-derived branch. Add budget, population and transport
systems incrementally with testable units and sensitivity analysis.

## 5 — Fellestall integration

Begin with an ordinary link and a versioned read-only municipal fact export.
Agree ownership, rate limits, caching, provenance, accessibility and independent
release/rollback procedures. Common navigation and identity are later decisions.
Existing Fellestall pages and production data processing stay operationally separate.

## 6 — Municipalities and Norway

Validate a second municipality before generalizing the geographic adapter. Then
introduce municipal boundaries, inter-municipality flows and national policy.
Nationwide simulation is a separate scale and modelling milestone, not a reason
to broaden the current Bergen renderer prematurely.
