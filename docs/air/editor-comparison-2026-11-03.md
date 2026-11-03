# Full-view editor comparison — 2026-11-03

The PDF/IMG/Resume comparison includes editor interiors, canvas chrome, every
tool, batch/entry flows, focused controls, dialogs and actual output journeys.
A landing-page pass alone is not whole-app acceptance.

Rename the object-placement action to “Place watermark”, distinguishing it from
Apply, which finishes the tool session. Fix the image-watermark Scale field's
minimum to use its displayed 0.1% precision: the previous 3.333… minimum made the
valid default 10% a native step mismatch and blocked Apply. Rendering and encoded
output logic are unchanged. The shared action browser test now places a real
image watermark at the lower bound, applies it and downloads PNG.

Validation: check/build, all 488 tests, Knip/design/portability, 780 all-tool
observations per Chrome/WebKit engine, 204 entry/batch layouts, 20 transaction and
PNG journeys, 12 production-build watermark journeys and 36 decoded PNG matches
against prior production. Both themes, all eleven viewport sizes and enlarged
text are included. Cross-editor role/font/focus/dialog checks pass in both engines.

The baseline comparisons preserve existing output behavior, including older
history snapshots' WebP compression; they do not claim lossless Undo. No history
or image-processing implementation changes. Physical-device, OS keyboard/IME,
browser zoom and spoken-assistive acceptance remain separate.

Full family evidence: Cloakyard's `docs/air/editor-comparison-2026-11-03.md`.
Raw output: `/tmp/air-editor-comparison-2026-11-03`.
