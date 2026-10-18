# R1 visual evidence

Baseline `7243b535` and R1 use the same pinned geographic snapshot and three exact
camera poses in `tests/quality-views.json`. These are local production-build captures
with the production CSP, DPR 1 and software Chromium. No photo or geographic asset was
generated to fill source gaps. The surface finish and lighting are illustrative.

| View | Before | After |
|---|---|---|
| Bryggen waterfront | [Before](before/desktop-balanced-waterfront.jpg) | [After](after/desktop-balanced-waterfront.jpg) |
| Roofscape | [Before](before/desktop-balanced-roofs.jpg) | [After](after/desktop-balanced-roofs.jpg) |
| Across Vågen | [Before](before/desktop-balanced-vagen.jpg) | [After](after/desktop-balanced-vagen.jpg) |
| Touch/mobile waterfront | [Before](before/mobile-balanced-waterfront.jpg) | [After](after/mobile-balanced-waterfront.jpg) |

[Source-sized inspection](after/desktop-inspection.jpg),
[mobile inspection](after/mobile-inspection.jpg),
[Skur 11 / reported colour](after/desktop-skur11.jpg),
[mobile Skur 11](after/mobile-skur11.jpg).

The roof sequence, source footprint gaps and coastline remain unchanged. Improvements
are finer near-view shadowing, restrained roof-edge definition, mapped colour handling,
tonal surface depth, sky-toned water, clear selection and repeatable close navigation.
Blank facades, simplified/unknown roofs and missing heights remain visible limitations;
these captures are not proof of architectural/survey accuracy or owner approval.

See [scope, assumptions and source references](../r1-quality-benchmark.md),
[performance with raw measurements](performance.md),
[before raw report](before/metrics.json) and [after raw report](after/metrics.json).
Hardware quality/landmark recognition is a separate product review gate. The current
renderer is retained for this benchmark; no unmeasured engine superiority is claimed.
