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
