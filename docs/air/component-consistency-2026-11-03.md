# CloakIMG component consistency — 2026-11-03

The legacy button/field skins are removed. Consumers use the pinned Air
`air-button`, `air-icon-button` and `air-field` primitives; the only local button
variant controls compact geometry. Hover, neutral contours and keyboard focus
now follow the same reference as PDF/Resume. The vertical tool rail uses
`air-scroll`; smart-action error dismissal uses the shared 44px target/18px X.

Validation: 488 tests; 780 all-tool observations per Chrome/WebKit engine;
204 entry/batch layouts and PNG fidelity; 26-tool hybrid touch sweep; desktop/
phone modal flows; eight switch/radio/colour/menu journeys; 12 actual watermark
placement/cancellation/download journeys. All 48 decoded output hashes match the
preceding production-equivalent build. No image/AI processing code changes.

The family audit includes all six public/privacy/recovery surfaces, all three
working editors and their actual dialogs. Air remains 1.6.0. Raw evidence is in
`/tmp/air-components-2026-11-03`; selected evidence is retained by the canonical
Cloakyard audit of this date. Existing approved editor compositions remain.
Physical Windows/iPhone, software keyboard, OS IME, real browser zoom and spoken
assistive acceptance remain open; automated WebKit does not close them.

Release follows passing local checks through dev → main. Unrelated work is excluded.
