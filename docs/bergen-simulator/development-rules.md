# Development and production isolation rules

1. Work exclusively on `feature/bergen-simulator`. Never commit to or merge into
   `main`. No PR targeting `main` without explicit instruction.
2. Changes belong in `apps/bergen-simulator/`, `docs/bergen-simulator/` and the exact
   `.github/workflows/bergen-simulator.yml` file. Existing Fellestall workflows,
   frontend, ETL and root package files stay unchanged.
3. Run npm from the application directory. Never run root Neon initialization,
   deploy, connection check, migration, activation or environment-pull commands.
4. Use no production database, production-derived database branch, credentials,
   environment values or Fellestall runtime services. This milestone needs none.
5. Never copy Fellestall `.env`, `.neon`, `.vercel` linkage or production secrets
   into this app. The dedicated CI job may pull only Bergen configuration into
   ignored runner-local files and must remove them afterward. Vite env-file loading
   is disabled; no client environment access is implemented.
6. Never deploy to `fellestall.no`, change its DNS or modify its Vercel project.
   Keep native Git deployment disabled. Only the isolated Actions pipeline is
   authorized to release protected production builds to the existing Bergen project.
7. A simulator push can trigger its isolated Actions pipeline. Use only the dedicated
   environment, exact Bergen project/team IDs and All Deployments Authentication.
   No Fellestall release or environment is authorized by that push.
8. If an operation may affect production, stop and describe the specific risk.
9. Geography must be traceable to observed source data. Preserve raw-source
   checksums, coordinate systems, licences and import parameters. Label estimates
   and uncertainty in both the snapshot and inspection UI. No invented geography.
10. Refresh geographic snapshots intentionally, outside build/install, and review
    changes in bounds, counts, topology and source terms. Network failure retains
    the prior working snapshot; never generate a fictional replacement.
11. Check `npm test`, `npm run lint`, `npm run build`, `npm run check:isolation`
    and the local browser flow before handoff. The isolation baseline records the
    original commit. Build old Fellestall code in a disposable copy because its
    build generates a tracked sitemap. Never invoke Fellestall deployment workflows
    as tests. The simulator push workflow is authorized for CI validation and protected Bergen releases.
12. Keep rendering work bounded. Avoid individual React elements per city feature,
    unrestricted DPR, unnecessary animation loops and synchronous simulation ticks.

The isolation checker enforces the branch, additions-only directory boundary,
absence of production service/env references in client code, local imports and the
disabled native Git deployment switch. Exact-SHA detached Actions checkouts are
accepted only with matching repository, branch, event and SHA metadata. It supplements
review; it cannot prove remote hosting state or inspect credentials. Browser verification records only local
static requests and checks missing-data failure, navigation and selection.

## Planning contracts (3B)

- Source geography is immutable. Interventions reference verified physical sections;
  they cannot contain geometry, add links or override mapped one-way directions.
- Keep plan/model/library versions explicit. Reject unknown fields and future or
  incompatible formats atomically; do not silently migrate changed meanings.
- Never accept cached outcomes, scores or demand from imported plans. Recalculate
  original baseline, current draft and saved references through the same worker.
- Any unrouted trip must remain prominent and disqualify challenge success. A lower
  routed-only travel or emissions total cannot compensate for lost access in scoring.
- Treat capacity and access rules as assumptions. Colours are proposed interventions,
  not observed materials, legal traffic orders or completed construction.
- Use only the simulator's local-storage namespace; never clear unrelated storage.
  Preserve invalid libraries and current drafts on read, parse, conflict or quota failure.
- Verify challenge feasibility with an actual valid plan and the common engine before
  changing thresholds. Keep game scoring separate from geographic/transport metrics.
- Profile a visible canvas with fixed cameras, viewport, DPR and renderer settings;
  label software-renderer measurements and keep physical-device performance unverified.

## Physical proposals

Keep physical edits in the versioned proposal layer; never modify the pinned source
snapshot. Imported geometry must pass the same finite/bounded schema, TIN coverage,
slope, building, water/coast and overlap checks as interactive placement. A saved
validity flag, supplied elevation or imported transport result is never trusted.
Existing valid 3B records remain readable without automatic writes or deletion.
Source IDs and original road directions are immutable. Surface placement alone
must not silently change access, capacity or any synthetic simulation parameter.
Only explicit street edits enter the existing transport worker. State the difference
between geometric eligibility, synthetic outcomes and unmodelled real-world feasibility.

Construction proposals must remain bounded parameter-only records. Revalidate every
building against the pinned terrain, observed footprints/water/coast, modelled road
corridors, other buildings and public spaces on import and edit. Never trust meshes,
source overrides or imported validity flags. Validate public-space edits against
existing construction too. Preserve scenario-1/2 reads and existing saved bytes.
Construction must not silently change traffic demand, capacity, access or outcomes.
Audit multiple real-snapshot sites before changing placement bounds. Measure against
the exact 4A baseline and retain zero idle rendering and disposal checks.

## Living district (5A)

Keep coefficients and state variables explicitly synthetic and unit-labelled. The
pure engine must not import UI, rendering, browser/storage, clocks or network APIs.
Bound runs to 24 monthly ticks and eight buildings; retain waiting demand and check
stock/flow, capacity and service reconciliation. Own/freeze engine inputs; never
mutate observed geography. New building or coefficient inputs invalidate previous
history and restart at the documented empty baseline. Reject stale worker replies.

Save only validated inputs. Read legacy scenario versions 1/2/3 without automatic
storage rewrites, and initialize living defaults only in memory. Never accept cached
statistics or completion flags as authority. Keep time playback independent of R3F
render loops and tint existing buffers rather than creating actors. District activity
must not change traffic inputs or create fictional connectors. Verify source-node
site entrances before any explicit future coupling. Challenge thresholds need an
actual geometrically valid winning plan and common-engine exploit tests.

## Construction and public accounts (5B)

Keep public capital and operating accounts separate, in integer fictional PMU subunits.
Require full civic-cost reservation before construction; no debt, negative cash, private
construction charges or hidden refunds. Account for sunk spending and release only
unspent commitments on pre-completion cancellation. Fund service readiness from the
operating account and distinguish physical, funded, used and unmet service capacity.

Legacy plans must retain explicit immediate commissioning and historical 5A outputs;
activating schedules is a visible, undoable conversion. Store only versioned inputs.
Reconcile all financial outputs and construction transitions before worker state
reaches the scene. New/removed buildings synchronize schedules atomically. Shared
history and stale-worker protection cover every management edit. Challenge comparisons
must state coefficient/funding differences and never reward unused money alone.

Keep phase visuals in the existing bounded batches and restore indexed selection IDs.
Dispose replaced GPU geometry. Use no persistent animation loop. Real-device diagnostics
must preserve Vercel Authentication and collect no player data; software-renderer probes
remain explicitly distinct from physical-device FPS.
