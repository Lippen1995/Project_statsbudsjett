# Milestone 5D — Planned Access & Mobility

This iteration uses exact 5C commit `830a39fdef6a92a66ad4c4850cff7219bb1af975`.
Observed Bergen remains immutable. A connector is **player-designed hypothetical
infrastructure**, not an existing Norwegian entrance, street, junction or access right.
No geographic snapshot, source ID, deployment workflow or Fellestall file is revised.
The offline 48-way candidate remains disabled; routing uses 27 ways / 54 directed
edges / 26 original graph nodes.

## Playable loop

Enter Planning Mode → Access Planning. Select a proposed building on the map or in
the labelled selector. Design a connection, explicitly choose an original source-node
marker/ID, and adjust the proposed portal/bends. Gold dashes denote vehicle access;
teal dashes denote pedestrian access. Preview errors block confirmation. Numeric
coordinates and selectors offer a keyboard/touch alternative. Vertex markers select
a portal/bend for placement on the terrain; the camera is paused only during placement.
Draft and committed changes have separate bounded undo/redo histories. Terrain-picked portals snap to the explicitly selected hypothetical footprint within 2 m, to tolerate pointer precision. Numeric coordinates remain exact. Original source nodes are never snapped or moved.

Connections are never created by proximity. The nearest-node preview is an unapplied
suggestion and may be invalid. Confirmation performs full validation. Geometric building
moves that invalidate access are rejected; remove/revise the link first. Removing a
building with attached proposals is explicitly blocked rather than silently deleting
infrastructure. Height/purpose/schedule changes that preserve geometry remain possible.
Show observed Bergen hides all hypothetical buildings and access. Saved reference plans
have their own proposal geometry and can be compared without changing the source city.

Advance Living City, then choose the source month in Access Planning (or use the
inspected month). Explicitly enable activity demand and run connected transport. The
worker independently recomputes actual district activity at that month, then invokes
the same deterministic road assignment engine. The visible construction/activity timeline is prepared to the same selected month before transport starts, including after local reload. No congestion-to-district feedback is
introduced. Original Run plan remains the unchanged 960-trip street-policy experiment.

## Geometric eligibility contract

`access/model.ts` is pure TypeScript. AccessPlan v1 binds to the existing geography
checksum and active network checksum. Each connection stores only `id`, `buildingId`,
`mode`, original `nodeId`, and 2–5 local `[east, south]` metre points. It stores no mesh,
source override, derived height, connectivity/validity flag or result.

| Rule | Prototype threshold / rationale |
|---|---|
| Count and complexity | At most 8 links, one per mode per building, 2–5 points; bounded authoring and validation |
| Extent | Existing authoring window x −145…145 m, z −335…−65 m; no geographic expansion |
| Length | 2–80 m total; each leg ≥2 m, no self-intersections, reversals or nonadjacent full-width overlaps |
| Width | Vehicle 3 m; pedestrian 1.5 m, explicit conceptual game assumptions, not design standards |
| Terrain | Every full-width leg rectangle and conservative bend square must be covered by the existing display TIN; area tolerance 0.001 m² |
| Grade | Every touched TIN triangle ≤10% vehicle / ≤12% pedestrian; no engineered cut/fill or ramps |
| Vertical continuity | 1 m centreline samples obey mode grade +0.01 m numerical tolerance; proposed portal within 0.5 m of the conceptual foundation |
| Owner interface | First point within 0.01 m of the proposed footprint boundary; the centreline must leave the owner; only the first strip may meet its own conceptual portal |
| Source attachment | Last point within 0.001 m of an original active graph endpoint; no snapping, source splitting or new observed junction |
| Buildings/water/coast | Observed footprints and water/coastlines retain ≥0.25 m clearance; other proposed buildings also retain 0.25 m |
| Other proposals | Reject public-space overlap and other access corridors (including conservative bend squares); shared private junctions are not modelled |
| Road crossings | Exact segment/convex-strip clipping checks all mapped roads in the window. Motor/service/unsupported grade crossings are rejected except within 4 m of the selected node on a source-incident graph road |
| Walking-route crossing | Surface footway/path/pedestrian crossings are disclosed hypothetical at-grade design conflicts, not extra graph joins or certified safe/legal crossings; mapped steps are rejected |

These checks establish **geometric and model eligibility only**. Ownership, heritage,
planning approval, public rights, visibility, safe intersection design, universal access,
utility/structural capacity and engineering feasibility are unknown. Coarse display
terrain cannot certify an accessible gradient or road design.

The source audit found valid, full-width links from the existing Quay homes proposal
to node `4933873322` (22.19 m; maximum TIN grade 1.86%) and the eastern conceptual
building to node `645523` (35.88 m; 2.77%). Neither needs new terrain or relaxed source
collision rules. The first crosses a mapped walking route: this remains a disclosed
hypothetical design conflict. Other tested straight lines are rejected for observed
buildings, grade, unsupported road crossings or authoring-window limits.

## Demand assumptions, units and accounting

MobilityInputs v1 persists `enabled` (default false), source `month` (integer 0–24),
`householdTripEnds`, `jobTripEnds`, `cap` and original `gatewayId`.

| Input | Default | Bound / unit |
|---|---:|---|
| Household trip ends | 1 | 0–4 vehicle trip ends / occupied household equivalent / representative 30 minutes |
| Job trip ends | 0.6 | 0–4 vehicle trip ends / filled job equivalent / representative 30 minutes |
| Additional trip cap | 120 | 1–240 integer trips / representative period |
| Activity month | 12 | 0–24, independently recomputed from validated district/construction/finance inputs |
| Synthetic external gateway | OSM `645601` | One of four original graph endpoints at x/z extrema: a game boundary choice, not observed commuting geography |

The graph contains loops and has no degree-one leaf. Boundary gateways are existing
**road-section endpoints**, selected at the graph's coordinate extrema, not fabricated
leaf nodes, outside roads or destinations. The UI explicitly labels destinations
synthetic. No new observed graph node or edge is introduced.

For each operational residential/commercial proposal, take its calculated `used`
activity, not its floor area or potential capacity. `raw = used × purpose trip-end rate`;
`generated = floor(raw + 0.5)`. No month-length multiplier/divisor is applied: stocks
are sampled once, while rates already describe the representative half-hour. Each
rounded trip end is paired with one synthetic external end, yielding one trip, not
two. Alternate outbound/inbound directions in deterministic building-ID order; spread
trips evenly across the existing 60 × 30-second ticks. New exact per-tick integer
schedules do not alter the legacy ten-minute demand pulse.

The cap is allocated in stable building-ID order; every excluded integer trip remains
explicitly `capped`. Generated demand from missing/pedestrian-only access, or an
attachment equal to the gateway, is **blocked/unrouted**, never erased or credited as
improved traffic. Civic buildings generate no trips in this model. No observed modal
share, commuting destination, trip count or Bergen forecast is asserted.

```
generated = requested + capped
requested = assigned + blocked
assigned = additional road-routed + additional road-unrouted
unrouted = blocked + additional road-unrouted
requested = routed + unrouted
combined road requests = 960 base requests + assigned
roundingAdjustment = generated − sum(raw trip ends)
```

Only geometrically validated **vehicle** proposals authorize road-leg demand at the
chosen original node. A pedestrian connector never grants vehicle access/capacity.
Road legs run between the attachment and synthetic gateway through unchanged mapped
directions and current explicit street rules. Private-connector travel time, capacity,
turn movements and pedestrian flows are unmodelled. Connectors cannot become routing
shortcuts between source roads.

The common engine separately runs original baseline, street-only, combined demand,
additional-only attribution and the same additional trips without street edits.
Additional-only travel time is not a subtraction of nonlinear network costs. The UI
shows combined minus street-only totals and the separate additional-trip detour
comparison, including all inaccessible trips. Existing emissions proxy logic is unchanged.

## Architecture and persistence

```
immutable geography → placement context → validated building/access proposals
building + construction + finance + living inputs → monthly district worker
validated inputs + selected month → connected worker → district recomputation
calculated activity + explicit access + mobility inputs → bounded trip ledger / OD schedules
original directed graph + street interventions + OD schedules → existing traffic engine
validated worker result → one batched source-road intensity overlay
```

`access/run.ts` orchestrates pure modules; the worker imports no React, Three.js, DOM,
browser storage or runtime service. The one-shot connected worker closes after work.
Its client has generation/identity invalidation, separate 15-second district-preparation and connected-worker deadlines, output-accounting
validation and cleanup. Editing any relevant input, switching a reference, reset or
leaving planning cancels obsolete work. No circular worker messaging or trusted imported
activity is used. District and road time scales remain independent.

Scenario **version 6** adds AccessPlan v1 and MobilityInputs v1. Valid versions 1–5 are
read unchanged and initialize empty access/default-off mobility in memory. Legacy
construction immediate/scheduled semantics are retained. Plans with no new choices
continue exporting version 5. Existing library storage key, limits (20 records,
200,000 characters), 32,768-character scenario limit and atomic validation/write rules
remain. Every imported proposal is validated against current source terrain, buildings,
water, all mapped road records and all other proposals. Invalid imports leave the
active plan and stored bytes unchanged. Histories remain bounded at 51 entries.

## Tested example and challenge

Import [connected-quarter-example.json](../../apps/bergen-simulator/public/plans/connected-quarter-example.json).
It reuses the valid 5B footprints/public space; the eastern concept becomes commercial
and the middle concept civic. Construction remains scheduled and civic funding runs
through the existing finance module. The proposal intentionally changes no source data.
At month 24: 6.832945906 occupied household equivalents, 9.365891812 filled jobs,
13 generated/routed additional trips, zero capped/unrouted. Reducing the home from three to two storeys yields 3.90 occupied households, 6.21 filled jobs and 8 generated/routed trips through the same engines. Base road vehicle time
1,938.242227 → combined 1,969.594765 vehicle-minutes; maximum period V/C 1.54.

The optional **Connect the New Quarter** challenge uses shared engine outputs:
month ≥12, ≥3 occupied households and ≥3 filled jobs; explicit vehicle access for each
residential/commercial proposal; ≥4 generated trips with zero capping/unrouted;
no unrouted base traffic; max combined V/C ≤2.5; additional-trip distance ≤1.5× the
same trips without street edits; retained valid public space and service cover ≥90%.
The challenge fixes household/job rates at 1 / 0.6 and gateway 645601; changing demand assumptions is allowed in free play but cannot earn challenge credit by suppressing requested traffic. These are transparent game thresholds, not real policy standards. Tests prove the
example wins and that pedestrian-only/no access, road closures, capping, delayed
commissioning reducing needed activity, and artificially lowering trip rates do not receive fabricated credit.

See [evidence and measurements](milestone-5d-evidence/README.md). Physical-device GPU
performance remains unverified. Further work should model private-link travel/turn
capacity, explicit shared-access junctions and sensitivity before expanding the network
or introducing any traffic-to-growth feedback.

## Remaining boundaries

- The 27-way graph is a deliberately incomplete road model. Proposed walking links
  do not add a pedestrian network; neither link mode proves public access rights.
- A walking-route crossing warning is not a safety assessment. The prototype has no
  intersection design, turning-radius, road-level elevation survey or legal review.
- Road-leg demand is coupled; private-link speed, capacity, queues and turning delays
  are not. There are no invented source-road edges, destinations or observed volumes.
- Demand rates and gateways are game inputs. Rounding is reported, capping is explicit,
  and accessibility loss cannot improve the challenge merely by removing traffic.
- Software-renderer camera latency remains substantial and variable. Physical-device
  FPS, power, VRAM and peak native worker memory remain unverified. Follow the native
  profiling procedure before making GPU performance claims or adding citywide geometry.
- Protected production metadata, exact commit/READY/alias and anonymous denial can be
  verified without disabling Authentication. A signed-in production browser session is
  not assumed available; local full gameplay tests run with the production CSP.

Numerical guard details: authoring coordinates are finite and at most ±1,000 m before
window checks; reversal cosine below −0.95 is rejected (approximately >161.8° back-turn).
The first leg allows at most 0.02 m of owner-centreline clipping as a numerical portal
interface tolerance; subsequent owner intersection has 1e−8 m tolerance. Full-width
nonadjacent overlap is rejected even when centrelines do not cross. Source-node position
tolerance is 0.001 m, portal boundary 0.01 m, terrain coverage 0.001 m² and attachment-zone
comparison 4.001 m. These tolerances are computational safeguards, not source accuracy
or construction-design claims.
