# CloakIMG Air editor foundation — 2026-10-30

This bounded piece migrates the editor shell and shared controls. Remaining tool-specific precision values, AI runtime/output acceptance, assets and final cleanup are separate; the full product is not yet ready to deploy.

The editor uses Air system typography, neutral surfaces and controls, a 64px top bar, 72px tool rail and responsive inspector. Compact controls can expand while retaining a preview, including landscape. Orientation blocking, duplicate mobile compare/zoom controls, the old focus hook, root legacy tokens and two UI font packages are removed. Actual output fonts, pixels and functional canvas colours are preserved.

Base UI owns dialog, select, tooltip and colour-popover focus/lifecycle. Destructive confirmation starts on Cancel. Exact numeric fields retain invalid drafts, expose units separately and support keyboard steps/revert. The shared wheel keeps RGB/hex/recents and explicit EyeDropper use. Curves preserve their LUT math while exposing point selection, numeric input/output, add/remove/reset, protected endpoints and pointer cancellation. Layer ordering is available from the keyboard.

A production-only tool-switch race was found: outgoing passive cleanup erased incoming layout-effect stage registration, disabling Shapes canvas input. Cleanup now uses the same layout phase as registration. The new regression failed before the fix outside StrictMode and passes both modes after it. No pooled-canvas release moved into a state updater.

## Verification

- `vp check`; 469 unit tests in 48 files; TypeScript/build/PWA/asset gate (92 files, each under 25 MiB); Air provenance and isolated portability pass.
- Frozen production build: Chrome and WebKit each pass 356 tool/layout/theme observations across seven sizes from 320px through 1440px, including landscape. No browser errors or unsolicited model requests.
- Twelve real colour/curve journeys across engines, themes and phone/landscape/desktop: invalid drafts, exact hex/RGB, Escape/focus return, add/edit/remove/reset curve points.
- Four production shape/layer journeys: draw two actual objects, keyboard reorder, hide/show, delete and Undo in phone/desktop light/dark.
- Frozen dev responsive audit passes all six viewports (280–1440px), including ID-photo framing, grouped selection, search, batch and mobile tool panels.
- Required 26-tool touch sweep; six start/export dialog geometries; mobile crop/resize Apply and Cancel; crop pointer drag/history; chained commits, Undo/Redo/reset and tool-switch Cancel.
- Rendered phone/tablet/laptop/desktop light/dark tool states and contact sheets inspected. Physical iPhone, software keyboard, OS IME and screen-reader speech remain distinct acceptance limits.

Evidence is retained in `/tmp/air-img-2026-10-30/`: `editor-matrix-{chrome,webkit}-final.log`, matching result JSON/captures, `control-journeys-2.log`, `layers-3.log`, `stage-regression-before.log`, `editor-tests-11.log`, `editor-check-18.log`, `editor-build-5.log`, and dated probe/audit logs. Early harness failures are retained: legacy selectors, kept-but-hidden Base UI portals, async focus restoration, off-screen synthetic clicks, overlap with a rebuild or formatting/HMR reload and dev-only debug probes incorrectly directed at production. Corrected suites preserve behavior/output assertions.

## Motion review

| Before                                   | After                                                                                 | Why                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Custom popup/modal choreography          | Immediate menus; Air 240/160ms pointer-dialog transitions, immediate keyboard actions | Frequent editing stays responsive and focus follows semantic primitives |
| Animated segmented marker and AI stripes | Immediate selection and static indeterminate status                                   | Avoid motion on repeated controls while keeping progress meaning        |
| Duplicated compact transitions           | Direct panel selection, bounded interruptible drag settling                           | Preserve the useful sheet gesture without decorative motion             |

Approve the shared editor motion for this slice. The finite public illustration retains its prior approval. Reduced motion is respected; no image-processing algorithm is changed by this review.
