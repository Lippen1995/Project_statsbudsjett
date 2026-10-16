# Development and production isolation rules

1. Work exclusively on `feature/bergen-simulator`. Never commit to or merge into
   `main`. No PR targeting `main` without explicit instruction.
2. Changes belong only in `apps/bergen-simulator/` and `docs/bergen-simulator/`.
   Existing tracked files, workflows, frontend, ETL and root package files stay unchanged.
3. Run npm from the application directory. Never run root Neon initialization,
   deploy, connection check, migration, activation or environment-pull commands.
4. Use no production database, production-derived database branch, credentials,
   environment values or Fellestall runtime services. This milestone needs none.
5. Never copy `.env`, `.neon`, `.vercel` linkage or production secrets into this app.
   Vite env-file loading is disabled; no client environment access is implemented.
6. Never deploy to `fellestall.no`, change its DNS or modify its Vercel project.
   Keep automatic Git deployment disabled pending explicit public-deployment approval.
7. A remote push can trigger hosting even without a PR. Keep work local until a
   separately approved repository/hosting plan guarantees no accidental release.
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
    build generates a tracked sitemap. Never use a deployment workflow as a test.
12. Keep rendering work bounded. Avoid individual React elements per city feature,
    unrestricted DPR, unnecessary animation loops and synchronous simulation ticks.

The isolation checker enforces the branch, additions-only directory boundary,
absence of production service/env references in client code, local imports and the
disabled Git deployment switch. It supplements review; it cannot prove remote
hosting state or inspect credentials. Browser verification records only local
static requests and checks missing-data failure, navigation and selection.
