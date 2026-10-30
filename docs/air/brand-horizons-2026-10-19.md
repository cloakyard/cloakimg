# App-coloured Air horizon — 2026-10-19

The user requested app colours across all family landing pages. cloakimg uses its
original logo's coral (#F4512C / #FF9A76), primary stop for light and highlight for dark.
Air 1.0.3 (`abcaee334ca7`) owns the five artwork-only tokens. The wrapper's computed
`color` feeds the existing shader and SVG `currentColor` fallback. Shared focus,
controls, page planes, motion/lifecycle and actual product output retain their rules.

The isolated committed tree passes formatting/lint/types, 470 tests in 46 files, production build and deploy-asset checks, 105 inventory records and 18 portability checks. New horizon acceptance covers GPU/pointer/offscreen/editor cleanup and five restricted profiles without fetching the shader. A synthetic 64×48 PNG survives entry → editor → download with identical RGBA SHA-256, including transparency. The shader is lazy, licensed, capped at 350 kB gzip and excluded from service-worker precache.

Twelve viewport/theme cases cover 1440×900 desktop, 1280×720 laptop, 768×1024
tablet, 390×844 and 320×568 phones, and 844×390 landscape. Both real GPU themes
render and stop at rest. Desktop/laptop/phone light/dark captures were visually
inspected, including the static fallback. Evidence: `evidence/brand-horizons-2026-10-19/`.
The family runner is `cloakyard/scripts/test-air-brand-horizons.mjs`; it accepts
`AIR_APP`, `AIR_URL`, `AIR_EVIDENCE_DIR`, `CHROME_PATH`, and `PUPPETEER_MODULE`.
It reads original logo stops, checks computed colours and static/GPU parity, and
uses disposable browser profiles. Full temporary captures/logs are under
`/tmp/air-brand-horizons-2026-10-19/`.

IMG originally had no landing horizon. This bounded change adds the canonical runtime and static artwork without absorbing the parked landing/import refresh draft. The complete IMG migration remains pending and last in the rollout.

This is a local checkpoint. These colour changes have not been pushed or deployed.
Physical GPU/battery/thermal and assistive-device gates remain open; emulation
and desktop Chromium do not establish those results.

The parked Air draft was restored byte-for-byte except the two intentional horizon
integration additions. Its build and all 475 tests also pass. A final visual check
caught the legacy warm base against Air: the artwork now defaults to `--air-page`,
with the legacy base scoped to the still-existing `.cloak-site` landing only.
The family browser check verifies that the artwork base equals its nearest painted
ancestor. Remove that legacy scope when the full IMG landing migration is committed.
Both compositions retain the coral shader and exact image output.
