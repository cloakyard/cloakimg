# CloakIMG editor tool-state audit — 2026-10-30

This is a deeper pass after the deployed editor re-audit. It reviews all 26 tools against Air 1.3.2, including alternate controls, selected states, editable values, disabled AI controls and error recovery. The family contract is unchanged.

## Corrections

- Replaced the remaining bespoke AI inspector switches with the native family switch and shared unboxed row. Visible labels activate switches in Shapes, Pen, Portrait blur, layer filters and metadata as well as the AI panels. Existing disabled/consent conditions remain intact.
- Image placement and image watermarks share a real keyboard-reachable browse button. Both permit selecting the same file again. A failed image decode exposes a nearby recoverable error; pending selection prevents duplicate activation.
- Border ratios, text styles/curves, time-of-day shortcuts, emoji categories/items, background choices and smart redaction use Air's neutral selection surfaces and marker. Filter/frame previews and extracted palette tiles retain authored imagery/colours while sharing responsive control geometry. Selection no longer changes border thickness.
- Removed legacy action skins and duplicated state classes. Smart crop/watermark and reset actions use shared buttons. ID-photo source links wrap, retain the angled cue and remain neutral; output actions and errors use the established Air styles.
- Native number fields retain partial, fractional and out-of-range drafts. Invalid values never reach the editing callback. Step mismatches now produce an explicit error instead of rounding silently. Escape restores the committed value. Native arrow stepping and the existing Shift ×10 shortcut use browser number stepping. Signed fields request a keyboard capable of entering a minus sign.
- Numeric controls use the shared compound field: one contour around value and unit, hidden spinner chrome, native semantics, and one focus outline. The legacy field adapter now uses Air field height/padding/type instead of compact button sizing. Labels/help use 8px gaps; the caption uses Air's resizable 7.5rem textarea.
- Preset grids reflow without fragmenting words/ratios; the single Original preview keeps the same track width as other filter tiles. Image placement actions and selected-image controls remain reachable as labels enlarge. Watermark position labels retain their directional grouping and multiline actions keep their intrinsic height. A retained active tool now opens directly when entering the phone layout; choosing the same tool also opens its inspector without an unnecessary bake. The persistent canvas, processing algorithms, history transactions, file types, AI consent and model implementations are unchanged.

## Tool coverage

| Tool            | Additional state inspected/exercised                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| Move            | Default inspector; selected layers and shared filters covered by feature journeys    |
| Tap to fix      | Canvas target/actions and existing target-anchor regression                          |
| Crop & rotate   | Square ratio, flip/reset, signed native entry, invalid drafts and stepping           |
| Perspective     | Corner handles and output/reset surface                                              |
| Adjust          | Histogram/curve and mobile adjustment tab; committed exposure; scoped AI preparation |
| Time of day     | Golden selection, dirty/reset action and reflowing shortcuts                         |
| Relight         | Consent/disabled, real depth-ready controls, intensity/dirty/reset                   |
| Filters         | All category previews, selected preset and scope controls                            |
| Levels          | Black-point numeric edit; all five native numeric readouts                           |
| Selective color | Alternate colour band and signed controls                                            |
| Spot heal       | Brush size change, feather and canvas guidance                                       |
| Portrait blur   | Gated background, whole-image, alternate lens and progressive switch                 |
| Remove BG       | Auto/disabled inspector, Chroma, output background and ready inspector               |
| Redact          | Inspector on/off, brush mode, smart action and style controls                        |
| Text            | Caption, style choices, outline colour, curved text and enlarged layouts             |
| Shapes          | Rounded rectangle, polygon, star, conditional controls and label/Space switch        |
| Draw            | Pen/eraser and colour popover validation                                             |
| Emoji           | Categories, custom grapheme, selected tile and undo/redo                             |
| Watermark       | Text/image, empty/replacement chooser, repeated file, position/scale/opacity         |
| Pen             | Fill off/on and conditional colour field                                             |
| Place image     | Empty, failed decode/recovery, selected image, alignment/order controls              |
| Color picker    | Re-extracted palette, exact RGB and invalid hex recovery                             |
| Resize          | Locked/unlocked dimensions, numeric drafts and output presets                        |
| ID photo sheet  | Custom photo size, paper choices, source link and output actions                     |
| Frame           | All thumbnail choices, selected Polaroid and width/colour                            |
| Border          | Solid/aspect, explicit None and ratio selection                                      |

## Verification and limits

The [durable verification record](evidence/tool-state-audit-2026-10-30/verification.json) enumerates final checks, counts, captures and feature results. The all-tool initial matrix covers eleven viewport sizes plus enlarged text; the alternate-state matrix covers phone, tablet and desktop in both themes at normal and 200% root font. Chromium and WebKit are separate runs. Screenshots and control geometry are reviewed together: bounds alone missed word fragmentation and the caption-height override.

Passing gates: **484 unit tests / 50 files**, format/lint/types, production build (90 files), 104-source inventory, 22 portability checks and pinned Knip 6.43.0 with zero issues. Both engines pass **764 initial layout observations** each; alternate-state observations are **692 Chromium / 688 WebKit** (the difference is extra captured consent-background states). The final preset/Chroma follow-up passes **132 observations per engine**. The final responsive correction passes **80 breakpoint transitions** with retained crop/text values and the same canvas, plus **12 actual depth/mask-ready layouts**.

Additional passing journeys: 12 native field/switch/file-error cases, eight control/target-anchor cases, 12 colour/curve cases, 44 modal states, 24 batch states and 12 selected-layer/filter/export cases. Four batch ZIPs pass CRC and contain eight JPEGs at the requested 320px width. Twelve layer exports produce real 900×600 PNGs; the separate both-engine PNG comparison retains exact RGBA parity with preceding production, including alpha. Existing development tool/history/emoji probes pass. This evidence is staged explicitly in the ledger; intermediate failures and interrupted candidates are not passing results.

Representative captures:

- [Phone caption at 200% text](evidence/tool-state-audit-2026-10-30/phone-light-text-200.png)
- [Tablet watermark at 200% text](evidence/tool-state-audit-2026-10-30/tablet-dark-watermark-200.png)
- [Desktop filter previews](evidence/tool-state-audit-2026-10-30/desktop-light-filters.png)
- [Phone active tool retained across resize](evidence/tool-state-audit-2026-10-30/phone-light-retained-crop.png)
- [Phone AI inspector](evidence/tool-state-audit-2026-10-30/phone-dark-ai-inspector.png)

The audit drivers were corrected to use native spinbutton roles, await lazy panels/consent and inspect outline style (an outline with style `none` can still report a computed width). Development-only history probes run on the dev server. Interrupted intermediate matrices are retained as diagnostic scratch, not counted as passing evidence. The strengthened AI capture assertion then exposed the real same-tool breakpoint bug; the product was corrected and `test-air-editor-breakpoints.mjs` added. No assertions were weakened to accept a product failure.

Physical iPhone/software-keyboard, OS IME and spoken assistive acceptance remain open. Automated WebKit is not physical Safari proof. This pass does not repeat every native codec, high-resolution workload or AI model tier. The portable contract and other applications are unchanged.

Full scratch: `/tmp/air-img-tool-states-2026-10-30/`. Release integration is recorded in the central Cloakyard handoff after the passing gates.

## Reproduction

Use the built preview with `BASE_URL`, an externally installed `PLAYWRIGHT_MODULE`, and an `AIR_EVIDENCE_DIR` outside the repository. Run `scripts/test-air-editor-layout.mjs` and `scripts/test-air-tool-states.mjs` separately with `AIR_BROWSER=chromium` and `AIR_BROWSER=webkit`; `AIR_CAPTURES=0` suppresses repeat screenshots. The latter accepts `AIR_TOOLS`, JSON `AIR_PROFILES` and `AIR_THEMES` for bounded follow-ups. `scripts/test-air-native-fields.mjs`, `scripts/test-air-editor-controls.mjs` and `scripts/test-air-editor-breakpoints.mjs` exercise both engines. Use `vp run test`, `vp check`, `vp run build`, `vp run design:check`, `vp run design:portability` and the pinned Knip command for the remaining gates.
