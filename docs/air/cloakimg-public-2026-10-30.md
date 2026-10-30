# CloakIMG Air public entry — 2026-10-30

Scope: resumes the preserved 15-path draft on `codex/air-refresh` (338c206).
The original diff and six-repository HEAD/status/hashes are retained under
`/tmp/air-img-2026-10-30/`. This is a public-entry slice, not a completed product migration.

CloakIMG now carries Air 1.3.1 and is included in canonical synchronization.
Landing uses the earlier approved still-photo/crop-frame direction, the existing
real file/clipboard/start flows, shared public header/footer, neutral angled
hyperlinks and five footer destinations. The old shader and its build plugin are
removed. A build-rendered `/privacy/` replaces the legacy modal without changing
its six policy sections/date. Reading and return navigation work without JavaScript;
progressive anchor/disclosure navigation needs no React runtime.

The shared in-flow PWA notice replaces the floating toast. Open editing sessions
block activation and retain their work when another tab activates a worker.
Activation errors offer retry. Offline text accurately describes partial caching.
The remaining editor/start/export controls are explicitly pending.

## Verification

- `vp check`, 478 unit tests in 46 files, TypeScript/build/PWA/asset gate (105 files,
  each under 25 MiB), Air inventory/provenance and isolated portability pass.
- `test-air-entry`: 202 responsive/theme/enlarged-text observations, native keyboard
  navigation, wrong-type and denied/empty clipboard recovery, same-file reselect,
  real 64×48 PNG export with exact decoded pixels/alpha, no-JS entry.
- `test-air-links`: 176 neutral layout/state checks and 64 keyboard checks.
- Chromium and WebKit artwork: each 22 moving layouts, four static accessibility/
  resource fallbacks, keyboard/lifecycle journey and delayed-stylesheet start/replay.
  Four reported CPU threads remain eligible. Mid-run presses cannot restart/queue.
- Privacy comparison with live Cloakyard: 136 layouts, seven navigation/no-JS/
  forced-colour journeys, zero geometry/content deviations and zero page errors.
- Real waiting-worker notice matrix: 132 layouts and 54 captures covering offline,
  update and updating, both themes, eleven sizes and doubled text.
- Two real tabs: activation blocked while editing, another tab activates without
  losing the open 64×48 image, then explicit activation after returning home reloads.
- All 26 tool-rail entries still open cleanly. This smoke test does not certify
  every tool's processing, AI runtime or output; those gates belong to later slices.

Evidence: `/tmp/air-img-2026-10-30/` includes logs, JSON results and screenshots.
Rendered phone/tablet/laptop/desktop light/dark public and policy states were
inspected. Native iPhone Safari, screen readers and software-keyboard acceptance
remain separate from desktop engine emulation.

## Corrections found during verification

The privacy page initially lacked its outer width/gutter constraint. Build-time
HTML formatting also exposed an unnecessary React hydration mismatch; static
rendering plus a small DOM enhancement now removes the runtime and the error.
The policy audit was rerun after switching to static markup. A replay harness
initially clicked during the first-cache notice's layout change; it now scrolls
the real target into view and verifies hit testing before real input. A WebKit
static-effects observation was investigated and rerun with diagnostic effects;
all final fallback checks pass unchanged. An overlapping build invalidated one
entry test's lazy chunk; frozen-build rerun passes. The two-tab harness now brings the clicked tab to the foreground; the background
timer timeout is retained alongside the passing real-worker rerun. Early failures
are retained.

## Motion review

| Before                                        | After                                                               | Why                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Generic shader component and build asset hook | Stationary photograph with one 2400ms crop-frame transform          | Explains image framing without an app screenshot; no ongoing rendering work |
| Separate motion lifecycle                     | Pinned stylesheet-ready finite lifecycle with completed-only replay | Consistent visibility, cancellation, keyboard and static fallback behavior  |

**Approve** for the landing-artwork slice. Only the crop frame transforms; the
photo and usable upload control stay still. Shared easing and finite duration suit
an occasional illustration. Editor/modal motion is not certified by this review.

Next: editor typography/composition and shared fields/select/colour/curve/modal
controls; full tool, history, mobile apply/cancel, AI and output validation; current
assets/metadata and obsolete-code cleanup. No deployment in this slice.
