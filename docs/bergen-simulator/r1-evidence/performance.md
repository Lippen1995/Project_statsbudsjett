# R1 software-renderer measurements

Chromium 151.0.7922.173, ANGLE SwiftShader; DPR 1; desktop 1440×1000 and touch/mobile 390×844. Baseline `7243b53544ffbae88d680eb7df531cd67f273ded`. Same fixed camera fixtures, four warmups and twelve samples per quality/viewport. No physical GPU/FPS claims.

Final timing: two RAF opportunities followed by explicit WebGL `finish()`; readiness also waits for driver completion. Both builds were rerun with this same harness. This is intrusive local driver-completion QA, not physical display latency or typical asynchronous FPS. Raw callback/pre-finish times remain in the JSON. The original relative/absolute budgets were not relaxed. Earlier failed/unsynchronized diagnostics are retained separately.

| Viewport / quality | Ready before → after (ms) | Camera median before → after (ms) | P95 before → after (ms) | Settled calls |
|---|---:|---:|---:|---:|
| desktop-balanced | 3848.6 → 3671.7 | 327.7 → 359.9 | 515.2 → 412.9 | 5 → 6 |
| desktop-low | 3848.6 → 3671.7 | 273.9 → 283.5 | 319.2 → 301.2 | 5 → 5 |
| mobile-balanced | 2128.8 → 2699.3 | 181.5 → 206.1 | 201.3 → 280.8 | 5 → 6 |
| mobile-low | 2128.8 → 2699.3 | 102.3 → 119.1 | 122.3 → 155.8 | 5 → 5 |

All final guards passed. The visual additions have a measured cost: balanced medians are higher in this paired sample. Software/CPU-quota variation remains substantial; do not infer physical-device improvements. Initial readiness compares the old overview with the new waterfront landing; fixed-camera probes use identical poses.

Source triangles remain **288,140**. Roof accents add **109 line segments**, **7,848 typed bytes**, one near-view balanced pass and zero textures. Attached geometry attributes grow from **27,048,522** to **27,056,370 bytes** (~0.03%). Low power and distant views draw five source passes; balanced near views draw six. The existing 1024² shadow texture is reused. Typed attribute bytes are not driver/native VRAM.

| Viewport / quality | Post-GC heap growth in five camera cycles (MiB) | Live GPU geometry count | Idle frames |
|---|---:|---:|---:|
| desktop-balanced | 0.024 | 6 (stable) | 0 |
| desktop-low | 0.016 | 5 (stable) | 0 |
| mobile-balanced | 0.013 | 6 (stable) | 0 |
| mobile-low | 0.018 | 5 (stable) | 0 |

The geometry worker terminates after preparation. Full worker-stage timings and long tasks are in the raw JSON. Main-thread hydrate/validation still causes a substantial startup block; it is not solved by this milestone. No physical device, native VRAM, GPU energy, peak worker heap or native leak test was available. See the [native profiling procedure](../r1-quality-benchmark.md#reproduction-and-physical-devices).

The callback-only, two-RAF and pre-low-fallback diagnostics are retained under `diagnostics/`; they are not the final acceptance measurements. One unsynchronized mobile-low run failed its median guard; publication remained blocked until both builds were measured with explicit driver synchronization and all final guards passed.
