# Tablet follow-up — 2026-11-09

Air remains 1.7.1. The full editor Export action now uses the canonical primary
button role, matching the compact editor and PDF/Resume. ID-photo Print and Save
PDF actions wrap as whole controls when their inspector is narrow or text is
larger. The parent already wraps; each action now has an 8rem flex basis. Neither
change modifies canvas state or output processing.

Fresh all-tool coverage checks all 26 tools and alternate states: 720 initial
Chrome observations across four tablet profiles and enlarged text at 768/1024,
plus 240 WebKit observations at 768/1024 in both themes. The initial run found 12
ID-photo observations with broken action words. Final ID-photo reruns cover 84
states per engine across phone, four tablets, laptop and desktop at 16/32px root
text. Replacing matching states yields 768 effective Chrome and 312 WebKit
observations with zero issues; original failures remain in the evidence.

Shared editor comparisons pass 42 Chrome + 42 WebKit touch cases and 12 fine-pointer
cases. Fresh entry (40), batch (64, with 16 ZIP downloads), feedback component (10),
scrolling dialog (96) and real-worker notice (144) matrices pass. Twelve actual PNG
outputs match the preceding baseline decoded pixels exactly. Eight enlarged-text
tablet journeys produce a real one-page 4×6 PDF and a prepared exact-size print
window in both engines/themes; physical printing is not claimed.

Required gates pass: `vp check`, dead-code check, 488 unit tests, production build,
Air design check and the applicable browser suites. No runtime dependency or
unused helper was introduced.

Raw evidence: `/Users/sumitsahoo/Developer/.air-mobile-2026-11-09/evidence/tablet`.
Family record: https://github.com/cloakyard/cloakyard/blob/dev/docs/air/tablet-audit-2026-11-09.md
Physical tablets, OS keyboards/IME, real browser zoom and spoken assistive checks
remain open. Feedback fixtures exercise real components, not model inference.
