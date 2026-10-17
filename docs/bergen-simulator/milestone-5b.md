# Milestone 5B — construction, public services and city management

Baseline: `87ab5393b8b002208b3785897882825f58a0e495` (5A). The pinned source city,
27-way traffic engine, production workflows, databases, domains and deployment
configuration are unchanged. This is a **small proposed district**, not Bergen's
actual construction programme, public services or municipal finances.

## Play the management loop

Enter Planning Mode and import the [scheduled example](../../apps/bergen-simulator/public/plans/sustainable-quarter-example.json)
through Save, open & compare plans. Open **Living City → City Management**. New plans
are scheduled by default. Select a project in the compact roster or select proposed
massing/its outline in 3D, then use its contextual schedule controls. Start month,
duration, civic investment priority and optional cancellation have actual model effects.

Advance monthly time. Planned outlines become subdued construction massing, then
operational proposed buildings with the existing activity tint. The readout separates
capital cash, free cash, reservations, expenditure, potential commissioned services,
funded services, utilization and unmet demand. A physical building can remain present
while its funded service capacity falls. Household/job uptake responds through the
existing 5A recurrence. No private construction cost is charged to the public account.

Try zero monthly operating funding, replay, and inspect the shortfall. Restore 40 PMU
and reproduce the funded result. Try zero capital allocation: civic work waits while
private projects still progress. Change construction dates and compare saved strategies
at the same month. Apply management edits through shared undo/redo, save, duplicate,
reopen and export/import. Input edits restart at identical empty month-zero stocks;
this is scenario replay, not retrospective amendment or refund of a previous run.

Opening a valid legacy plan does **not** turn on these constraints. It explicitly
initializes **legacy-immediate** mode, operational at month zero with the original
service interface and no public-finance model. The visible **Schedule this development**
action converts it to managed construction, resets time and is undoable. Saving a
legacy plan writes explicit zero-month schedules rather than silently changing its
historical timing. Adding/editing buildings in that compatibility mode stays immediate
until the player explicitly converts the plan.

## Architecture

- `management/model.ts`: version-1 management/budget/project contracts, bounds,
  canonical project ordering, legacy mode and atomic schedule synchronization.
- `management/finance.ts`: separate pure integer-subunit operations and accounting
  identities; deterministic installment rounding and operating-capacity funding.
- `management/construction.ts`: owned/frozen inputs and monthly project transitions,
  full-cost reservations, cancellation, deferral, commissioning and operating accounts.
  It holds only the current frame; the district owns the bounded history.
- `management/validation.ts`: strict finite/bounded output fields, dates, installments,
  stock/flow reconciliation, cash/reservation identities and transition checks.
- `district/engine.ts`: invokes the construction/finance step before the existing
  household/job/service recurrence. Only operational capacities and the funded-service
  interface change. Legacy inputs retain the version-1 engine/output contract.
- Existing district worker/protocol/controller: current/reference engines, at most
  25 snapshots each, stale-generation/worker guards, reset semantics and no rendering
  loop. Management inputs participate in invalidation and comparison.
- `ManagementPanel.tsx`: contextual project editing, compact accounts and optional
  challenge. The observed city remains accessible through the existing visibility switch.
- `geo/development.ts`: reuses body/roof and edge batches. A fixed index buffer omits
  planned/cancelled body triangles; colours encode construction and operational use.
  Source triangle IDs remain stable through an indexed-face lookup and edge selection.

All simulation modules are pure TypeScript without React, Three.js, DOM, storage,
network, random inputs or clock dependencies. Worker timing is diagnostic only. The
24-month horizon, eight-building limit, geographic authoring boundary and original
placement checks remain. No geographic geometry is copied into the worker. Existing
source records and legal mapped directions are never edited.

## Units, defaults and limits

**PMU = fictional Planning Monetary Unit.** One PMU contains 100 integer accounting
subunits (code fields ending `Cents`). These have no NOK/exchange-rate interpretation.
All funding inputs and cost coefficients are whole PMU values; construction totals
are rounded once to the nearest subunit. All balances/monetary flows are integers.
They are never labelled observed Bergen expenditure.

| Budget input | Default | Bounds | Unit |
|---|---:|---:|---|
| `startingCapital` | 1,000 | 0–100,000 | PMU at month zero |
| `monthlyCapital` | 0 | 0–10,000 | PMU/month, deposited at start of months 1–24 |
| `startingOperating` | 0 | 0–100,000 | PMU at month zero |
| `monthlyOperating` | 40 | 0–10,000 | PMU/month, deposited at start of months 1–24 |
| `civicCapitalPerM2` | 2 | 1–20 | PMU/m² assumed civic gross floor area |
| `operatingPerService` | 2 | 1–10 | PMU/commissioned service-capacity unit/month |

These ranges bound computation and allow legible toy-resource trade-offs. They are
not calibrated costs or grant allocations. The defaults can fund the existing 384 m²
civic concept (768 PMU) and its 19 potential units/month (38 PMU/month) within a modest
budget. Residential/commercial finance, taxes, property tax, developer payments, debt,
interest, grants and economic returns are unmodelled. No revenue is generated by the
hypothetical residents or jobs.

| Per-building input | Bounds / meaning |
|---|---|
| `id` | exactly one existing proposed-building ID; no source-feature overrides |
| `startMonth` | integer 1–24 in scheduled mode |
| `durationMonths` | integer 1–12 full work ticks |
| `priority` | integer 1–8; lower values reserve civic capital first; equal priorities use stable code-point ID order |
| `cancelMonth` | null, or integer 1–24 strictly before nominal start + duration; may cancel a still-planned project |

Month zero is the preparation baseline, with no scheduled work or capacity. Earliest
new scheduled commissioning is month 2 (start 1, duration 1). Work in start month s
and the following d−1 ticks commissions at the **beginning of s+d**. For example,
start 1/duration 3 commissions in month 4. Nominal commissioning is derived, never
trusted from an import. Deferral changes the actual start and actual commissioning.
Dates beyond month 24 remain explicitly unfinished; computation never extends the
horizon to make them complete. Priorities affect eligible civic funding, not private
work or geographical access.

Legacy-immediate mode explicitly uses start 0, duration 0, no cancellation and a
zero-valued budget contract. Finance is **unmodelled**, not a hidden unlimited public
account. The original capacity interface is retained. Scheduled cost coefficients
must be positive; importing legacy mode cannot win the management challenge.

## Construction and capital accounting

Let Bc be public capital cash, R outstanding reserved commitments, C a civic project's
rounded total cost in subunits, and Fc monthly capital funding in subunits.
C = round(width × depth × storeys × civicCapitalPerM2 × 100). Private C is zero.

For each monthly tick, in a fixed order:

1. Deposit Fc. Process scheduled cancellations before that month's work. A cancelled
   project releases its remaining reservation; already-paid expenditure is retained.
   Previously completed work reaching its actual commissioning date becomes operational.
2. Consider eligible planned projects in priority/ID order. Start a civic project only
   if **Bc − R ≥ C**, then reserve the whole C and record the new commitment. Otherwise
   keep it planned with a funding-deferral flag. A cheaper lower-priority eligible
   project can still proceed; priority does not create a queue-wide veto. Private
   schedules proceed independently and consume no public capital.
3. For active work, spend floor(C/d) subunits per tick, adding C mod d to the final
   work tick. Reduce cash and reservations by the same expenditure. Full work is paid
   before commissioning in the next tick. No future income is borrowed or assumed.
4. Fund commissioned civic capacity from the separate operating account, then run
   the existing 5A population/employment/service step with the current operational
   capacities and funded services.

Cancellation retains the authored proposal as a cancelled hypothetical outline and
contributes no capacity. It is not demolition of observed Bergen. A cancel date must
precede the earliest commissioning date, so a valid schedule never cancels an already
operational asset. Removing a proposal or changing its purpose/design is a separate
scenario edit and replays the entire baseline.

Every month checks these identities:

- starting capital + month × monthly capital funding = capital cash + cumulative capital expenditure;
- free capital = capital cash − outstanding reserved commitments ≥ 0;
- cumulative commitments = cumulative expenditure + cumulative released commitments + outstanding commitments;
- capital cash change = current capital funding − current capital expenditure;
- outstanding commitment change = new commitments − expenditure − releases;
- cumulative expenditure = sum of project-paid amounts.

Eligible but unreserved projects are **requests**, not debt or hidden liabilities.
`unfundedRequestsCents` sums their full costs. `capitalFundingGapCents` is
max(0, unfunded requests − remaining free capital), the additional free funds needed
to reserve all eligible waiting projects. No negative balance, unexplained refund,
private construction charge or money transfer between accounts is permitted.

## Funded civic operation

Potential service capacity P is the sum of 5A capacity conversions for **operational**
civic proposals. Planned, cancelled or unfinished projects contribute zero. Let Bo
be the previous operating balance, Fo monthly operating funding and k the assumed
cost per service-capacity unit/month in integer subunits.

- Available = Bo + Fo.
- Required = P × k.
- Expenditure = min(Required, Available).
- New balance = Available − Expenditure ≥ 0.
- Funding shortfall = Required − Expenditure.
- Funded capacity F = Expenditure / k, possibly fractional expected-value units.

Funding purchases monthly **readiness**, including unused commissioned capacity.
It is not a staffing/headcount simulation. Unused cash carries forward. Funding a
large unused civic building consumes operating resources without creating assumed
pedestrian/economic benefits. Within multiple commissioned civic buildings, funded
capacity is allocated proportionally to potential capacity.

The original 5A household/job stock-flow equations, coefficients, demand queues,
turnover, employment support and recruitment lag remain documented in
[5A](milestone-5a.md). Current-month operational household/job capacity replaces the
previously immediate total. F replaces service capacity in both household admission
cover and final service use. Service demand is residents × one service unit/month;
used = min(F, demand), unmet = demand − used. A service funding reduction does not
invent evictions or delete waiting demand. Construction never reduces already
operational household/job capacity within a run; cancellation is pre-completion.

The operating identity is independently checked:
starting operating allocation + month × monthly operating funding = operating
balance + cumulative operating expenditure. Required funding and actual unmet
service demand are separate: an empty civic building can be underfunded even when
no hypothetical residents yet request services.

A regression found and fixes an activity-allocation edge case: buildings with zero
current capacity must have zero utilization, even if other buildings of the same
purpose operate. The archived 25-month 5A reference remains exactly equal.

## Additional state variables

The 5A household/job/service variables retain their units. In managed runs,
`serviceCapacity` means **funded** units/month. The added management frame contains:

| Output | Units / definition |
|---|---|
| `month` | elapsed integer month, 0–24 |
| `projects[].phase` | planned, under-construction, operational or cancelled |
| `actualStart`, `commissionMonth` | derived integer months, null before starting; cancelled dates remain historical schedule information |
| `workMonths` | completed assumed work ticks, 0–duration; no geometric/engineering progress claim |
| project `costCents`, `paidCents`, `reservedCents` | total assumed civic cost, cumulative paid and unspent reserved subunits; all zero for private purposes |
| `deferred` | eligible planned project lacking full free capital this month |
| `capitalBalanceCents`, `capitalReservedCents`, `capitalFreeCents` | current capital stocks, in integer subunits |
| `capitalIncomeCents`, `capitalCommittedCents`, `capitalSpentCents`, `capitalReleasedCents` | flows during this monthly tick, in subunits |
| `totalCapitalCommittedCents`, `totalCapitalSpentCents`, `totalCapitalReleasedCents` | cumulative subunit flows |
| `unfundedRequestsCents`, `capitalFundingGapCents` | eligible unreserved requested cost and additional funding gap, in subunits |
| `operatingBalanceCents`, `operatingAvailableCents` | end balance / pre-expenditure available operating subunits |
| `operatingIncomeCents`, `operatingRequiredCents`, `operatingSpentCents`, `operatingShortfallCents` | this month's funding, requirement, expense and unmet funding, in subunits |
| `totalOperatingSpentCents` | cumulative operating expenditure, in subunits |
| `potentialServiceCapacity`, `fundedServiceCapacity` | commissioned potential / funded service-equivalent units per month |

Monetary output guards require nonnegative safe integers ≤1 billion subunits, well
above valid input/horizon maxima. Project dates, full-cost commitments, paid
installments, funded capacity, budget identities and consecutive transitions are
validated before worker results reach UI state. Per-building activity allocations
sum to operational/funded role totals; uncommissioned buildings have no utilization.

## Example and challenge

The [24-month comparison](milestone-5b-evidence/strategies-24-months.json) uses identical
three-building geometry and public funding for early and late strategies. Early:
housing start 1/duration 3, commercial start 1/duration 2, civic start 1/duration 4.
Late: housing start 15/duration 5, civic start 12/duration 4. The commercial schedule
is unchanged. Costs, funding and 5A parameters are otherwise identical.

| Strategy | Month-12 households / jobs | Month-24 households / jobs | Household-equivalent months delivered |
|---|---:|---:|---:|
| Early, funded | 6.790 / 9.280 | 6.833 / 9.366 | 130.379 |
| Late, funded | 0 / 2 | 6.522 / 8.744 | 26.539 |
| Early, operating funding zero | 4.324 / 6.383 | 5.723 / 8.118 | 88.749 |

The early funded plan spends 768 PMU capital, operates 19 service units/month from
M5 and spends 760 PMU on operation over 24 months. Final capital cash is 232 PMU,
operating balance 200 PMU, used service ~15.03/19 units/month and unmet demand zero.
Zero operating funding leaves potential capacity 19 but funded capacity zero. These
are game quantities only. Household-equivalent months sum end-of-tick occupied
households over M1–24; they are not a claimed monetary or real welfare benefit.

**Building a Sustainable Quarter** evaluates at month 24 through the common engine:

1. Valid geometry, at most eight buildings, all three purposes, all projects operational;
   scheduled mode and the standard 5A conversion/demand and default cost coefficients.
2. 5–8 occupied household equivalents, ≥60% housing utilization and ≥90 occupied
   household-equivalent months delivered.
3. 7–14 filled job equivalents and ≥35% job utilization.
4. ≥95% service coverage in months 8–24, ≥25% final civic utilization and zero operating-funding shortfall months.
5. Total 24-month capital allocation ≤1,200 PMU and operating allocation ≤1,000 PMU,
   with funded expenditure and no deficit.
6. 120–350 m² retained eligible public space within the existing geometric road-proximity rule.

These are transparent game objectives, not actual Bergen policy standards. Funding
and timing remain player decisions; fixed challenge coefficients prevent cheap-cost
or demand edits from silently changing the challenge. Free experiments remain fully
configurable. No aggregate economic score or reward for unused money is introduced.
Tests prove the source-valid three-building plan wins and reject single-purpose,
overlarge civic, wholly delayed, unfunded, underfunded, excessive-allocation,
legacy-exemption and altered-cost strategies.

## Persistence and migration

Scenario version **5** adds required `management` version 1 alongside unchanged
traffic, physical, development and living input contracts. No balances, phases,
actual dates, timeline, geometry meshes, trusted validity flags or completion values
are imported. One schedule must match each proposed-building ID exactly. All layers
pass source-specific geometric validation before an import/library replacement.

Versions 1–4 remain readable with original designs and original library bytes. Missing
living inputs receive the same defaults as 5A. Legacy plans get an explicit immediate
management contract in memory; only an explicit save/export writes version 5. A
migration test compares every archived 5A monthly output exactly. Library namespace,
20-plan/200,000-character bounds, scenario 32,768-character bound, 128 KiB upload guard,
quota/conflict handling and atomic writes remain. Shared bounded history now includes
management inputs. Schedule entries follow added/removed buildings atomically.
Invalid imports leave the current design, simulation month and storage intact.

## Evidence, limits and next step

See [screenshots, regression reports, performance and reproduction](milestone-5b-evidence/README.md).
The browser journey exercises legacy compatibility, real schedule controls, all three
3D phases, unfunded and underfunded states, restored funding, comparisons, challenge,
undo/redo, persistence, all legacy formats and observed-city reset under production CSP.

No new dataset, database, account, credential, deployment project or production
configuration is added. Source geography remains OSM ODbL / pinned Kartverket terrain
CC BY 4.0 with existing provenance. Ownership, approvals, heritage, procurement,
contractors, inflation, debt law, equalization transfers and real municipal finance
remain unknown/unmodelled. Private projects assume their financing is outside scope.
Cancelled projects retain their hypothetical footprint/outline and geometric collision
reservation until the player removes the proposal; cancellation does not restore
spent funding or simulate demolition. Transport remains separate because the
verified graph lacks site connectors.

Physical-device GPU performance is still unverified. The developer procedure in the
evidence guide uses a signed-in protected deployment or local build and standard
browser tools, without authentication changes, telemetry or uploading user data.
Next: test actual hardware and widen source-verified site access before district/traffic
coupling; then consider bounded multi-district operating allocations and construction
phases, retaining separate accounts and explicit external assumptions.
