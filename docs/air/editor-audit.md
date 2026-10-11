# CloakIMG editor audit — before Air migration

Date: 2026-10-11. Production UI is unchanged. Fixture: `test-fixtures/00554.jpg`,
a public CloakIMG promotional graphic (1200 × 630); no personal image was used.

## Observed coverage

- All 26 default desktop tool panels at 1440 × 900 / light; full DOM snapshots in
  `editor-panel-audit.json`.
- All 25 mobile picker tools at 390 × 844 / dark / coarse pointer; full snapshots,
  field geometry and Cancel/Done positions in `editor-mobile-audit.json`.
- Mobile Adjust’s separate slider view, first-use Relight and segmentation consent,
  a selected text layer, history and the colour picker’s DOM were also inspected.
  See `editor-conditional-audit.json`.
- No default mobile panel overflowed the page horizontally. All Cancel/Done targets
  were 44 × 44 and inside the viewport. Inspected visible text/number fields were
  16px and 44px high. Two 1px native selects in ID photo are accessibility proxies;
  their custom triggers still need a dedicated keyboard/target audit.
- Representative actual-editor checks at laptop/tablet/both themes are in the
  family’s `docs/air/existing-editor-audit.md`. They are not full-tool coverage.

These are baseline observations, not Air implementation or complete feature tests.

## Tool-by-tool design requirements

| Tool            | Preserve / define in Air                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Move            | Empty guidance; selected object properties; resize/rotate handles; actual layer selection.                          |
| Tap to fix      | Context actions; face/subject readiness; optional warm-up consent; working/busy/error states.                       |
| Crop & rotate   | Five ratio choices; W/H/X/Y; fine rotation and quarter turns; flips; subject crop; reset/apply.                     |
| Perspective     | Four draggable corners; computed output size; disabled reset/apply; numeric/keyboard alternatives.                  |
| Adjust          | Whole/Subject/Background; curve/histogram; eleven precise signed adjustments; reset; auto-bake semantics.           |
| Time of day     | Named moments, neutral Noon, continuous value and snap buttons; keep the visual scale meaningful.                   |
| Relight         | Explicit ~28/~49 MB choice before download; light position, intensity, height, warmth and scope.                    |
| Filters         | Named, grouped thumbnails; intensity/grain; scope; readable selected/focus states without frame clutter.            |
| Levels          | 0–255 endpoints; ordered input bounds; gamma 0.1–3 with 1 at neutral; reset and scope.                              |
| Selective color | Eight named hue bands; hue ±60°, saturation ±100, luminance ±50; per-band/all reset and scope.                      |
| Spot heal       | Brush size 0–100 px and feather 0–30 px; canvas cursor/hit area; no invented strength control.                      |
| Portrait blur   | Target, Soft/Lens/Tilt-shift, strength, falloff switch; paused/consent/detection states.                            |
| Remove BG       | Auto/Chroma; model tier; confidence; mask preview; transparent/solid/gradient/vignette output; apply.               |
| Redact          | Person/Faces; confidence; mask preview; rectangle/brush; pixelate/blur/solid; strength/size/feather.                |
| Text            | Caption, font, weight, alignment, colour, size, spacing, curve/outline; inline editing and selected-layer controls. |
| Shapes          | 26 labelled shapes; fill/stroke/width/opacity; aspect switch; handles and contextual controls.                      |
| Draw            | Pen/Eraser, stroke colour and brush size; editable stroke objects.                                                  |
| Emoji           | Eight categories, large grid, paste field and disabled Use; keyboard navigation and overflow.                       |
| Watermark       | Text/image, colour, six spatial positions, subject-aware placement, size/opacity and apply.                         |
| Pen             | Anchors and Bézier handles; stroke/fill/width; explicit finish/cancel and keyboard equivalents.                     |
| Place image     | Accessible file chooser, selected image controls, layer filters/order and decode/error states.                      |
| Color picker    | Sampled value, named swatch, copy feedback, image palette extraction and disabled initial copy.                     |
| Resize          | Original/target previews, dimensions/ratio, presets, fit mode, quality and apply.                                   |
| ID photo sheet  | Searchable standard/paper controls, exact physical units, framing, guides, print/PDF and authority links.           |
| Frame           | Eight previews, width and colour; entering/switching can bake the initial frame—retain explicit recovery.           |
| Border          | Solid/Aspect, thickness/colour, dimension effects and reset; preserve layer offsets.                                |

## Findings that shape the shared system

1. Numeric values are domain data. The existing Air study’s percentage exposure and
   generic brush strength were inaccurate; the reference now uses the real ranges
   and labels. Exact entry, signed values, units, errors and focus need one family
   primitive. Do not restyle internal 0…1 values as percentages for convenience.
2. The current curve only exposes a pointer-driven application surface. Source has
   no point keyboard handler or numeric point entry. Air specifies both, protected
   endpoints and pointer-cancel rollback. Its reference demonstrates point selection,
   arrow/Shift movement, input/output fields and explicit add/remove/reset. The
   reference line is an interaction study, not the production image-processing LUT.
3. The current mobile curve uses a separate Histogram tab to keep sliders reachable.
   Air proposes consistently labelled Adjustments / Tone curve views, with a square
   plot and an expanded-control mode. Values must survive view changes.
4. Layers currently appear only when Fabric objects exist. Baked adjustments appear
   in history, not as adjustment layers. The old Air sample’s invented adjustment
   layer has been removed. Selection, visibility, deletion, filters and reorder
   need separate accessible actions; the observed layer accessibility tree contains
   an outer row button with nested Hide/Delete buttons.
5. Colour content keeps its real values. Its surrounding popover, Hex/RGB fields,
   focus, target sizes and positioning must use Air. The popup DOM was observed;
   screenshots failed to paint the overlay, so no screenshot validation is claimed.
6. Model consent is a real editor surface: name, bytes, tier tradeoffs and a clear
   decline action. This audit declined downloads and saw paused detection. Progress,
   cached, inference, error and retry states remain pending.

## Behaviour probes and baseline issues

- Opening Frame then switching to Border added a Frame history entry without any
  slider edit. Undo returned to Open. Record this existing automatic application;
  do not silently change commit boundaries in the visual migration.
- At 390 × 844, entered Exposure +0.4, pressed Enter, then Cancel, reopened Adjust
  and its slider view: **the field still showed +0.4**. Cancel dismissal alone is
  not proof of rollback. Reproduce on a fresh session and fix under an explicit
  behaviour test before that product migration passes.
- Entered +0.2 and pressed Done: Undo became enabled; Undo returned the history to
  Open and desktop Adjust showed +0.0. This is a narrow observed path, not a full
  pixel-comparison or history regression suite.
- Added the synthetic caption “Air study” to inspect a selected layer and its
  Add text history entry. Cancel changes returned to Move with Undo disabled.
- Prior representative audit found an orientation-blocking screen at 844 × 390
  coarse pointer. Air requires usable short-height editing; track for migration.
- No exported file was produced and no AI model was downloaded in this audit.

## Visually reviewed evidence

- `evidence/baseline-adjust-desktop-light.jpg` — real canvas, curve, numeric controls, history.
- `evidence/baseline-adjust-phone-dark.jpg` — real split preview, tabs, scope and values.
- `evidence/baseline-layer-desktop-light.jpg` — selected text, handles, layer row and history.

## Remaining coverage before product completion

- [ ] Fresh-session Cancel regression with pending values, applied pixels and tool re-entry.
- [ ] Full colour popup visual/keyboard/touch audit, including HSV and eyedropper fallback.
- [ ] All populated and disabled tool variants, selection handles, pointer cancellation and keyboard alternatives.
- [ ] Multi-layer ordering/filter/visibility/deletion, history scrubbing, compare and zoom/pan.
- [ ] Batch, file properties/privacy audit, tool search, errors, replace/reset/import variants.
- [ ] All AI consent/download/progress/cache/cancel/inference/error/retry paths with actual model coverage stated.
- [ ] All export formats, dimensions/quality, metadata removal, ID-sheet physical dimensions and print.
- [ ] Every state at desktop/laptop/tablet/mobile, both themes, short landscape and 200% zoom.
- [ ] Physical iOS/Android keyboard, safe areas, Safari/Firefox and assistive technology.
