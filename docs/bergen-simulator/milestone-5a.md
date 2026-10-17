# Milestone 5A — The Living City

A bounded game simulation for **proposed buildings in the existing Bryggen authoring
window**, not observed residents, jobs or services in Bergen. Baseline:
`298d1620d1bfca4d115ac841c8a5b46643371e84` (4B). No geographic snapshot, transport
engine, dependency, production workflow or deployment configuration was changed.

## Play the loop

Enter Planning Mode, import the [combined example](../../apps/bergen-simulator/public/plans/living-quarter-example.json)
through **Save, open & compare plans → Import JSON**, then choose **Living City**.
The unchanged [4B example](../../apps/bergen-simulator/public/plans/urban-quarter-example.json)
also works. Advance six months, inspect the recruitment constraint, save this
strategy, switch to Buildings and change the residential storeys from two to three.
Confirmation restarts district time at zero. Run six months again and select the
saved strategy for a comparison at the same month. The tested design change raises
both household occupancy and filled jobs through next-month workforce recruitment.

Play advances one monthly tick per second; pause stops scheduling ticks. An already
requested tick may finish. +1, +6 and advance-to-24 work without continuous playback.
The range control inspects computed history without recalculation. Reset district
time retains the design and restores initial stocks; Reset scenario removes proposed
layers and restores the observed city. Hide proposals at any time. A confirmed
building's contextual panel shows its assumed activity. The map tint is dim when
unused and warmer when used; no real occupancy, crowds or tenancies are inferred.

Save, duplicate, export and reopen preserve **inputs**, not the timeline. After reload,
advance to the same month to reproduce the outcome. Comparing two plans computes
both from empty stocks over the same period. Different saved coefficients are
explicitly identified; their differences cannot be attributed to design alone.

## Architecture and bounds

- `src/district/model.ts`: version-1 coefficients, district inputs, output contracts,
  capacities, unit/bounds/conservation validation. Pure TypeScript.
- `src/district/engine.ts`: incremental deterministic stock-flow recurrence. No React,
  Three.js, clock, random source, DOM, storage, network or geographic mutation.
- `src/district/protocol.ts` / `worker.ts`: at most two engines (current/reference),
  at most 25 immutable monthly snapshots each, at most eight proposed buildings.
  Exact command keys, integer target months and generation IDs are checked.
- `src/state/district.ts`: worker lifecycle, validated replies, generation/worker
  identity guards, bounded cached history, pause/timer and reset semantics. Design,
  input, import, reopen and comparison changes invalidate previous derived history.
  Failed/stale results cannot replace a new plan. Construction drafts never enter it.
- `DistrictPanel.tsx`: time, capacity/use readout, month deltas, small static trend,
  explanatory constraints, editable assumptions and optional challenge.
- `geo/development.ts`: changes only the existing proposed-building colour buffer.
  No new draw passes, geometry, per-household components or animation loop.

Every run uses integer monthly ticks 0–24. Initial conditions: all proposed capacity
is available immediately; occupancy, filled jobs, waiting demand and cumulative
household exits are zero. This does **not** describe actual Bergen as empty.
Construction lead times, household finances, migration geography, wages, markets,
schools/hospitals, deaths/births, individual agents and travel are outside the model.

Schema and geometric placement are validated at the scenario boundary against the
pinned terrain/OSM records. The worker additionally validates parameter-only building
records; it receives no source geography. It owns and freezes its inputs and results.
Output validation rejects NaN, negatives, stocks beyond capacity, inconsistent shares,
wrong building IDs/capacities and broken conservation. Numeric outputs are bounded to
100,000; the input/horizon bounds keep genuine engine states well below that guard.

## Every configurable assumption

All values below are **synthetic gameplay assumptions**, adjustable within the UI
bounds. None is an observed Bergen statistic or calibrated forecast. Storey height
and roof assumptions remain the explicit 4B geometry parameters; gross floor area
is width × depth × storeys, excluding the conceptual roof volume.

| Input key | Default | Allowed range | Unit / meaning |
|---|---:|---:|---|
| `areaPerHousehold` | 80 | 40–160 | m² gross floor area / household capacity |
| `areaPerJob` | 30 | 15–80 | m² gross floor area / employment position |
| `areaPerServicePlace` | 20 | 10–80 | m² / resident-equivalent monthly service place |
| `householdSize` | 2.2 | 1–4 | resident equivalents / occupied household |
| `workersPerHousehold` | 1.1 | 0.5–2 | worker equivalents / household, also ≤ householdSize |
| `householdArrivals` | 2 | 0–8 | new external household demand / month |
| `jobDemandArrivals` | 3 | 0–12 | new external business position requests / month |
| `externalJobOpportunities` | 2 | 0–20 | job equivalents supporting settlement outside the district |
| `externalWorkforce` | 2 | 0–20 | outside worker-equivalent recruitment allowance |
| `householdMoveInRate` | 0.45 | 0.1–1 | maximum fraction of vacant household capacity filled / month |
| `jobFillRate` | 0.4 | 0.1–1 | maximum fraction of vacant employment capacity filled / month |
| `householdTurnover` | 0.02 | 0–0.2 | fraction of occupied household stock exiting / month |
| `jobSeparation` | 0.03 | 0–0.2 | fraction of filled jobs vacated / month |
| `minimumServiceAttraction` | 0.25 | 0–0.5 | fraction of otherwise supported admissions with zero civic cover |

Conversion floors **each building's** GFA / its role's area coefficient to whole
capacity units, then sums. This prevents fractional built units. Occupancy, filled
jobs, arrivals and workforce are expected-value **equivalents**, allowed to be
fractional so the recurrence is smooth and deterministic. They are not literal people.
Civic capacity is available resident-equivalent service units **per month**, not a
stock that accumulates unused provision. Each resident equivalent requests one unit
per month. The minimum-attraction floor allows gradual uptake despite a service gap;
that gap remains explicit rather than silently deleting demand or forcing eviction.

## Update order and formulas

Let previous occupied households be H, filled jobs J, waiting household demand Qh,
waiting business requests Qj, household capacity Ch, job capacity Cj, monthly service
capacity Cs. Lower-case parameter names refer to the table. Clamp shares to [0,1].

1. Household exits X = H × householdTurnover; surviving households Hs = H − X.
   Recruitment allowance L = Hs × workersPerHousehold + externalWorkforce.
   Surviving filled jobs Js = min(J × (1 − jobSeparation), L).
   Vacated positions V = J − Js. Thus a reduced workforce can also vacate jobs.
2. Household queue Qh' = Qh + householdArrivals.
   Business queue Qj' = Qj + jobDemandArrivals + V. Vacated positions return to demand.
3. Hires F = max(0, min(Qj', (Cj − Js) × jobFillRate, L − Js)). New filled jobs J' = Js + F.
4. First-pass household target T = max(0, min(Qh', (Ch − Hs) × householdMoveInRate)).
   Prospective households P = Hs + T.
   Employment support E = min(1, (J' + externalJobOpportunities) / (P × workersPerHousehold)).
   Service admission cover S = min(1, Cs / (P × householdSize)). Define both as 1 if P=0.
   Admissions A = T × E × [minimumServiceAttraction + (1 − minimumServiceAttraction) × S].
5. New H' = Hs + A; Qh'' = Qh' − A; Qj'' = Qj' − F; cumulative exits increase by X.
   Residents R = H' × householdSize; demand D = R; service used U = min(Cs,D);
   unmet demand = D − U. New households affect **next month's** recruitment allowance.

The employment relationship is an aggregate support factor, not a literal assignment
of each resident to a local/outside job. Outside opportunities and outside workers
are separately declared boundary assumptions; neither implies a verified commute.
The target-based support calculation is intentionally conservative; it does not
iterate to an equilibrium or claim economic realism. No spontaneous/exponential
growth occurs. Demand queues remain visible even when no building can accommodate them.

Conservation at month m:

- occupied households + waiting households + cumulative exited households = m × householdArrivals;
- filled jobs + waiting business positions = m × jobDemandArrivals;
- used service + unmet service = demand, in resident-equivalent units/month;
- each building's use is its role's utilization × its capacity, and allocations sum to the district total.

Utilization is used / capacity (zero if capacity is zero). Service coverage is
used / demand (one if demand is zero). Development balance is the **minimum** of
household utilization, job utilization and service coverage. The UI exposes all
three. It is a weakest-link indicator, not an unexplained economic score.
The constraint explanation prioritizes: initial uptake; missing housing; weak
household demand; civic shortfall; recruitment workforce; full employment capacity;
nearly full housing; employment support; gradual uptake. It is a diagnosis of this
bounded recurrence, not a causal assessment of actual Bergen.

## State variables and units

| Output | Unit / definition |
|---|---|
| `month` | integer elapsed months, 0–24 |
| `householdCapacity`, `occupiedHouseholds` | household capacity units / occupied household equivalents |
| `employmentCapacity`, `filledJobs` | position capacity units / filled job equivalents |
| `residents` | hypothetical resident equivalents, H × householdSize |
| `serviceCapacity`, `serviceDemand`, `usedService`, `unmetService` | resident-equivalent service units/month |
| `waitingHouseholds` | accumulated unadmitted household-demand equivalents |
| `waitingJobs` | outstanding business position requests, including vacated positions |
| `departedHouseholds` | cumulative exited household equivalents, zero at month 0 |
| `admittedHouseholds`, `exitedHouseholds` | household equivalents flowing in the current monthly tick |
| `hiredJobs`, `vacatedJobs` | job-equivalent flows in the current monthly tick |
| `recruitmentLabour` | worker-equivalent allowance computed before new admissions |
| `employmentSupport`, `serviceAdmissionCover` | admission factors, dimensionless [0,1] |
| `householdUtilization`, `jobUtilization`, `serviceUtilization`, `serviceCoverage`, `balance` | dimensionless [0,1] |
| `constraint` | enumerated explanation, no numeric score |
| `buildings[]` | ID, intended purpose, capacity, allocated used equivalents and utilization |

Worker `computeMs` is diagnostic elapsed milliseconds, outside deterministic model
state and excluded from persistence and equality comparisons.

## A Balanced New Quarter

At month 24: valid geometry, at most eight buildings, all three purposes; ≥5 occupied
household equivalents and ≥60% household use; ≥7 filled job equivalents and ≥35% job
use; ≥95% service coverage and ≥20% civic utilization; 120–350 m² valid proposed
public space within the existing 4A geometric road-proximity rule. Proximity does
not prove an access connection or permission. These are game objectives only.

The example retains the explicit, pre-existing 4B traffic edits; they are not generated
by district activity. It has three 12×16 m proposals: residential three storeys, commercial three
storeys, civic two storeys, and 189 m² public space. Capacity is 7 households,
19 jobs and 19 monthly service units. Automated tests validate the combined geometry
and common engine, and reject single-purpose and unused-capacity strategies. No
outcome table or special case rewards this layout.

| Month | Occupied household equivalents | Filled job equivalents | Service used / capacity per month | Unmet service |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 / 19 | 0 |
| 6 | 6.590486 | 8.880972 | 14.499069 / 19 | 0 |
| 12 | 6.827026 | 9.354052 | 15.019457 / 19 | 0 |
| 24 | 6.832968 | 9.365936 | 15.032530 / 19 | 0 |

The full [24-month input/result sample](milestone-5a-evidence/sample-24-months.json)
is derived evidence, **not an importable scenario**. The input-only example above
can be imported. The two-storey original 4B residential plan has lower occupancy and
job use; the browser evidence records both raw six-month strategies. The remaining
recruitment constraint and waiting demand are not erased by challenge success.

## Transport connection audit and geographic provenance

The read-only [access audit](milestone-5a-evidence/transport-access-audit.json) uses
the unchanged 27-way OSM graph and pinned building footprints. The three conceptual
sites are about 19, 72 and 32 m from the nearest audited routing nodes. These are
straight-line distances, **not verified site entrances or routes**. The extract has
no site-to-node entrance/connector contract. Even a clear line establishes no right
of way or legal road access. Consequently this milestone adds **no trip generation,
connectors, road edits or transport coupling**. Existing traffic remains a separate
synthetic scenario. A reviewed source/access expansion is necessary before coupling.

No new geographic, demographic or economic dataset was imported. Existing OSM data
remains ODbL, terrain remains Kartverket CC BY 4.0 with its existing CRS/acquisition/
NN2000 provenance. Their source hashes and observed IDs are unchanged. Player
parameters and economic coefficients are authored game inputs, never geographic facts.
Passing placement validation still establishes no ownership, heritage clearance,
planning permission, technical suitability or engineering feasibility.

## Scenario compatibility

Scenario version **4** adds a required `living` version-1 coefficient object to the
unchanged traffic/physical/development contracts. Unknown keys, future versions,
non-finite/out-of-range inputs, worker results, completion flags, arbitrary meshes
and geography overrides are rejected. Geometric validation remains mandatory.

Versions 1 (3B), 2 (4A) and 3 (4B) load unchanged and initialize default coefficients
**in memory**. Existing library bytes are not automatically rewritten. Explicit save
or export writes version 4. The storage namespace/envelope and bounds are unchanged:
20 plans, 200,000 library characters, 32,768 scenario characters and 128 KiB upload
guard. Imports validate completely before committing. Invalid imports preserve the
current plan, running month and library. Shared undo/redo includes coefficients,
traffic, surfaces and buildings; any building/input history change reruns from zero.
No backend, cloud storage, account or production connection is introduced.

## Acceptance and performance evidence

See [evidence and reproducible commands](milestone-5a-evidence/README.md), fixed-camera
before/after screenshots, browser reports, validation manifest and source hashes.
The new browser journey loads 4B, runs six months, edits residential capacity, compares
strategies, pauses/inspects history, achieves the month-24 challenge, saves/reloads,
exports/imports, rejects invalid results, loads all legacy formats and restores the
observed city. It verifies actual canvas changes separately from HTML labels.

Physical-device GPU performance remains **unverified**. SwiftShader camera latency
is an automation/software-renderer measurement, not physical-device FPS. Bounded
worker histories, zero settled idle frames, colour-only geometry reuse, repeated
reset retention and desktop/mobile viewport behavior are separately tested.

## Next iteration

Measure representative physical mobile/desktop GPUs and profile geographic mesh
preparation before broadening rendering. Audit explicit entrances and source-node
connectors, then expand the transport boundary through a separately reviewed source
revision. Introduce multiple bounded districts with explicit external job/household
flows and capped, opt-in synthetic trip rates only where connectivity is verified.
Sensitivity/calibration studies and construction timing should precede claims about
real population, labour markets, municipal costs or Bergen-wide transport impacts.
