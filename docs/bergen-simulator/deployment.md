# Separate Vercel project — readiness and manual configuration

## Current state

No deployment, remote push, PR, project creation, project linking, DNS change or
environment change has been performed. Vercel's read-only project listing showed
the existing `fellestall` and `project-financials` projects, with no simulator project.
The production project was not edited. `apps/bergen-simulator/vercel.json` disables
automatic Git deployments and contains the independent static build configuration.

The feature branch currently exists locally. Pushing it or importing a connected
Git project may trigger a public build, especially if done through the existing
Fellestall project. Therefore live linking/import is deferred until explicit approval
for the separate public deployment. This document is the exact manual setup path.

## Settings for the new project

| Setting | Value |
| --- | --- |
| Team | The intended owner team, confirmed before project creation |
| Project name | `bergen-reimagined` (or an available distinct simulator name) |
| Git repository | `Lippen1995/Project_statsbudsjett` |
| Root Directory | `apps/bergen-simulator` |
| Include source files outside Root Directory | Off |
| Framework Preset | Vite |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Development Command | `npm run dev` |
| Production Branch | `feature/bergen-simulator` |
| Environment variables | None; do not import or share any |
| Storage / integrations | None |
| Domain | Only the new project's independent `*.vercel.app` domain |
| Existing production project | Do not select, link, edit or reuse |

## After explicit approval

1. Review the feature branch and run all checks. Confirm only the two simulator
   directories are added. Check that the existing Fellestall project's Git settings
   cannot publish this branch. Do not change that project's settings to make this work.
2. Push **only** `feature/bergen-simulator`; do not merge, dispatch workflows or
   create a main-targeting PR. If existing hosting would publish a preview and that
   is outside the approval, stop before pushing and resolve the risk.
3. In the correct Vercel team create a **new** project with the settings above.
   Do not click an import/deploy action until public deployment is approved. Some
   import screens immediately create a deployment, so stop at that screen if needed.
4. Verify Settings → Git → Production Branch is exactly
   `feature/bergen-simulator` **before** any production deployment. If the import
   screen cannot set it before the first build, create an empty project without
   Git integration, configure root/build settings first, then connect the repository
   and set the production branch before enabling deployment.
5. For manual approved releases, retain `git.deploymentEnabled: false`. Trigger
   the first release explicitly from this branch using the new project's dashboard
   after checking the actual source ref, or a CLI explicitly linked **inside this
   app directory to the new project**. Never use inherited `VERCEL_PROJECT_ID`,
   production tokens or root `.vercel/` state. Do not run CLI `--prod` while linked
   to any existing project.
6. If automatic Git releases are separately approved, change only this app's
   `vercel.json` Git switch to
   `"deploymentEnabled": { "feature/bergen-simulator": true, "*": false }`.
   Review the project production branch again before pushing that change. All other
   branch deployments should remain disabled for this simulator project.
7. Leave custom domains empty. Use only the new project's generated `vercel.app`
   hostname. Leave Fellestall DNS, Neon, shared secrets and project settings untouched.
8. Validate the isolated deployment: geography 200, unknown assets 404, scene loads,
   navigation/selection work, no external runtime requests, desktop/mobile layouts,
   attribution and noindex headers. No production database is involved.

The checked-in config intentionally has no SPA catch-all rewrite: this prototype
has one route, and missing geographic assets must remain genuine 404 responses.
Each future deployment and promotion still needs explicit authorization until the
user establishes a different release policy.
