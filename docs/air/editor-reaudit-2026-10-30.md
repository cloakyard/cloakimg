# CloakIMG editor Air re-audit — 2026-10-30

A fresh source and rendered review found gaps missed by the previous bounds-only audit. This pass applies the existing Air 1.3.2 contract; it does not introduce a new family style or alter image processing, document history, AI consent, codecs or authored colours.

## Findings corrected

- Desktop mode buttons were 28×24px and lacked the shared selection cue. The mode and shape/position choices now use Air segments; watermark positions expose their selected state and full names. Small text/emoji controls meet compact target sizes. The toolbar grows when text needs more room, retains its 36px mark and keeps Export at the trailing edge. Removing an extra icon-button class prevents Single/Batch glyphs from shrinking inside segment padding. Export, resize and colour actions use 16–18px glyphs.
- Sliders now offer 32px fine-pointer and 44px coarse-pointer targets. Shared native Air switches replace bespoke 16×28px switches; keyboard semantics and 44px targets are verified. AI status/model actions, colour copy/refresh, text/emoji and tap-action controls meet the same compact/touch rules. Colour bands wrap before shrinking below the target minimum.
- Fixed text sizes, non-wrapping tool labels and rigid grids caused overlap at 200% root font. Tool picking, inspector headings, scope choices, numeric dimensions, smart actions and resize previews now reflow. The 72px rail remains stable. The picker search scrolls with its list so it cannot cover all choices on a short screen.
- Tool search used bespoke weak field borders and obsolete Workbench wording. Both search surfaces use the shared compound field, reserved clear target, persistent label, focus return and one contour. Touch opening does not raise a keyboard automatically. Invalid focused numeric fields no longer retain a competing red boundary.
- The export dialog's desktop column could exceed its containing modal and clip Copy/Download. One shared header, scrolling body and action footer now work at every width. Preview, privacy review, metadata, quality, dimensions and all five formats remain available. Error presentation uses semantic danger and a correctly sized dismissal target.
- Dialog headings and remaining UI copy use relative Air typography. The colour wheel now inherits the canonical 208px geometry instead of a local 160px override.
- Tap to fix's target now uses Air paper-accent with its contrasting rim. Its action menu uses Air geometry and shared buttons, and can wrap on narrow screens. Render inspection also exposed a pre-existing anchor error: canvas-local coordinates were used for a fixed viewport menu. Converting the anchor with the visible canvas bounds keeps the menu directly above its target. Both-engine pointer/touch journeys assert the centre and vertical gap. Perspective instructions no longer describe obsolete coral handles. Functional masks, Relight's warm light indicator, authored swatches and exported pixels retain their colours.
- Removed duplicate export/search markup, superseded classes, duplicate class tokens and stale design comments. No runtime dependency added. Existing shared components remain pinned and portable.

## Verification

Production-build browser evidence is in `evidence/editor-reaudit-2026-10-30/verification.json`; representative before/after captures are beside it. Full captures and logs: `/tmp/air-img-editor-reaudit-2026-10-30/`.

Passing counts: 764 initial layout observations per engine; 408 strengthened target observations per engine; 24 final affected-tool observations per engine; 60 final toolbar/export layouts; eight final control/anchor journeys. Units: 483 across 50 files. Entry: 204 observations with real PNG fidelity; neutral links: 192 states/64 keyboard checks. All required gates pass. Coverage stages and exact scope are retained in the JSON rather than treating every capture as the final artifact.

Before/after: [export before](evidence/editor-reaudit-2026-10-30/before-export.png) / [after](evidence/editor-reaudit-2026-10-30/after-export-light.png), [picker before](evidence/editor-reaudit-2026-10-30/before-picker.png) / [after](evidence/editor-reaudit-2026-10-30/after-picker.png), [inspector before](evidence/editor-reaudit-2026-10-30/before-inspector.png) / [after](evidence/editor-reaudit-2026-10-30/after-inspector.png), [final editor](evidence/editor-reaudit-2026-10-30/after-editor.png) and [tap menu](evidence/editor-reaudit-2026-10-30/after-tap-dark.png).

The checked-in `scripts/test-air-editor-layout.mjs` exercises all 26 tools at all eleven Air viewport sizes in light/dark, plus four 200% root-font profiles. It checks toolbar and tool targets, horizontal text/control bounds, persistent canvas identity, preview space, tool access and reachable export actions. It uses external Playwright through `PLAYWRIGHT_MODULE`, with `AIR_BROWSER=chromium` or `webkit`, `BASE_URL`, and `AIR_EVIDENCE_DIR`. Optional `AIR_TOOLS`/`AIR_WIDTHS` narrow a follow-up regression. Enlarged root text is tested separately from browser zoom. `scripts/test-air-editor-controls.mjs` reproduces the keyboard switch, selected modes, blue target and menu anchoring checks with the same external Playwright/base/output variables.

Feature journeys cover real file import, keyboard search/clear/selection, touch focus, invalid numeric drafts, single-contour focus, keyboard compare, colour/curve edits, modal/consent dismissal, all export format choices, PNG downloads and batch recipe/reorder/menu/ZIP recovery. Pixel comparisons against the preceding live build preserve PNG RGBA exactly, including alpha. Source-image import normalization already exists in both versions; this is output parity, not a claim of untouched input bytes.

Required unit/check/build/design/portability/dead-code checks and the existing tool/component probes are release gates. The final verification record supplies exact counts and outcomes. A successful bounding-box test alone is not visual acceptance: the tool-panel contact sheets and phone/laptop/dialog renders were inspected directly in both themes.

## Audit and harness corrections

The earlier bounds-only pass missed fine-pointer target sizes and enlarged-text collisions. The new runner checks all rendered panel targets, including controls below the scroll fold, rather than only visible touch targets. Initial failures are retained with the full scratch evidence. The public entry driver now selects the existing native PNG radio instead of looking for a button. Tap-action verification waits for the newly selected tool to finish mounting before sending real pointer/touch input; a premature WebKit probe had not created the expected target. No input is forced through an overlay.

## Acceptance limits and release

Physical iPhone/touch/software keyboard, OS IME and spoken assistive checks remain open. Automated WebKit is not physical Safari proof. This layout pass does not repeat every large AI inference or every native codec/output combination from the preceding migration. It preserves those implementations and their earlier evidence.

Rollout follows the authorized dev → main PR workflow after the final passing gates; the central handoff records the merged PR, production check and synchronized branches.
