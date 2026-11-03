# CloakIMG canvas-first editor — 3 November 2026

The approved phone/tablet mock is implemented under Air 1.4.0. The photo viewport
keeps at least 40% of the visible editor height. Cancel / Apply X / tick actions
sit beside the tool title in a fixed header; only controls scroll. Their 48px
targets have accessible names and associated keyboard/hover tooltips. Inspection
and output panels retain Close. Desktop retains labelled Cancel / Apply.

Global undo/redo, view and export actions sit in one opaque Air group on the canvas
plane. The filename opens file properties on all layouts. Tablet uses a full-height
side inspector; short landscape keeps photo and controls side by side. At enlarged
text, secondary dimensions and the wordmark yield space before the filename clips.
The complete dimensions remain in file properties and the title description.

The obsolete Expand/Split view control, expansion state, panel measurements,
ResizeObservers, heading portal and callback plumbing are removed. CSS grid owns
the allocation. Keyboard completion returns focus to the persistent tool shortcut.
Validation and processing errors remain visible in the scrolling body and preserve
the pending edit. No processing math, codec, model, history or transaction behavior
was replaced, and no dependency was added.

## Verification

The [verification record](evidence/canvas-first-2026-11-03/verification.json) records
counts, source-result hashes and selected captures. Both Chrome and WebKit pass:

- 780 initial observations each: all 26 tools, eleven sizes, enlarged-text profiles
  and both themes. All controls remain reachable with no overflow/target failures.
- 720 alternate-state observations each, including choices, invalid values,
  selected layers, consent and scrolling. No unexpected model requests or errors.
- A final 60-observation matrix per engine verifies the last toolbar text refinement
  across all required profiles, including filename visibility and unclipped details.

Feature suites pass 20 real Apply/Cancel/invalid/rapid/keyboard/crop/resize/consent
journeys with actual downloads; 20 touch adjustment/curve/history journeys; 192
retained-value and persistent-canvas breakpoint transitions; eight compact
zoom/catalogue/consent/batch journeys; twelve native input/file recovery cases;
eight real control/target-anchor journeys; and twenty fixed-header/scroll-isolation,
40% preview and keyboard-focus journeys. All 26 rail tools are exercised.

Twelve downloaded PNGs match decoded pixels and alpha from preceding production
`e0c5f6c` exactly. Existing Display-P3 and WebP history semantics are preserved.
The real-worker notice suite passes 132 layouts and 54 captures plus two-tab
update deferral/work preservation. The final build includes truthful phone/tablet
PWA screenshots at 1290×2796 and 2048×1536, matching manifest dimensions.

487 unit tests in 50 files pass. Formatting, lint, types, production build (90
assets within 25 MiB), design/inventory and standalone portability checks pass.
Knip reports no unused code/dependencies; its four configuration hints are retained
as configuration scope, not suppressed product findings. Active source and current
README/specification no longer describe the obsolete expansion control.

The six-app comparison passes 648 home and 288 secondary layouts and 390
navigation/link interactions. Phone light/dark headers, footers and neutral links
were visually compared. The optional compact reference passes eight Chrome/WebKit
journeys at 320px/1280px; the other products retain their own transactional/autosave
semantics within the same Air contract.

Earlier HMR-interrupted runs are excluded. The initial target check caught a legacy
44px override; the canonical compact selector now preserves 48px. Old expansion
expectations were replaced by preview/scroll assertions. A capture immediately
after reopening Crop preceded its resize paint; settled captures are retained.
The full layout/alternate matrices preceded only the final toolbar text refinement;
the final focused matrix covers that refinement on the screenshot-inclusive build.

## Reproduction and remaining acceptance

Use the checked-in `test-air-*` scripts with `BASE_URL` pointing at a stable build
and an external `PLAYWRIGHT_MODULE`. `test-air-tool-actions.mjs` and
`test-air-touch-workspace.mjs` use the development-only read-only history probe.
Do not rebuild or mutate watched sources during a suite. `test-air-touch-output.mjs`
accepts `AIR_COMPARE` with preceding-production results. Full scratch is
`/tmp/air-img-canvas-2026-11-03/`.

Physical iPhone/software keyboard, OS IME and spoken assistive acceptance remain
open. Emulated touch/WebKit is not physical Safari proof. This bounded layout pass
does not certify every model tier, native codec or high-resolution workload.
Promotion and exact production checks are recorded in the canonical
[rollout ledger](https://github.com/cloakyard/cloakyard/blob/main/docs/air/cloakimg-canvas-first-2026-11-03.md).
