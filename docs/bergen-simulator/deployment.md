# Bergen simulator — isolated Actions deployment

## Existing target

| Setting | Required value |
| --- | --- |
| Repository / branch | `Lippen1995/Project_statsbudsjett` / `feature/bergen-simulator` |
| App / Root Directory | `apps/bergen-simulator` |
| Framework / Node.js | Vite / 24 |
| Install / build / output | `npm ci` / `npm run build` / `dist` |
| Team | `team_zBf9uUPGwDQKfB9fElKD876W` |
| Project | `bergen-reimagined` / `prj_s9Bugj93zirfeEvLLwJvygz9syny` |
| Stable URL | https://bergen-reimagined.vercel.app |
| Protection | Vercel Authentication, **All Deployments** |
| Database / app variables | None |

The user authorized protected production releases to this existing Bergen project.
Do not create another project or change Fellestall's project, domains, workflows,
credentials, ETL, Neon or account authentication.

## Required GitHub setup

The current integration receives HTTP 403 when creating environments or reading
secret/variable metadata. Environment creation was rejected; no token was read or
copied. An authorized repository administrator must configure:

1. **Settings → Environments → New environment → `bergen-simulator`**. Do not edit
   `vercel-migration` or another existing environment.
2. **Deployment branches and tags → Selected branches and tags**: add exactly one
   **branch** rule, `feature/bergen-simulator`. No wildcard, tags, main or gh-pages.
   The workflow verifies the policy before scheduling the deployment job. No new
   approval/wait timer is needed for fully automatic releases; retain any required
   review policy. Only trusted maintainers should push this branch.
3. Add **environment-scoped secret `VERCEL_TOKEN`**, authorized for the stated Bergen
   project/team. Use least privilege for configuration pull, prebuilt deployment,
   project/protection/domain/deployment reads and promotion. Do not copy Fellestall's
   token, create a repository/organization token secret, or put it in source/logs/chat.
4. **Only after the environment and its token are ready**, add repository Actions
   variable **`BERGEN_SIMULATOR_DEPLOY_ENABLED` = `true`** under Settings → Secrets
   and variables → Actions → Variables. This arming flag avoids GitHub automatically
   creating an unrestricted environment or using a same-named repository secret
   while setup is incomplete. The validation job has no environment or token.
5. Push a reviewed simulator/workflow change, or re-run all jobs of the initial
   branch workflow. Setting the variable alone does not start a run.

The deployment token is injected only into authenticated deployment-job steps.
The GitHub token has only `contents: read`. No secret-read/write permission or
Fellestall production environment is requested.

## Triggers and default-branch limitation

`.github/workflows/bergen-simulator.yml` runs on pushes to the exact simulator branch
that affect `apps/bergen-simulator/**` or that workflow file. Both jobs additionally
check repository, exact ref, push/manual event and non-deletion. Unique concurrency
is `bergen-simulator-release-${github.ref}`, cancellation disabled. No Fellestall
concurrency group is shared; obsolete commits refuse promotion.

A new push workflow can run from this feature branch without existing on main.
Manual `workflow_dispatch` discovery normally requires it on the default branch,
so the Run workflow button/API may be unavailable. Use branch pushes or re-run an
existing branch run. Do not change main to enable manual dispatch.

## Validation and staged release

1. Check out `github.sha` without persisted credentials. Full history supplies the
   isolation baseline. Verify repository, branch/event and exact HEAD; detached
   checkouts require matching CI metadata.
2. Run Node 24, `npm ci`, lint, application/release-policy tests, isolation and Vite
   build in the app. Any failure stops deployment.
3. If unarmed, report validation success and skip deployment without a Vercel request.
   If armed, verify the environment's exact branch policy. Missing token fails before
   deployment tooling or any Vercel operation.
4. Use pinned CLI **63.1.2** and SHA-pinned checkout/setup-node Actions. Require exact
   team/project IDs and API ownership, Authentication scope `all`, only known Bergen
   domains, and no custom app variables. Create an app-local explicit link.
5. Pull only Bergen production configuration. Run `vercel build --prod` **without
   the deployment token**. Normalize a repository-relative root only in runner-local
   settings because commands execute inside the app; restore the pulled link afterward.
   No remote build settings are changed.
6. Stage with `vercel deploy --prebuilt --prod --skip-domain`. Require READY, exact
   repository/branch/SHA metadata and project/team, then anonymous denial on `/` and
   `/data/bergen.json`. Stable domains have not moved.
7. Before promotion re-read protection/domains/deployment and verify the latest
   GitHub branch SHA. Promote through the established project-scoped API pattern,
   only for Bergen. Unverifiable protection aborts. No alias, DNS or protection
   mutation API is called.
8. Poll the stable alias for the intended deployment; recheck READY, commit,
   unchanged project domains, protection and anonymous denial. Save non-secret
   evidence in the Actions summary. Always remove runner-local `.vercel/`, pulled
   environment files and prebuilt output; never upload them or raw authenticated logs.

`vercel.json` keeps **`git.deploymentEnabled: false`**. Native Git is disabled while
this explicit CLI workflow can deploy. Do not enable both routes if Git access returns.

## Authenticated verification without permanent bypass secrets

CLI 63.1.2's `vercel curl` can create a persistent automation bypass secret; this
pipeline does not use it or mutate protection. If pulled configuration contains an
existing short-lived `VERCEL_OIDC_TOKEN` belonging to Bergen, send it only to the
exact app origin as a Trusted Sources authentication header and compare HTML/data
to the prebuilt output. Never print/export the token.

If unavailable, expired or denied by existing Trusted Sources rules, explicitly
report authenticated verification unavailable. READY, commit, stable alias,
All Deployments protection and anonymous denial remain mandatory. Do not broaden
access rules to make checks pass. An authorized Vercel member can verify the UI in
a signed-in browser. A login page never counts as application content.

## Local checks

From the app: `npm ci`, `npm run lint`, `npm test`, `npm run check:isolation`,
`npm run build`. From the repository root: `actionlint .github/workflows/bergen-simulator.yml`.

Release-policy tests reject wrong repositories/branches/commits/IDs, partial or
missing protection, unready deployments, unrelated/changed domains, wildcard/tag
environment rules and false-positive anonymous checks. No tests deploy or connect
to databases. Game functionality and visual design are unchanged.
