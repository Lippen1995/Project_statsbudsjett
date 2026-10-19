# R1C budgets fixed before model integration

Baseline d278ec9a5f17f5750c4a62a0bfae6c0ee891e0f8. Same Chromium SwiftShader,
1440×1000 / touch 390×844, DPR1, balanced/low, CSP and identical fixed cameras.
Camera method: four warm-ups, 12 retained two-RAF + gl.finish samples; intrusive
software-driver completion, never hardware FPS or touch-to-photon.

- Keep one atlas 1024²; no extra texture or shadow map.
- Max 8 settled calls, max 292,500 triangles; <=31.5 MiB scene attributes.
- Landmark high detail <=4,000 triangles, full tile <=1 MiB transfer.
- High-detail body replaces existing body in one batch; no per-building React tree.
- High detail only within 100 m, hysteresis exit 130 m; source fallback in low power.
- Scene readiness <=baseline×1.25+500ms, camera median <=×1.25+30ms,
  P95 <=×1.25+50ms. Investigate failures, do not silently relax guards.
- Zero settled frames over 700ms; stable allocations and <5MiB post-GC growth.
- Every feature retains source ID; load/integrity/cancellation failures keep old city.
- Photograph-derived detail is inferred historical reconstruction, not surveyed/current.
  Unknown north end remains schematic; no invented windows. Native GPU and independent
  Bergen-expert recognition remain open review gates.
