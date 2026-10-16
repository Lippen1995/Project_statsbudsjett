# Milestone 3B — interactive urban planning sandbox

Baseline: `54c65318a3a82af51d36e196c2cc313148703efc` (3A).

## Playable experience

**Enter Planning Mode**, click an outlined street section in the city and design its
hypothetical access/capacity rules. Repeat on a second connected section, run the
model, inspect traffic redistribution, compare to baseline, undo/redo and run again.
The planning desk identifies the street name, OSM way, original endpoint nodes,
mapped direction and baseline/edited assumptions. An accessible section picker
provides an alternative to pointer selection. Unsupported roads are inspect-only.

All 31 physical sections of the audited 27-way / 54-directed-edge network are
editable. Teal outlines identify supported sections; dashed colours show proposals,
white marks selection and the inner intensity ribbon shows calculated V/C. Colours
are hypothetical game notation, not completed construction or verified traffic
orders. Terrain, buildings, road coordinates, one-way directions and source records
remain unchanged. No predefined global policy buttons remain in the active UI.

The player can enter/leave **Rethinking Bryggen** while keeping a plan, or experiment
freely. Names, local saves, duplicate, reopen, JSON export/import and recalculated
saved-plan comparison work without accounts, a database or a backend.

## Intervention contract

`simulation/interventions.ts` defines:

```ts
interface Plan {
  version: 1;
  networkId: string;
  interventions: {
    segmentId: string;
    access: "all" | "local" | "service" | "closed";
    capacityFactor: number;
  }[];
}
```

A physical section key is its source way plus sorted endpoint node IDs. Both
existing directions receive the same settings; absent reverse edges remain absent.
Access means all model categories, local+servicing, servicing-only (pedestrian
priority) or no modelled vehicles. It does not describe current legal restrictions
or actual pedestrian behaviour. Capacity factors are the discrete set
0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75 and 2, relative to assumed class capacities.
A closed section requires factor 1; capacity is not a second way to encode closure.
A 200% setting is a hypothetical model assumption, not verified physical feasibility.

Validation rejects unknown fields, duplicate/unsupported sections, invalid enums,
nonfinite/out-of-range multipliers, contradictory closure/capacity settings and
incompatible versions/network references. Default all/100% entries normalize away.
Canonical sorting makes equivalent input ordering identical. No file can supply
new geometry, connectivity, turn directions, demand, outcomes or scores.

The network compatibility checksum covers original edge IDs, node references,
rounded projected points and baseline assumed capacities. It is FNV-1a for
compatibility, **not a cryptographic authenticity check**. Explicit versions and
strict field/ID/value validation enforce the contract. No prior 3A persisted format
existed, so there is no legacy save migration to perform. Future incompatible
models require a reviewed version change and explicit migration or safe rejection.

The engine clones the baseline graph before applying edits. Its core has no global
policy cases or corridor-specific access logic. The original 3A regression cases
are retained as test-only translations to intervention data. Bryggen's source IDs
remain only as the geographic counting/challenge corridor.

## Model, consequences and challenge

The unchanged model uses fixed 30-second ticks, 60 ticks / 30 minutes, 960 synthetic
trips, assumed speed/capacities, incremental routing and bounded BPR-style costs.
There is no randomness. Baseline, working plan and optional saved reference run in
lockstep in a Web Worker. Model results do not depend on wall-clock pacing, names,
record IDs, timestamps, DOM state or rendering. Editing, history changes, reset,
import and reference changes terminate work and clear stale results; late messages
are ignored. Results and reference geometry always use matching edge ordering.

The readout keeps raw vehicle passages, through passages, vehicle-minutes, average
through-trip metres, highest period-average V/C, unrouted trips and the existing
emissions proxy separate from game scoring. Unavailable mean distances display a
dash. Travel/emissions totals cover routed trips only; disappearing demand is not
an efficiency improvement. The emissions proxy remains an arbitrary distance /
congestion index (initial baseline = 100), not measured CO₂ or a forecast.

Challenge objectives, selected after searching and testing valid plans:

- At least **25% fewer modelled through-trips using Bryggen**.
- **Zero unrouted trips** from the same requested demand.
- Mean through-trip distance no more than **2× initial baseline**.
- Highest period-average directional **V/C ≤ 2.5**.

These are transparent game rules, not municipal standards. Completion requires a
full 60-tick run. Any unrouted demand scores `−1000 − unrouted trips`, below every
fully routed plan. Otherwise the separate score is `round(100 × through reduction
fraction − 20 × max(0, distance ratio − 1) − 10 × max(0, highest V/C − 2))`, bounded
below at −999. Raw model metrics are never rewritten by the objective evaluator.

The validated five-edit [example plan](../../apps/bergen-simulator/public/plans/rethinking-example.json)
reduces through passages **640→400**, keeps **960/960 trips routed**, yields mean
through distance **337→629 m** and highest V/C **2.4**. It scores **16** through the
same engine. Travel time still increases **1,938→3,132 vehicle-minutes** and the
emissions proxy increases to about **168**. Challenge success is not a claim of
real-world transport or environmental improvement. No winning result is hardcoded.

## Local plans and working reload example

Exports are `{ kind: "bergen-reimagined-plan", version: 1, name, plan }`.
The versioned library uses only `bergen.reimagined.plans.v1`, up to 20 records and
200,000 serialized characters. Names are limited to 60 characters; JSON imports
are bounded to 32,768 characters, with a 128 KiB file-read guard. Exports contain no
cached results, geography, credentials or browser account data.

Writes validate the entire library before one atomic key replacement, preserve
other-tab additions and refuse conflicting updates. Broken/future/incompatible
libraries are retained; blocked/quota storage errors leave the draft intact. Invalid
imports do not stop a valid current game or replace its results. No unrelated
storage keys are read or cleared. History is session-only and bounded to 51 frames;
opening/importing a plan starts a new history, and reset retains saved records.

The browser acceptance test actually names/saves **Harbour access trial**, reloads
the application, re-enters Planning Mode, opens that named plan and reproduces its
outcomes. It downloads [this JSON export](milestone-3b/after/harbour-access-plan.json),
resets the city, imports the file and reproduces the same outcomes again. To try it,
import that file from **Save, open & compare plans** on the deployed app. Local
storage belongs to that browser/origin; localhost saves do not automatically appear
on the protected Vercel domain. JSON is the transfer and recovery mechanism.

To compare two saved configurations, open the first, select the other as the saved
reference, and run. Baseline/current/reference are all recalculated. The map and
readout label the saved reference explicitly. No saved numeric outcome is trusted.

## Evidence and validation

- [3A planning baseline](milestone-3b/before/01-planning.jpg).
- [Direct section editing](milestone-3b/after/01-street-editing.jpg).
- [Calculated plan in 3D](milestone-3b/after/02-plan-results.jpg) / [initial baseline at identical camera](milestone-3b/after/03-baseline-comparison.jpg).
- [Two saved configurations](milestone-3b/after/04-saved-comparison.jpg).
- [Challenge achieved through calculation](milestone-3b/after/05-challenge-achieved.jpg).
- [Accessibility-loss penalty](milestone-3b/after/06-accessibility-loss.jpg).
- [390px touch/mobile plan](milestone-3b/after/07-mobile-plan.jpg).

Passed: **51 Vitest tests + 10 release-policy tests**, three offline Python geography
tests, ESLint, TypeScript/Vite build, isolation check and actionlint on the unchanged
simulator workflow. Regressions cover determinism, 3A baseline behaviour, multi-edits,
flow conservation, nonnegative/accounted demand, preserved topology/coordinates,
unrouted accounting, bounded history/execution/memory, stale worker messages,
roundtrip/schema rejection, quota/corrupt/conflicting storage, saved comparisons
and feasible challenge objectives. Existing explorer browser checks also pass.

The full browser journey includes two real 3D street selections, access/capacity,
run/pause/resume, observed changed pixels at a fixed comparison camera, undo/rerun,
redo, name/save/duplicate, saved comparison, reload/reopen, real JSON download/import,
rejected import preserving current results, challenge completion and loss penalty,
non-editable feedback, overlay disposal, static rendering and touch/mobile restore.
Tests apply the unchanged Vercel CSP to the local document, including worker loading.
Only same-origin static assets and local downloads are used; no runtime errors.

| Active-scene measurement | 3A baseline | 3B sandbox |
| --- | ---: | ---: |
| Settled draw calls | 7 | 7 |
| Triangles | 288,846 | 289,336 |
| Resident geometries | 7 | 7 |
| Idle frames | 0 | 0 |
| Desktop median camera-probe latency | 424 ms | 424 ms |
| Desktop p95 camera-probe latency | 507 ms | 453 ms |
| Mobile median camera-probe latency | 166 ms | 143 ms |
| Mobile p95 camera-probe latency | 211 ms | 177 ms |

Worker step calculations totalled 36–107 ms in recorded runs,
including the optional third engine. This excludes initialization and intentional
accelerated playback; it is not a render-time or hardware-FPS measurement.


Counters are local capture-probe measurements, not full GPU frame times or physical
device FPS. Both versions use Chromium 151 / ANGLE SwiftShader, desktop 1440×1000
DPR1 balanced and mobile 390×844 DPR1 low with touch/mobile context. The same fixed
camera makes 14 moves, discards two warm-up samples and records 12. Tests run serially.
The baseline archive and current harness explicitly scroll the canvas into view
before profiling; earlier offscreen mobile readings are not used for comparison.
Only harness instrumentation is patched in the historical archive; 3A game sources
are unchanged. Timing variation must not be presented as a hardware optimization.

The core city remains 288,140 triangles / five passes. Planning adds two merged
passes; selection stays within the outline batch. No per-road React meshes, moving
vehicles or persistent animation loop. Closed/paused/complete states settle without
idle frames. Physical-device performance remains unverified. The ~911 kB lazy Three
chunk still produces Vite's existing chunk-size warning; no dependency was added.

Reproduce with Node 24 and a running preview on port 4180:

```sh
npm ci
npm run build
npm run lint
npm test
npm run check:isolation
npm run test:scenario
npm run test:browser
npm run test:visual
npm run test:sandbox-baseline  # disposable read-only 54c6531 archive, port 4181
```

Python tests require the existing pinned geographic environment. Snapshot and
source hashes are recorded in the evidence manifest. Every tracked Fellestall file
and workflow, existing geographic snapshot, lockfile and Vercel/Vite configuration
matches the starting state. Only simulator application/documentation files change.
The same protected branch pipeline performs release; its configuration is untouched.

## Limits and next step

This is still a bounded, synthetic assignment model without real traffic calibration,
queues, signals, pedestrian movement, transit, enforcement or physical road capacity
validation. Mapped turn/access completeness is not certified. Original geographic
fidelity limits remain. Saves are local, ephemeral history is not persisted and
JSON imports require the same compatible model. Authenticated hosted playthrough
requires the user's Vercel session; acceptance runs locally under production CSP.

Next implement one reversible **proposed pedestrian-space or land-use footprint**
on verified ground/footprints, with coastline/water, slope and access constraint checks.
Keep proposed construction distinct from observed buildings and parcels. Verify
new source rights and physical feasibility before construction geometry, demolition,
ownership or financial costs; do not invent these to fill gaps. Profile on real
mobile/desktop hardware before animated traffic or a larger map.
