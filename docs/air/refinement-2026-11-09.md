# CloakIMG refinement — 2026-11-09

Air remains 1.7.1. Six unused compatibility CSS selectors and redundant Knip entries are removed.
Live dynamic selectors, shared portable Air controls, image processing and output
styles are preserved. Capture automation now uses actual UI controls and isolated
contexts, producing both themes. Dark documentation images stay outside the PWA
precache. Focus/batch regressions wait for the actual intended surface.

Lint/types/build, Knip, Air integrity/portability and 488 unit tests pass. All 26
tools and alternate states pass 840 observations per engine (Chromium/WebKit),
including phone/tablet/laptop/desktop, both themes and enlarged text. Entry passes
204 layouts and fidelity checks; batch passes 176 observations. Twenty canvas
journeys and eight completion journeys pass. Twelve actual exported PNGs match
the baseline decoded pixels exactly. No processing or output feature was removed.

The six-product comparison includes public pages, workspace/tool interiors,
secondary flows, policy/recovery, dialogs, update notices and motion. Both browser
engines pass 66 cross-editor cases each; 264 dialog cases, 396 notice states and
230 presence/workflow cases pass. Rendered phone, tablet, laptop and desktop
captures were visually reviewed in both themes. The family README checker
validates eight documents and 114 local references.

See the canonical [per-view ledger](https://github.com/cloakyard/cloakyard/blob/dev/docs/air/refinement-2026-11-09.md)
for detailed coverage and diagnostics. Compressed receipts are retained locally in
`evidence/refinement-2026-11-09/`. Initial test-harness failures are preserved in the
family evidence; passing reruns determine acceptance. Original unrelated PDF AI
work and native products remain untouched. Physical-device, OS input/IME,
actual browser zoom, spoken-assistive and physical-print acceptance remain open.
