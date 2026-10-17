# 4B acceptance evidence

All coordinates, sources and interpretation limits are documented in
[Milestone 4B](../milestone-4b.md). These are hypothetical concept buildings, not
observations of new construction or proof of available land.

- [Observed city, fixed camera](01-observed-bergen.jpg)
- [Live building preview and numeric controls](02-building-preview.jpg)
- [Rejected placement](03-invalid-construction.jpg)
- [Player-developed city, same fixed camera](04-developed-bergen.jpg)
- [Two saved development alternatives](05-plan-comparison.jpg)
- [Touch-placed construction, mobile viewport](06-mobile-construction.jpg)
- [Complete construction browser acceptance and performance](after-browser-report.json)
- [Exact 4A before-implementation browser baseline](before-browser-report.json)
- [Validation and isolation checks](validation.json)
- [Public-space regression](public-space-regression.json)
- [Street-planning regression](street-sandbox-regression.json)
- [Explorer regression](explorer-regression.json)
- [Geographic visual regression](geographic-visual-regression.json)
- [Real-source site survey and source hashes](site-audit.json)
- [Player-created combined scenario exported and reloaded in acceptance](combined-development-plan.json)
- [Three-purpose, verified challenge example](../../../apps/bergen-simulator/public/plans/urban-quarter-example.json)

The current and baseline camera probes use 12 settled samples after two warm-ups.
All browser profiles use Chromium's SwiftShader software renderer; physical-device
GPU performance is unverified. Memory numbers are bounded diagnostic checks, not
a claim that every browser or long session is free of leaks. The original 4A
baseline was captured before any renderer changes. Reproduce it with
`npm run test:building-baseline`, then run `npm run test:buildings` against a built
local preview on port 4180. The actual production CSP is applied by the harness;
no Vercel Authentication or production security settings are bypassed or changed.
