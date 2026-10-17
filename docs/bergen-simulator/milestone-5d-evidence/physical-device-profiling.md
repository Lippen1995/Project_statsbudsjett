# 5D physical-device procedure

No native GPU, handset or ADB device is available to this executor. All automated
measurements use Chromium 151 / SwiftShader with desktop and touch/mobile viewports.
They are not hardware FPS, VRAM, power or touch-to-photon measurements.

Use the [existing detailed native procedure](../milestone-5c-evidence/physical-device-profiling.md)
without weakening Vercel Authentication. Build/serve localhost with Node 24; use an
owned handset with authorized USB reverse forwarding/remote debugging where available.
Keep recordings local; add no telemetry, public diagnostic endpoint or bypass secret.
The current local capture instrumentation remains hostname-gated and demand-rendered.

For exact baseline comparison, archive commit `830a39f` to a separate temporary folder
with `git archive 830a39f apps/bergen-simulator docs/bergen-simulator`. Extract there,
install that application's lockfile with `npm ci` and serve its independent build on
localhost:4181. Serve 5D on localhost:4180. This does not switch the working branch,
modify main, or change deployment settings. Measure one build at a time with identical
native browser/GPU/power/DPR/viewport and input settings.

1. Cold-load both builds and record actual GPU/browser/OS, scene readiness, long tasks,
   geometry worker startup/processing/transfer, CPU and native/browser memory separately.
2. Import `sustainable-quarter-example.json` in both builds. Run identical existing
   `tests/connected-browser.mjs`/manual camera, schedule, undo/redo and playback probes.
   Automated scripts deliberately force SwiftShader; run native checks manually without
   software-renderer flags and verify acceleration in browser GPU diagnostics.
3. In 5D import `connected-quarter-example.json`, then run the same input-only plan
   without access for an unconnected comparison. Frame the city with local capture:
   position `[-220,240,40]`, target `[-40,0,-250]`.
4. Select each proposed building, draw an access proposal, change node/portal/bends,
   test invalid terrain/building placement, undo/redo preview and commit. Record
   pointer-to-preview and command-to-ready independently. Check both touch and keyboard.
5. Advance Living City to month 24; enable connected transport and record its worker
   execution time/readout. Change the home from three to two storeys and rerun. Compare
   saved strategies, pedestrian-only/no-access cases and reset. Repeat at least five
   times; inspect retained geometries/typed attribute bytes, JS heap, native allocations
   and worker lifetimes separately. Stable JS heap is not proof of zero native leaks.
6. Probe the existing capture camera from `[-450,620,600]` and `[-420,620,600]`, targeting
   `[30,0,-200]`: two warmups, at least twelve samples. Also record real orbit/pan/zoom
   inputs. Capture timing is not completed-GPU-presentation latency.
7. Settle every view. Verify the canvas capture `frames` counter remains unchanged
   after ≥1 second. Repeat with a completed transport result and a paused district.
   Source-only view should retain five batches; planning adds its existing passes;
   confirmed access adds one dashed batch, transient markers one instanced pass.
8. Record median/p95/raw samples, regressions and device limits. Keep native worker
   peak heap/VRAM unverified if tooling does not expose them. Never convert SwiftShader
   viewport timings into claims about actual mobile/desktop GPUs.
