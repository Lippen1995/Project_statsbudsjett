# Native desktop and mobile profiling

No physical-device measurements were performed for 5C. The managed executor exposes
no native GPU/attached test handset for this work. The automated browser suites force
SwiftShader and a mobile **viewport**; those are not physical-device FPS results.

This procedure adds no telemetry, public diagnostics, credentials or protection bypass.
Use only your own authorized browser and keep profiles local.

## Reproduce builds without touching main

From `apps/bergen-simulator`, Node 24:

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4180 --strictPort
```

Use the committed version-5 `public/plans/sustainable-quarter-example.json` in both
5B and 5C. The app's exported plan contains synthetic inputs, not derived outcomes.
For an automated software baseline, `npm run test:connected-baseline` archives exact
`c334ba6` into a temporary directory, builds/serves port 4181 and copies the same
profiler there. It neither switches branches nor edits the source/production tree.
Do not run CPU/GPU benchmarks concurrently. The automated profiler intentionally
forces SwiftShader; running it on a physical computer does not turn it into a native
GPU benchmark.

For native comparison use two separate local checkouts/archives, both on the simulator
history, with each commit's locked dependencies. Serve the baseline on 4181 and the
candidate on 4180, one measurement at a time. Do not change main or application
quality defaults between runs.

## Desktop

1. Record browser/version, OS, actual GPU/driver, viewport, DPR, quality setting,
   power mode and whether the browser actually uses native GPU acceleration. Inspect
   browser graphics diagnostics (`chrome://gpu` in Chromium); do not infer native
   hardware from the absence of a software-renderer command-line flag. Do not share
   device identifiers, session information or whole graphics dumps without review.
2. Open `http://127.0.0.1:4180/?capture=1` in the actual installed browser, without
   SwiftShader/disable-GPU flags. DevTools Performance should capture a cold page load
   and a separate warm interaction recording. Record download/parse/validation,
   main-thread long tasks and worker startup/processing as separate intervals.
3. Inspect local-only readouts in the Console:

   ```js
   JSON.parse(document.querySelector('canvas').dataset.preparation)
   JSON.parse(document.querySelector('canvas').dataset.capture)
   ```

   Preparation stages include main validation/hydration, total worker roundtrip and
   worker geometry phases. Roundtrip includes startup, clone, computation, transfer
   and hydration; its remainder is not a separately measured boot duration. Capture
   records draw calls, triangles, retained typed attribute arrays/bytes and frame
   counters. Attribute bytes are not native GPU VRAM. Native worker peak heap and
   GPU allocations require DevTools/native tooling; report them unverified if absent.
4. Import the same plan, open Living City, advance six months, inspect month zero,
   edit a schedule, undo/redo, play two months, pause, switch saved strategies, then
   repeat reset → month 24 at least five times. Record command-to-ready separately
   from input-to-visible-frame latency. Include worker message/validation time and
   check obsolete workers terminate in the DevTools thread list.
5. For identical camera probes, dispatch the existing local capture command, starting
   a Performance recording before it:

   ```js
   document.querySelector('canvas').dispatchEvent(new CustomEvent('bergen:capture', {
     detail: {position: [-450, 620, 600], target: [30, 0, -200]}
   }))
   ```

   Alternate x between −450 and −420, discard two warm samples, retain at least 12
   raw samples. Also test actual mouse drag/pan/zoom and keyboard navigation; synthetic
   events alone do not establish input-device responsiveness. DevTools frame timing
   and the capture CPU timer do not necessarily measure completed GPU presentation.
6. A paused, settled city must stop producing frames. Compare the capture `frames`
   counter twice with a one-second gap. Then change a month/selection and verify one
   necessary update. Do not add a requestAnimationFrame loop just to display FPS.
7. Use DevTools Memory snapshots after comparable explicit GC where available.
   Compare retained geometries/typed arrays and workers after several replay cycles.
   Record native/GPU memory separately if tools expose it. A stable JS heap alone
   does not prove absence of browser/native memory leaks.

## Mobile

On an owned Android handset with authorized USB debugging, an existing ADB setup can
run `adb reverse tcp:4180 tcp:4180` and `adb reverse tcp:4181 tcp:4181`. This exposes
only the local preview to that device's localhost. Open the local URL on the handset
and inspect via desktop Chrome remote debugging. Record the real GPU, native browser,
DPR, thermals and battery/power state; do not equate a 390×844 desktop viewport with
this test. Test touch orbit/zoom, scrolling controls, schedule editing, undo/redo and
pause/idle retention. Keep captures local and remove forwarding afterwards.

If no USB/native profiling setup is available, use normal authorized Vercel access
on the actual device for usability, with its browser's supported tools. Mark metrics
that cannot be collected as unverified. No unaudited iOS performance claim is implied.

## Protected hosted deployment

Open `https://bergen-reimagined.vercel.app` through normal Vercel Authentication.
Keep All Deployments protection enabled. The localhost capture readouts must remain
absent on the hosted URL, including `?capture=1`. Use normal browser DevTools for
hosted measurements; never change the hostname guard, create bypass tokens, disable
Authentication or publish a tunnel to expose privileged diagnostics.

Results template: commit, environment, native GPU confirmed yes/no, viewport/DPR,
quality, raw readiness/long-task/camera/command samples, worker timing scope, retained
attribute bytes/geometries, native-memory availability, paused idle frame delta,
scenario input hash and observed limitations. Publish only reviewed aggregates and
synthetic city screenshots. Neither this procedure nor the app uploads profiles.
