# R1B → R1C software-renderer comparison

Exact baseline d278ec9a5f17f5750c4a62a0bfae6c0ee891e0f8. Chromium 151.0.7922.173,
ANGLE SwiftShader, same local production CSP/viewport/DPR1/quality/cameras. Sequential
cold-page probes; four camera warm-ups and 12 retained samples. Two RAF opportunities
plus gl.finish synchronize software driver work. This is intrusive completion latency,
**not native GPU FPS, display latency or touch-to-photon**. Host CPU quota/throttling
and software variance prevent performance-improvement claims.

| Viewport / quality | Initial balanced readiness ms | Camera median ms | Camera P95 ms | Settled frames |
|---|---|---|---|---|
| desktop-balanced | 4074.2 → 3606.3 | 370.3 → 387.1 | 472.9 → 411.8 | 0 |
| desktop-low | 4074.2 → 3606.3 | 280.5 → 288.7 | 448.0 → 301.4 | 0 |
| mobile-balanced | 2376.9 → 2433.6 | 204.6 → 188.8 | 247.5 → 198.5 | 0 |
| mobile-low | 2376.9 → 2433.6 | 114.4 → 108.6 | 154.0 → 112.6 | 0 |

Readiness is one initial balanced startup reused in the low row, not a separately
cold low-only launch. Both readiness and camera probes pass the predeclared relative
regression guards. Changes in the unchanged low renderer illustrate software-host
variance, not an iPhone improvement. Native GPU/VRAM, physical touch, power/thermals
and worker peak native memory remain unverified.

## Geometry, transfer and resources

- Full current architectural GLB: **675280 bytes** vs R1B 192,588 bytes;
  geometry remains uncompressed inside GLB. No extra texture or decoder dependency.
- Skur medium/high: **760 / 3716 triangles**,
  same single body batch. Six other bodies and one 1024² atlas remain shared.
- Balanced waterfront: **288,104 → 288848 triangles**, **7 → 7 calls**.
  The five-camera performance set peaks at **291786 triangles**, still within the 292,500 guard.
- Scene-attached typed attributes: **29,066,598 → 29146950 bytes** at waterfront;
  close view max **29466198 bytes**. This is not total VRAM
  or peak CPU memory; unused owned LOD buffers are not scene-attached.
- Low stays **5 calls / 288,140 triangles / 27,056,370 attribute bytes**.
- The logical atlas remains ~4 MiB RGBA base / ~5.33 MiB with mips; this is an estimate,
  not a physical driver allocation. One existing shadow map remains.
- Post-GC camera-cycle heap deltas: desktop-balanced 27852 bytes; desktop-low 10956 bytes; mobile-balanced 34096 bytes; mobile-low 23564 bytes.
  Live geometry counts/attributes are stable across five cycles; settled idle frames are zero.
  Warm GPU geometry counters can include both medium/high LODs until tile eviction;
  ownership and repeated eviction checks bound them rather than claiming zero caching.

The initial 6-segment medium capital missed the high model's maximum by 5.1 cm;
8-segment geometry fixes the silhouette without weakening its 4 cm QA guard.
The selected-landmark perimeter avoids costly/cluttered x-ray edge rendering.
No continuous vehicle/people/water animation or simulation change was introduced.

Raw per-stage source/geometry-worker, architectural fetch/decode/batch, long-task,
resource, CPU callback, driver, heap and viewport records are in
[before](before/metrics.json) and [after](after/metrics.json). Long tasks and total
worker time include this software host; they are not facade-accuracy measurements.
Use the existing [physical-device procedure](../milestone-5c-evidence/physical-device-profiling.md)
on owned hardware, exact commits and these camera fixtures, with no SwiftShader flags,
production diagnostics, telemetry, privileged access changes or Authentication bypass.

## Separate close-range probes

Same fixed street-frontal/detail cameras, DPR1, balanced tier, four warm-ups and
12 retained driver-completion samples. All original relative guards pass.

| Close view | R1B median → R1C ms | R1B P95 → R1C ms |
|---|---|---|
| desktop-street-frontal | 258.9 → 297.6 | 294.3 → 356.8 |
| desktop-detail | 424.2 → 427.3 | 562.3 → 506.0 |
| mobile-street-frontal | 141.5 → 168.9 | 166.6 → 204.6 |
| mobile-detail | 197.8 → 207.6 | 238.3 → 247.8 |

The initial fixed-distance mobile front used fine relief unnecessarily and measured
195.3 ms median versus R1B 141.5 ms. After scaling the 100/130 m thresholds by
min(1, canvas CSS width/1000), this view uses the 760-triangle silhouette LOD and
measures 168.9 ms; the closer detail view retains 3,716-triangle geometry. This is
a measured software regression mitigation, not a native-GPU speed claim. Other
source/material/GPU differences and host variance remain; no relative guard was relaxed.
Raw [before](close-before/metrics.json), [after](close-after/metrics.json),
[pre-optimization diagnostic](diagnostics/close-before-viewport-lod.json). All close
views retain zero settled idle frames and unchanged draw-call/texture budgets.
