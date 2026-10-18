# R1B performance — exact R1 comparison

Local production builds, Chromium 151.0.7922.173 / ANGLE SwiftShader, desktop
1440×1000 and touch-enabled mobile viewport 390×844, DPR 1. Same fixed cameras,
CSP and sequential harness. These are software regression probes, **not native
FPS, iPhone measurements, touch-to-photon latency or evidence of physical GPU gains**.
No physical GPU or owned handset is available in this environment.

| Case | Completed scene ready ms, R1 → R1B | Camera median ms | Camera P95 ms | Settled Three.js calls |
|---|---:|---:|---:|---:|
| desktop-balanced | 3639.2 → 3334.4 | 349.1 → 314.2 | 399.3 → 396.5 | 6 → 7 |
| desktop-low | 3639.2 → 3334.4 | 273.1 → 253.6 | 285.4 → 283.2 | 5 → 5 |
| mobile-balanced | 2185.9 → 2516.8 | 189.9 → 186.3 | 215.5 → 247.7 | 6 → 7 |
| mobile-low | 2185.9 → 2516.8 | 102.2 → 119.3 | 141.2 → 173.0 | 5 → 5 |

Readiness is the initial balanced page startup, repeated in each page's low-tier row for context. Low camera probes run after switching quality; cold low-only startup was not independently timed.

All predeclared relative guards passed: ready ×1.25+500 ms, camera median
×1.25+30 ms and P95 ×1.25+50 ms. The mobile readiness/P95 increases remain a
material concern for physical testing, even though within these software guards.
Variation under a shared CPU quota does not establish a general speed improvement.
The low path renders unchanged source geometry; its measured mobile cost still
varies and must not be dismissed as proof of hardware equivalence.

The camera probe waits for two presentation opportunities and calls `gl.finish()`.
It measures intrusive driver completion after a fixed camera command, not display
presentation or ordinary asynchronous rendering throughput. Twelve retained samples
follow four warmups. Raw CPU callback and pre-finish timings remain in metrics.
Worker ResourceTiming entries can contain cross-clock artifacts; stage diagnostics
and worker round-trip measurements are the useful timing references.

Near balanced: **288,140 → 288,104** triangles; **27,056,370 → 29,066,598** typed
attribute/index bytes (+2,010,228 bytes). These are retained JS geometry arrays,
not measured native GPU VRAM. Low retains 288,140 source triangles and its source
attribute bytes. The extra asset is **192,588 bytes** transfer payload plus a
~14 kB gzip deferred loader chunk. No external runtime asset service.

One extra 1024² JPEG atlas: estimated 4 MiB RGBA level zero / ~5.33 MiB with full
mips, not a measured driver allocation. No new shadow/reflection texture. Seven
near GPU geometry objects on cold detailed startup; up to eight after warming
both source/index views. They share source attributes, not duplicate city vertices.
Low can retain the bounded index-view allocation after switching; the atlas and
asset geometry are disposed. Repeated eviction/re-entry remains bounded. Source-attribute buffers are shared; the extra geometry counter is an index view. Exact
counters and heap probes are in [asset report](assets/report.json).

Zero settled idle frames in every case. Five camera cycles retain stable live
allocations and post-GC JS growth below 5 MiB; raw growth is tens of kilobytes in
these runs. Native/worker peak memory, VRAM, power, thermal behaviour and real
physical input responsiveness are unverified.

## Investigated regressions and fixes

1. Initial sequential asset startup failed desktop readiness: 5,344.7 ms against
   5,049.0 ms guard. [Failed report](diagnostics/sequential-startup-failed.json).
   Loading alongside the existing geographic worker removed the additional cold
   startup pass. The same thresholds were retained.
2. A passing performance run still showed mobile shadow artifacts on flat photo
   planes. [Rejected visual](diagnostics/rejected-mobile-shadow-acne.jpg) and
   [raw pre-correction report](diagnostics/pre-visual-correction.json) are retained.
   Photographs now avoid duplicate receiving/self-shadow treatment; body casts
   remain, photograph geometry winding and linear colour encoding are corrected.
   The final images and measurements above are from the corrected renderer.
3. Default glTF embedded texture loading violated the existing CSP through a blob
   fetch. Direct embedded-byte decoding fixed it, without changing CSP/Auth.

## Reproduce / physical devices

`node tests/capture-architecture-baseline.mjs` builds exact b827783 in an archive;
`node tests/architecture-browser.mjs` measures the app on localhost:4180. The detail
baseline helper captures extra matching axial/row closeups. No branch switching.
Run sequentially without other CPU-heavy work. Local capture remains opt-in and
hostname restricted. Standard developer tools on authorized physical devices can
record the same views without SwiftShader; follow
[the existing procedure](../milestone-5c-evidence/physical-device-profiling.md).
No hosted privileged diagnostics, authentication bypass, telemetry or secret is added.
