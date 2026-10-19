# R1C physical-device acceptance — not yet performed

This is a procedure for a future engineer with owned hardware, not a request for
the mobile-only product owner to install or configure anything. This execution
environment has no physical GPU/phone. Chromium SwiftShader is **not** a substitute.

Use the existing [safe local profiling setup](../milestone-5c-evidence/physical-device-profiling.md)
with exact R1B commit d278ec9a5f17f5750c4a62a0bfae6c0ee891e0f8 and the released R1C
commit. Use separate disposable feature snapshots and identical app dependency locks;
no main changes, root build, environment pull, production credentials or DB access.

1. On owned desktop Chrome/Edge or Safari, verify the active hardware renderer in
   the browser/OS tools. Do not launch with SwiftShader or software-forcing flags.
   Record device/GPU, OS/browser, power mode, thermal state, viewport, DPR/quality,
   network/cache conditions and exact source/build hashes. If a hardware counter is
   unavailable, label it unavailable; geometry counts are not VRAM measurements.
2. Use the same seven poses in `tests/landmark-views.json`, plus the four street-tour
   controls. Capture frontal, angled, roof and capital views at desktop and actual
   phone sizes. Record the width-scaled LOD boundary (100/130 m max; 39/50.7 m at
   390 CSS px), matching silhouettes and any transition artifacts.
3. Record at least three cold/warm loads and a fixed 30 s orbit/zoom sequence in
   browser Performance/Rendering tools. Use native frame/presentation and main-thread
   traces; do not equate the automated two-RAF/gl.finish driver probe to hardware FPS.
   Record median/P95 frames, long tasks, input response and when the city is usable.
4. On an owned iPhone/iPad, use Safari Web Inspector from an authorized owned Mac;
   on Android, use the existing authorized USB debugging/localhost-forwarding setup.
   Confirm the actual handset GPU/browser. Normal profiling remains possible when
   loopback-only capture counters are unavailable. Never broaden the hostname guard,
   expose a privileged diagnostic endpoint or weaken Vercel Authentication for this.
5. Pick the seven source IDs and a Skur capital with actual touch and mouse. Complete
   the four-view tour, skip/reduced-motion/return, keyboard controls, terrain/wall
   clearance, proposed/observed toggle and one saved-plan reload. Review the five
   fidelity criteria against the licensed dated references, recording shortcomings.
6. Run five near/far tile evictions and scenario switches, then inspect JS retention,
   live textures/geometries and available native/GPU process memory. Account for
   DevTools/console/snapshot retention before attributing leaks to the app. Medium
   and high body buffers may both be cached until eviction; repeated cycles must
   settle rather than grow. Verify no app frames during a settled paused interval.

Keep traces local and inspect them for credentials before sharing. No telemetry,
permanent bypass token, public LIVE deployment, authentication change or production
profiling endpoint is needed. Record actual results separately; this document is
not a hardware pass receipt or a completed Bergen-expert recognition review.
