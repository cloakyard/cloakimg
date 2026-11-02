# Simple editor actions — 2 November 2026

Air 1.3.3 replaces CloakIMG's mixed tick, X and Done controls with one labelled
Cancel / Apply row outside the scrolling inspector. The same component serves
phone, tablet and desktop. Move, colour sampling and ID-photo output use Close;
printing, downloading and AI detection retain their specific actions. Expand /
Split view changes only the available workspace. Swipe-to-commit and duplicate
Crop, Resize and Perspective commit buttons are removed.

Apply awaits the existing image operation and accepts rapid activation once.
Invalid numeric drafts, unavailable subject masks and degenerate perspective
corners stay open for correction. Failed pending work remains registered for retry.
Cancel restores the tool-entry values and history. Native field Enter and a focused
Apply button no longer also trigger Crop's global Enter handler. Image algorithms,
codecs, AI consent, history encoding and exported pixels are preserved.

The responsive sweep caught duplicate React sibling keys between the inspector
body and new action footer; distinct keys fix retained/duplicated tool panels.
The real colour-sampling journey also caught repeated extracted swatches sharing
keys. The panel now shows each unique extracted colour once.

## Evidence

Selected captures and reproducible results are in
[evidence/simple-actions-2026-11-02](evidence/simple-actions-2026-11-02/verification.json).
Scratch: `/tmp/air-simple-actions-2026-11-02/`. Browser runners accept a built
`BASE_URL` and an external `PLAYWRIGHT_MODULE`. The transaction/workspace runners
use a stable dev server and read the debug probe only for pixel/history assertions.

- Chrome and WebKit: 780 observations each, all 26 tools, 11 required sizes, four
  additional 200% root-font profiles, light/dark; no layout or browser errors.
- 20 real UI transaction journeys: Cancel/re-entry, invalid input recovery,
  same-event Apply deduplication, keyboard Crop Apply, Resize, Undo/Redo, mask
  consent, inspection Close and 20 actual PNG downloads with decoded dimensions.
- 20 adjustment/navigation/history journeys; all 26 tools mount cleanly; real
  Resize/Undo, chained history, reset and export probes pass.
- 192 retained-value/canvas breakpoint transitions and 12 native numeric/switch/
  file-recovery journeys pass. Twelve downloaded PNGs match preceding production's
  decoded pixels and transparency exactly in Chrome and WebKit.
- 487 units in 50 files; formatting/lint/types, production build, 106-source
  inventory, portable Air bundle and Knip pass. README/PWA phone/tablet screenshots
  show the actual editor and retain the correct manifest dimensions.

Eight compact menu/consent/batch journeys pass with exact preview source pixels
and geometry. WebKit can rasterize the same fractional-scale draw differently after
a canvas remount; the test records that separately. Investigation observed identical
source data, rectangles, transform and smoothing settings, without changing rendering.
Actual exported output remains covered by the exact production parity check.

The PDF editor now uses the same labelled mobile actions. The six-app comparison
passes 648 home and 288 secondary layouts plus 390 interactions; PWA notices match
across IMG/PDF/Resume in 396 layouts. See the
[family audit](https://github.com/cloakyard/cloakyard/blob/main/docs/air/simple-actions-2026-11-02.md).

Harness corrections: Crop's default rectangle is inset, so its end-to-end case
now enters the actual requested height/Y through visible fields. The older Resize
probe now drives visible numeric input and waits for its registered operation,
instead of patching private state and clicking before the render. A run interrupted
by dev HMR is excluded. No failed attempt is counted as passing evidence.

Physical iPhone/software-keyboard, OS IME and spoken assistive acceptance remain
open. Browser-emulated touch and WebKit do not establish physical Safari acceptance.
The separate native codec/model-tier/high-resolution acceptance backlog is unchanged.
