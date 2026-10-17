# Performance observations

Chromium 151, SwiftShader, DPR 1, desktop 1440×1000 and touch/mobile **viewport**
390×844. No physical GPU/handset measurements. Runs are sequential; native GPU FPS,
VRAM, power and peak native worker heap remain unverified.

An exact clean 5C `830a39f` build was measured before implementation. Because an initial
5D desktop camera sample was slower despite identical draw/triangle counts, the same
existing profiler was repeated against an archived exact 5C app and the candidate,
with the same dependency lockfile and no simultaneous benchmark jobs.

| Same legacy plan / probe | Initial 5C | Initial 5D | Repeated exact 5C | Repeated 5D |
|---|---:|---:|---:|---:|
| Desktop scene readiness / ms | 3325 | 3475 | 3740 | 3625 |
| Mobile viewport readiness / ms | 3020 | 2144 | 2329 | 2192 |
| Desktop camera median / ms | 355.7 | 408.1 | 383.5 | 367.5 |
| Desktop camera p95 / ms | 447.6 | 451.7 | 403.1 | 406.2 |
| Mobile viewport camera median / ms | 289.5 | 188.8 | 221.6 | 189.5 |
| Mobile viewport camera p95 / ms | 375.4 | 216.5 | 274.0 | 223.5 |
| Settled retained geometries over five district replays | 10 each | 10 each | 10 each | 10 each |

These samples show substantial software-renderer variance, including warm/cold worker
execution and browser scheduling. The repeat does not demonstrate a causal optimization
or physical-device improvement. The 5C preparation-worker output and all five observed
geometry batches remain unchanged. Source-only rendering remains five calls / 288,140
triangles / 27,048,522 typed attribute/index bytes. A larger geographic renderer change
is not justified by these samples alone.

The repeated source-worker roundtrip was 1782/999 ms in 5C and 925/922 ms in 5D
(desktop/mobile), while main hydration was 212/89 and 99/104 ms. The worker artifact
and source data are identical; timings are observations, not evidence of different
geometry-preparation work. Startup longest main tasks were 465/93 versus 110/109 ms.
Raw stage timings, long tasks, CPU/heap counters and resource timings are retained in
both repeated reports. Main heap growth across five comparable district replays was
0.17/0.17 MiB for exact 5C and 0.53/0.16 MiB for 5D, below the 5 MiB regression bound.

The connected example adds one dashed access batch, 40 triangles and approximately
2,880 position/colour bytes over the same developed traffic scene (11→12 draw calls,
289,528→289,568 triangles). Preview node/vertex markers use one bounded instanced pass;
no per-building/household/vehicle components or persistent animation is introduced.
Accepted access is ≤8×80 m with ≤5 vertices/link: at most 480 dash triangles. Transient
markers allocate at most 32 instances; obsolete batches are disposed.

Access replay checks sample **current** renderer allocation counters through the
localhost-only `bergen:memory` event, without invalidating the scene. Last-frame capture
counters may precede React's post-frame disposal and are retained separately, not
misidentified as a leak. The event has the same localhost + capture=1 gate as existing
instrumentation and exposes no production diagnostics, service data or bypass.

See the final `access-browser-report.json` for connected worker execution, repeated
camera samples, five-run heap/geometry retention and desktop/touch editing evidence.
The connected orchestration prepares the displayed month, pauses district playback,
recomputes validated inputs in a one-shot worker and performs no settled rendering.

Final connected-plan replay (visible canvas; corrected viewport probe):

| Measure | Desktop | Touch/mobile viewport |
|---|---:|---:|
| Connected worker execution / ms | 177.7 | 145.9 |
| Visible connected camera median / ms | 396.3 | 196.0 |
| Retained geometries after five runs | 12.0 | 12.0 |
| Post-GC heap growth / KiB | 361.4 | -25.8 |

Both five-run geometry sequences stay at 12; settled idle frames remain zero.
The standard-rate challenge passes; two-storey housing produces 8 trips versus
13 with three storeys. These are deterministic game outcomes, not measured traffic.
