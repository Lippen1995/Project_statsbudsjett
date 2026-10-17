# Roadmap

## Completed — geographic foundation and 2A

Independent Vite/React application, central Bergen OSM snapshot, source inspection,
real terrain, navigation and an isolated protected deployment. Milestone 2A added
the dated Kartverket DTM workflow, NN2000 verification, source-supported gables,
mapped green areas and batched visual improvements. See [2A](milestone-2a.md).

Geographic work still needed: authoritative open building heights, mapped samples
at Bryggen/Bergenhus/Nordnes, bridges/tunnels/quays and terrain/base alignment.
Preserve stable snapshot IDs, attribution, completeness checks and repeatable updates.
Source revisions require separate review rather than implicit game-feature migrations.

## Completed — 3A transport and 3B street sandbox

A deterministic worker-based Bryggen/Vågen transport scenario uses validated source
nodes and directions, synthetic demand, visible intensities and baseline comparison.
3B generalizes policies into player-authored road-section access/capacity edits,
shared history, local saves, JSON interchange and a tested Rethinking Bryggen challenge.
See [3A](milestone-3a.md) and [3B](milestone-3b.md). The 27-way model is not Bergen's
whole transport network or a calibrated traffic forecast.

## Completed — 4A physical public spaces

Bounded terrain-following polygons, direct vertex manipulation, accessible numeric
tools, placement checks, explicit traffic-conflict decisions and combined local plans.
Geometric eligibility does not establish ownership, heritage clearance, permission
or engineering feasibility. See [4A](milestone-4a.md).

## Completed — 4B conceptual construction

Residential, commercial and civic massing, direct/numeric dimensions, assumed storeys,
roofs, terrain/building/water/road/proposal conflict checks, reversible visibility,
version-3 combined scenarios and the verified A New Urban Quarter challenge.
See [4B](milestone-4b.md). Observed buildings remain immutable. Demolition, excavation,
parcel rights, heritage constraints and real construction economics are unmodelled.

## Completed — 5A The Living City

A 24-month deterministic worker model gives proposed buildings synthetic household,
employment and aggregate civic-service roles. Demand queues, turnover, recruitment
and moderated uptake produce stateful consequences. Time controls, building tint,
saved-strategy comparisons and a tested Balanced New Quarter challenge complete the
build/observe/revise loop. Version-4 input-only saves preserve valid versions 1–3.
See [5A](milestone-5a.md). These are game equivalents, not real Bergen statistics.

## Completed — 5B construction, services and management

Scheduled projects, deterministic commissioning, fictional public capital/operating
accounts, funded civic readiness and a tested Sustainable Quarter challenge add timing
and resource trade-offs. Version-5 inputs preserve immediate commissioning for legacy
plans. Contextual project tools and batched phases complete the management loop. See
[5B](milestone-5b.md). Private finance and actual Norwegian municipal finances remain
unmodelled; no new geographic data or transport connection is inferred.

## Recommended next — evidence-backed district and access expansion

Measure representative physical desktop/mobile GPUs and profile mesh preparation,
render scheduling and memory. Software-renderer probes do not establish device FPS.
Investigate spatial tiles, worker mesh preparation and culling only against measured
bottlenecks, with explicit geometry budgets and zero unnecessary idle rendering.

Audit source-supported site entrances/connectors before coupling living activity to
roads. Expand the audited network through a documented source revision with complete
licensing, datum/provenance and topology checks. Then introduce several bounded
districts with explicit external household/job flows and opt-in capped synthetic trip
rates. Test access, unrouted demand, sensitivity and conservation at the larger boundary.
Keep transport separate wherever connectivity is unverified.

Add construction timing and investigate traceable parcel/heritage constraints before
hypothetical demolition or land-use envelopes. Preserve source IDs rather than deleting
observations. Calibrate only with defensible evidence; defer real-world population,
labour-market, service, fiscal and economic claims. Cloud persistence or identity is a
separate milestone: provision an independent simulator boundary only when necessary,
never production Neon credentials or a production-derived database branch.

## Later — Fellestall integration

Begin with an ordinary link and a versioned read-only municipal fact export. Agree
ownership, provenance, rate limits, caching, accessibility and independent release/
rollback procedures. Common navigation and identity are later decisions. Observed
facts and simulated outcomes remain separate. Existing Fellestall pages and data
processing retain their own production lifecycle.

## Later — municipalities and Norway

Validate a second municipality before generalizing the geographic adapter. Then
introduce municipal boundaries, inter-municipality flows and national policy. Nationwide
simulation is a separate scale and modelling milestone, not a reason to broaden the
current renderer or infer that this small Bryggen district represents all Bergen.


## Milestone 5C status

- Complete: exact-5B profiling, measured startup-blocking reduction through a geometry
  worker, byte-identical batches, local diagnostics and native-device procedure.
- Complete: pinned OSM access/entrance/restriction audit, bounded offline 48-way
  candidate and fail-closed graph/source tests.
- Blocked: district-to-traffic coupling; no verified entrance/connector to proposed sites.
- Next: real-device GPU/peak-memory testing, reviewed site access and boundary/turn
  semantics, then an opt-in bounded representative-period transport-input contract.

## Milestone 5D status

Explicit hypothetical access now provides an opt-in connection without claiming real
site entrances. The verified 27-way network stays active; the offline 48-way candidate
is not enabled. Next: physical-device profiling, private-connector travel/turn capacity,
shared hypothetical access and sensitivity analysis. Expand observed transport only
through a reviewed source revision. Keep district/transport feedback a separate model.
