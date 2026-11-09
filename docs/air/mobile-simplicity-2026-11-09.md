# Compact canvas, motion and dependency audit — 2026-11-09

The phone/tablet header now belongs to the canvas plane: no separate floating pill,
with shared Export/More actions and menu rows. The fixed 48px X/tick tool header,
scrollable controls, at least 40% preview and desktop canvas composition remain.
Obsolete compact menu/toolbar skins are removed. Inspection tools retain Close.

Batch recipe controls now use the shared 180ms entry/160ms exit fade. The real
controls remain mounted but inert while closing; reduced motion settles immediately.
Phone copy no longer incorrectly places the recipe “on the right.” Recipe expansion
remains because it exposes step-specific settings; it does not expand the whole
working pane or hide the canvas. Added real batch/ZIP and disclosure regressions.

Stable web libraries are current, including Vite+ 1.5.0, pnpm 12.18.0, MediaPipe
1.2.2, Transformers 4.3.2, Tailwind 4.3.5 and jsdom 31. The MediaPipe runtime URL
matches the installed release. Current security audit: zero known vulnerabilities.

Checks/types/build and 488 unit tests pass. All 26 tools passed 1,680 Chromium and
480 WebKit states; the actual face-detection/anonymization runtime passes. Compact
completion, draft preservation, history and navigation pass in both engines.
Twelve original/adjusted PNG downloads match the preceding build pixel-for-pixel.
Batch verification covers 176 states and 44 real ZIPs across all eleven sizes,
both themes and both engines; shared entry/exit and reduced motion are asserted.
Entry/recovery covers 204 layouts plus a real PNG fidelity test. Eight custom-control
journeys cover switches, shapes, watermark, tap sampling and anchored menus.

Family comparison includes landing, editor, all tools, batch, dialogs, PWA notices,
privacy/recovery and edge states. Canonical control states match across four viewport
classes and both themes. Selected evidence and the complete per-view ledger live in
Cloakyard's `docs/air/evidence/mobile-simplicity-2026-11-09`; the complete standalone
Air contract is bundled here. Deployment is pending the release PR.

Physical Windows/iPhone, software keyboards/IME, real browser zoom, assistive speech
and physical-device frame pacing remain untested; emulation does not establish them.
