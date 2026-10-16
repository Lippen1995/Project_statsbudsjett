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

## 3 — First deterministic simulation and street sandbox (3A / 3B complete)

Bryggen/Vågen now has a playable, deterministic worker-based transport scenario
with three policies, source-node topology, visible road intensities, pause/reset
and baseline comparisons. Demand and every transport parameter remain synthetic.
See [3A evidence and assumptions](milestone-3a.md).

3B adds direct real-street section edits, bounded access/capacity proposals, undo/redo,
versioned local plans, JSON interchange and saved-plan comparison. A tested
Rethinking Bryggen challenge evaluates player plans and penalizes lost access.

Next: a small **physical planning** slice using verified footprints/parcels and
terrain constraints. Begin with a reversible proposed land-use designation or
pedestrian-space footprint, distinct from observed buildings. Validate coast,
water, slope and existing access before introducing construction geometry. Never
invent source heights, ownership or financial costs. Physical feasibility and
capacity consequences need a separately reviewed model and data sources.

Keep widening the audited road/access boundary and profile on actual desktop/mobile
hardware before animated agents or broader simulation scope.

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
