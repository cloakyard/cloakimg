# CloakIMG — Status & Roadmap

A single source of truth for what works today and what's queued next.
Tick boxes only when the underlying behaviour is real, not when
scaffolding is in place.

> Replaces the old split between `TODO.md`, `FABRIC_TODO.md`, and the
> previous `STATUS.md`. All three lived as overlapping snapshots; this
> file is the merged successor.

---

## TL;DR

The chrome, document model, history, layout, theme switching, landing
flow, batch runner, and export pipeline are real. All **21 tools** in
the rail (the 14 originals plus Shapes / Pen / Stickers from the F4.5
rollup and Levels / Selective colour / Perspective / Border from the
F4.10 additions) have working, non-placeholder behaviour with accurate
live previews and keyboard shortcuts.

- **Phases 1–4** (the original feature build) are **done**.
- **Phases F0–F3** of the Fabric.js integration are **done**: Fabric is
  the rendering surface, every non-destructive layer (Text, Watermark
  text, Watermark image, Draw strokes, Shapes, Stickers, Pen paths) is
  a Fabric object, the Crop tool uses Fabric's native handles, and the
  Move tool is a real Select / Transform tool.
- **Phase F4 (new tools)** is **done** in the Phase F4.5 rollup —
  Shapes shipped under F4 itself; Pen / Stickers / per-image filters /
  full alignment overlay all shipped under F4.5.
- **Phase F4.5 (UX fixes + carryover)** is **done** — icon-driven
  Shapes panel with 11 sub-modes, aspect-lock toggle + Shift-drag
  constraint, Delete-key removal of any selected Fabric object,
  desktop tool-rail scrollbar fix, Hasselblad-inspired filter set,
  Spot heal live cursor ring, Pen tool with bezier handles, Sticker
  library + drop tool, per-image Fabric `Image.filters` controls in
  the Layers panel, full alignment-guide overlay (doc edges + center
  - every other object's edges + centers).
- **Phase F4.7 (polish pack)** is **done** — PWA file_handlers + GET
  share target, slider double-click reset (across all major panels),
  numeric input next to Adjust sliders with real-unit conversion,
  PNG copy-to-clipboard from Export, live RGB+luma histogram in
  Adjust, Spot heal touch loupe with finger-offset ring, two-finger
  tap → undo gesture on touch.
- **Phase F4.8 (tone curve)** is **done** — interactive
  Catmull-Rom-spline curve editor in the Adjust panel. The standalone
  histogram from F4.7 is now the editor's background. Per-pixel LUT
  applies after every other adjust stage; lives in tool state, baked
  on apply, threaded through the live preview path.
- **Phase F4.9 (refinement)** is **done** — touch-target + usability
  pass over F4.7 / F4.8. Curve editor stays square on every panel
  width, control points + hit radius scale on coarse pointers, drag
  off the editor to delete (replaces unreliable dblclick), bigger
  Reset link on touch. Numeric readout grows to ~44 pt on coarse.
  Slider double-tap reset reimplemented via pointer events so it
  works on iOS Safari (where dblclick is suppressed by
  `touch-action: none`). Two-finger-tap undo only arms when both
  fingers land within 80 ms — fixes the false-positive where a
  single-finger heal followed by an accidental brush undid the heal.
  Export modal hides the redundant bottom Cancel on mobile so Copy +
  Download have room to breathe.
- **Phase F4.10 (new tools pack)** is **done** — Levels (B/W/midtone
  in + B/W out, LUT-based bake), Selective colour (8-band HSL over a
  360-entry hue LUT with neighbour blending), Perspective (4-corner
  homography warp with on-canvas drag handles), and Border (Solid pad
  or Aspect pad with layer-shift on apply). Each ships with a Tool
  component for live preview, a Panel for desktop/tablet/mobile
  parity, history commit, auto-flush on tool switch where
  appropriate, and a keyboard shortcut.
- **Phases F5 (project save / load), F6 (polish), F7 (verify & ship)**
  remain.

Bundle: ~649 KB raw / ~196 KB gzipped (slightly over the 110 KB
Fabric-delta target — F7 audit will prune if we go more).

---

## Phase status

| #     | Phase                                          | Status                                                                                                                                                                                           |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Strip AI surface + offline guarantee           | Done                                                                                                                                                                                             |
| 2     | Fill must-work feature gaps                    | Done                                                                                                                                                                                             |
| 3     | Polish (live preview, batch, shortcuts)        | Done                                                                                                                                                                                             |
| 4     | Verify & ship (auto checks)                    | Auto checks done; manual smoke on the human                                                                                                                                                      |
| F0    | Fabric audit                                   | Done                                                                                                                                                                                             |
| F1    | Fabric foundation                              | Done                                                                                                                                                                                             |
| F2-A  | Fabric becomes the rendering surface           | Done                                                                                                                                                                                             |
| F2-B  | Migrate non-destructive layer types            | Done (Text · Watermark · Draw · WatermarkImage all Fabric)                                                                                                                                       |
| F3    | Crop overlay + Move/Select + Layers            | Done                                                                                                                                                                                             |
| F4    | New tools enabled by Fabric                    | Done (rolled forward into F4.5)                                                                                                                                                                  |
| F4.5  | UX fixes + F4 carryover                        | Done — UX fixes + Pen + Stickers + per-image filters + alignment overlay all live                                                                                                                |
| FX    | Tailwind v4 migration + auto dark mode         | Done — 388 → 95 inline-style blocks, manual theme toggle removed, dark follows OS                                                                                                                |
| F4.6  | Cross-tool state preservation                  | Done — Fabric scene carries across tool swaps; preview tools auto-flush; Reset                                                                                                                   |
| F4.7  | Polish pack (Option A)                         | Done — PWA file/share targets, slider double-click reset, numeric input, clipboard copy, Adjust histogram, Spot heal touch loupe, two-finger-tap undo                                            |
| F4.8  | Tone curve                                     | Done — Catmull-Rom curve editor over the histogram in Adjust; LUT bakes after every other adjust stage; live preview                                                                             |
| F4.9  | Refinement (touch / usability pass)            | Done — curve editor square aspect + drag-off delete + coarse-pointer geometry; numeric readout coarse sizing; iOS-safe slider double-tap; tighter two-finger-tap; export modal mobile button row |
| F4.10 | New tools pack (Levels / HSL / Persp / Border) | Done — four new rail entries, each with desktop/tablet/mobile parity, live preview where it makes sense, and a single-key shortcut                                                               |
| F5    | Project save / load                            | Pending                                                                                                                                                                                          |
| F6    | Polish (group, lock, copy, etc.)               | Pending                                                                                                                                                                                          |
| F7    | Verify & ship Fabric-era                       | Pending                                                                                                                                                                                          |

---

## Tool-by-tool

### 1. Move / Select

`<ImageCanvas fabricInteractive />` enables Fabric selection. Click a
layer to grab transform handles; Shift-click for multi-select; drag a
marquee for marquee select. `object:modified` commits "Edit layer" so
Cmd-Z reverses every transform. Watermark text is locked so Move
can't grab it (intentional — it's pinned). Renaming "Move" → "Select"
is queued for F6.

### 2. Crop & rotate

Fabric `Rect` overlay with the eight native handles. `lockUniScaling`
flips on/off as the Aspect segment changes. Apply reads
`(left, top, width × scaleX, height × scaleY)` and bakes the rotated /
flipped / cropped result into history. The custom 8-handle drag
system from Phase 1–3 is gone. Enter is still the keyboard shortcut.

### 3. Adjust

Live preview runs the real per-pixel adjust pipeline against a
720px-long-edge preview canvas (rAF-coalesced). Apply bakes at full
resolution. All nine controls (exposure, contrast, highlights,
shadows, whites, blacks, saturation, vibrance, temp) update visibly
during slider drag. **Tone curve** (Phase F4.8) sits at the top of
the panel — interactive Catmull-Rom curve over a live RGB+luma
histogram. Click empty space to add a control point, drag to move,
double-click an interior point to remove. Endpoints are sticky on x
so the curve always covers the full input range. Baked as a 256-entry
LUT after every other adjust stage in `bakeAdjust` /
`bakeAdjustAsync`.

### 4. Filter

13 preset thumbnails (None / Warm / Mood / Verde / Soft / Mono +
Hasselblad-inspired Natural / Phocus / Portrait / Cine / B&W Film /
Velvia / Portra) compose with the user's manual sliders, then drive
the same per-pixel preview as Adjust. Mono / B&W Film thumbs render
with `filter: grayscale(1)` driven by each recipe's `monochrome`
flag.

### 5. Redact

Two modes:

- **Rect**: drag a rectangle on the image; on release the region is
  replaced with Pixelate / Blur / Solid with edge feather.
- **Brush**: drag continuously; circular stamps along the path commit
  as a single action on pointer-up.

Cmd-Z undoes the most recent commit (one rect or one brush stroke).

### 6. Metadata

Zero-dependency EXIF reader for JPEGs (walks APP1 / TIFF / IFD0 /
ExifSubIFD / GPS) feeds the panel. On JPEG export the splicer in
`tools/exifFilter.ts` neutralises tagged entries (camera / GPS /
timestamp groups) so any standard EXIF tool sees only the kept tags.
PNG / HEIC / AVIF / RAW EXIF panel display is on the backlog.

### 7. Spot heal

Click a blemish; a circular region around the click is replaced by
the average colour from a ring just outside the click radius, with a
soft falloff at the patch edge. **Live cursor ring** (Phase F4.5) —
system cursor is hidden, replaced with a dual-ring overlay (solid
heal radius + dashed feather + center pip). Ring scales live as the
brush slider changes.

### 8. Remove BG

Single-mode chroma keyer. Samples the four corner pixels (or a
user-clicked sample), computes a target colour, and clears all pixels
within a colour-distance threshold, with edge feathering. Subject
segmentation was removed in Phase 1 — out of scope for "no AI, fully
local".

### 9. Draw

Fabric `PencilBrush` for pen, hit-test eraser for erase. Strokes are
Fabric `Path` objects tagged `cloak:drawStroke`; eraser hit-tests
bbox of `path:created` against existing draw strokes and removes
intersecting ones. The legacy 2D draw path is gone.

### 10. Text

Fabric `IText`. Click on canvas drops an editable IText at the
cursor and enters edit mode immediately (`enterEditing()` +
`selectAll()` for instant typing). Existing IText click-to-select,
double-click-to-edit, drag, and free transform come free with
`fabricInteractive`. The TextPanel reads the active selected IText
via Fabric `selection:*` events and writes back via `obj.set({...})`.

### 11. Watermark

Mode segment (Text / Image). Text mode adds a locked Fabric `IText`
(transforms locked, edit disabled — the panel is the source of truth);
Image mode adds a Fabric `Image` (free transform, ready for Phase F4
per-image filters). Both are managed via the Layers panel.

### 12. Pen (Phase F4.5)

[PenTool.tsx](src/editor/tools/PenTool.tsx) +
[PenPanel.tsx](src/editor/tools/PenPanel.tsx). Click drops an anchor;
drag from the click to extrude symmetric bezier control handles.
Live rubber-band preview from the last anchor to the cursor. Click
the first anchor (within ~6 px) or press Enter / double-click to
commit; Esc cancels. Committed paths are tagged `cloak:shape` so the
Layers panel and Delete-key handler pick them up.

### 12-bis. Stickers (Phase F4.5)

[StickerTool.tsx](src/editor/tools/StickerTool.tsx) +
[StickerPanel.tsx](src/editor/tools/StickerPanel.tsx). Eight
pre-loaded local SVG stickers (Pin, Star, Heart, Speech, Banner,
Bolt, Check, Cross). Click on canvas drops the selected sticker at
~1/6 of the image's short edge. Tagged `cloak:sticker`; full Fabric
transform after placement; opens to the per-image filters submenu
from the Layers panel for recolour.

### 13. Shapes (Phase F4 / F4.5)

[ShapesTool.tsx](src/editor/tools/ShapesTool.tsx) +
[ShapesPanel.tsx](src/editor/tools/ShapesPanel.tsx). **11 sub-modes**:
Rect, Rounded rect, Ellipse, Line, Arrow, Triangle, Polygon (3–12
sides), Star (4–12 points), Heart, Speech bubble, Cloud — picked from
an icon strip. Stroke / fill / opacity / stroke-width plus per-kind
parameters (corner radius, sides, points). **Aspect lock** (panel
toggle, mobile-friendly) plus Shift-drag constraint: keeps shapes 1:1
during drag and snaps Line / Arrow angle to the nearest 45°. Shapes
tagged `cloak:shape` so the Layers panel and Delete-key handler pick
them up.

### 14. Color picker (two surfaces)

The dedicated tool samples a canvas pixel on click. Across the rest
of the editor, Draw / Text / Watermark and Solid-redact use the
custom CloakIMG color picker (HSV square + hue strip + hex / RGB
inputs + last-8 recents + native EyeDropper fallback). Recent picks
shared session-wide.

### 15. Palette

Median-cut on a downsampled thumb yields five dominant colours.
Click a swatch to copy hex to the clipboard. Re-extract button
re-runs.

### 16. Resize

W × H inputs with optional aspect lock. Long-edge presets (1080 /
1440 / 2400 / 4096). Fit / Fill / Stretch segmented control. Quality
segment (Fast / High); High runs a Lanczos-3 separable resample with
normalised weights, auto-falling-back to Fast when the target is
within 1.4× of the source on the long edge.

### 17. Levels (Phase F4.10)

[LevelsPanel.tsx](src/editor/tools/LevelsPanel.tsx) +
[LevelsTool.tsx](src/editor/tools/LevelsTool.tsx) +
[levels.ts](src/editor/tools/levels.ts). Five sliders — input black,
midtone gamma, input white, output black, output white. Builds a
256-entry LUT in `buildLevelsLUT` and applies it per pixel through
`bakeLevels`; the LUT is essentially free to compute, so the live
preview re-runs against the cached downsample on every slider tick
(see `useLevelsPreview`). Auto-flushes on tool switch via
`registerPendingApply`. `L` shortcut.

### 18. Selective colour (Phase F4.10)

[HslPanel.tsx](src/editor/tools/HslPanel.tsx) +
[HslTool.tsx](src/editor/tools/HslTool.tsx) +
[hsl.ts](src/editor/tools/hsl.ts). Eight band swatches across the
top (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta), three
sliders (Hue ±60°, Saturation ±100%, Luminance ±50%) for the active
band underneath. A 360-entry hue LUT linearly blends each pixel's
two surrounding band offsets, so a tone sitting between Orange (30°)
and Yellow (60°) gets a 50/50 mix instead of a hard transition. The
inner loop does an RGB→HSL → LUT → HSL→RGB pass per pixel; the
saturation gate keeps neutral greys from picking up colour shifts.
Live preview at 720 px on phones / 1440 px on desktop. `J` shortcut.

### 19. Perspective (Phase F4.10)

[PerspectivePanel.tsx](src/editor/tools/PerspectivePanel.tsx) +
[PerspectiveTool.tsx](src/editor/tools/PerspectiveTool.tsx) +
[perspective.ts](src/editor/tools/perspective.ts). Four coral
corner handles (12 px on precise pointers, 20 px on coarse) sit on
the canvas via `paintOverlay`; pointer events route through
`onImagePointer*` so a drag is in image-space. The bake solves the
3×3 homography H that maps the user's quad to a clean rectangle (8×8
linear system via Gaussian elimination with partial pivoting), then
walks every output pixel and bilinear-samples the source through
H⁻¹. Output dimensions auto-derive from the average of opposite-side
lengths so a wide-of-tall quad rectifies to wide-of-tall pixels.
Apply runs behind the busy-spinner overlay because the warp scales
with output area. `Q` shortcut. Caveat: Fabric layers are dropped on
apply since their positions don't translate cleanly through a
homography.

### 20. Border (Phase F4.10)

[BorderPanel.tsx](src/editor/tools/BorderPanel.tsx) +
[BorderTool.tsx](src/editor/tools/BorderTool.tsx) +
[border.ts](src/editor/tools/border.ts). Two modes: Solid (uniform
thickness on every side, 0..25 % of the shorter image side) and
Aspect (pad the shorter axis until the canvas hits one of seven
target ratios — 1:1, 4:5, 5:4, 16:9, 9:16, 3:2, 2:3 — from
`BORDER_ASPECTS`). Live preview paints the new border directly on
the matte via `paintOverlay`, so the user sees the eventual edge
before Apply commits. The bake grows the working canvas to its new
dimensions, fills with the chosen colour, draws the original image
centred, and shifts every Fabric layer by the (offsetX, offsetY)
delta so a watermark stays in its corner relative to the image.
Auto-flushes on tool switch. `O` shortcut. Distinct from Frame:
Frame paints inset stylized borders inside the existing canvas;
Border grows the canvas with a flat pad (closer to Photoshop's
Image → Canvas Size).

---

## Cross-cutting

### Layers

[LayersList.tsx](src/editor/LayersList.tsx) reads the live Fabric
scene via `object:added/removed/modified` + `selection:*` events.
Per-row visibility, click-to-select, delete, drag-reorder via
`bringObjectForward` / `sendObjectBackwards`. Crop overlay is
filtered out (it's transient). Multi-select propagates from
canvas Shift-click into the panel.

### Keyboard shortcuts

[useKeyboardShortcuts.ts](src/editor/useKeyboardShortcuts.ts) maps
`V/M/C/A/F/R/T/H/B/D/N/W/I/P/S/U/K` to the original 17 tools (Pen →
`N`, Stickers → `K`) plus `L` Levels, `J` Selective colour, `Q`
Perspective, `O` Border for the four F4.10 additions. `[` `]` brush
size, `{` `}` feather, `0` fit-zoom, `1` 2.5×, `Esc` clears layer
selection, **`Delete` / `Backspace` removes the selected Fabric
object(s)** (skips Crop overlay; honours `IText.isEditing` so
backspacing inside a text caret still edits the text).

### Recents

[recents.ts](src/landing/recents.ts) backs the Upload tab's recents
row with IndexedDB. Up to 10 entries (id, name, mime, size, thumb
data URL, original blob). Click reopens; per-item ✕ removes; Clear
wipes all. 100% local — never leaves the device.

### Export

- Selective EXIF preservation honoured on JPEG (other formats strip
  everything by design).
- Estimated size is encode-based: a 320 px thumb is encoded at the
  user's chosen format / quality, then scaled by area ratio
  (typically within ±5%).
- Single-file anchor download for the editor; batch results have
  individual links plus a "Download all (.zip)" button.

### Batch

- Typed Add-step popover (Resize / Adjust / Filter / Strip metadata /
  Convert) with stable ids per step.
- Inline parameter editor for Resize (long edge), Filter (preset +
  intensity + grain), Convert (format + quality).
- HTML5 drag-reorder.
- "Download all (.zip)" packs every completed result into a zero-dep
  STORE-only PKZIP archive readable by macOS / Windows natives,
  unzip, 7-Zip.
- Sequential processing only; no Web Worker pool (post-ship backlog).

### Other UX

- "Watch a 30-second tour" CTA on the landing is decorative — no
  video.
- Pinch-to-zoom on touch devices via two-pointer tracking.
- Paste-to-replace and drop-to-replace inside the editor (single-mode
  only; batch keeps adding files to the queue).
- Auto-save / draft restore is not implemented (Phase F5).
- No telemetry / error reporting beyond an in-app banner.
- No tests.

### Internationalization

Strings are hardcoded English. There's no i18n layer.

### Accessibility

- Tool buttons have aria-pressed and titles.
- Modals have `role="dialog"` / `aria-modal="true"` and Esc to close.
- Focus management on modal close is browser default — no explicit
  focus return.
- Keyboard navigation through the tool rail isn't tested.

---

## Roadmap

### ✅ Phase 1 — Strip AI surface + offline guarantee (2026-04-29)

- Auto-redact tool deleted (`tools/AutoRedactPanel.tsx`,
  `auto` removed from `ToolId`).
- Subject mode dropped from Remove BG; chroma is the only path.
- Sparkles tease and icon removed.
- Privacy chip ("100% local · offline") added to the top bar.
- `@fontsource/inter` + `@fontsource/instrument-serif` bundled as the
  offline fallback to the Google Fonts CDN.

### ✅ Phase 2 — Fill must-work feature gaps (2026-04-29)

- Layers panel; brush-mode redact; Draw eraser; Text inline editing;
  Watermark image; custom CloakIMG color picker (HSV / hue / hex / RGB
  / EyeDropper); before/after compare; selective JPEG EXIF on export;
  IndexedDB Recents.

### ✅ Phase 3 — Polish (2026-04-29)

- Live preview parity for Adjust + Filter via downsampled bake.
- Typed batch step editor with per-step parameter editing.
- STORE-only PKZIP zip-all download.
- Encode-based export size estimate (±5%).
- Lanczos-3 resample option.
- Pinch-to-zoom; paste-to-replace; drop-to-replace.
- Tool keyboard map.

### ⚠️ Phase 4 — Verify & ship (auto checks done)

- [x] `vp check` clean.
- [x] `vp test` (no tests; skipped per the project's stance).
- [ ] Manual smoke matrix (every tool × theme × layout, every
      export format, batch run, paste/drop/pinch on iPad).
- [x] [STATUS.md](STATUS.md) updated.
- [ ] README — none exists; would carry the "no servers, no AI, no
      telemetry" pitch.

### ✅ Phase F0 — Fabric audit (2026-04-29)

Per-tool verdicts: Move + Crop (then destructive) and Text /
Watermark / Draw (already non-destructive) get migrated; Adjust /
Filter / Resize / Redact / Spot heal / Remove BG / Metadata / Color
picker / Palette stay custom because they don't have canvas-overlay
surfaces Fabric would upgrade.

### ✅ Phase F1 — Fabric foundation (2026-04-29)

`fabric@^6.9.1` installed.
[FabricStage.tsx](src/editor/FabricStage.tsx) is a fully-wired
scaffold component with viewport-transform mirroring (kept
unimported until F2 to validate the integration in isolation).

### ✅ Phase F2-A — Fabric becomes the rendering surface (2026-04-29)

[ImageCanvas.tsx](src/editor/ImageCanvas.tsx) mounts a Fabric
`Canvas` programmatically; raw canvas appended to a React-owned host
div, never JSX-managed (avoids the common Fabric+React `removeChild`
crash). `doc.working` (or compare/preview source) renders as a
Fabric `backgroundImage`. Editor's pan + zoom mirror into Fabric's
`viewportTransform`. Bundle delta from F1+F2-A: +90 KB gzipped
(101 → 190 KB), within the 110 KB budget.

### ✅ Phase F2-B — Layer-type migration (2026-04-29)

Watermark Image → Fabric `Image`; Watermark text → locked Fabric
`IText`; free Text → editable Fabric `IText` (inline caret +
selection + transform handles); Draw → Fabric `Path` via
`PencilBrush` plus the legacy hit-test eraser, but committed via
Fabric's `path:created` event so the strokes themselves are Fabric
objects. Legacy 2D `drawLayers` / `drawTextLayer` / `drawWatermark` /
`drawWatermarkImage` / `drawStrokes` helpers are gone.

Plumbing landed alongside F2-B-1: `getFabricCanvas()` /
`setFabricCanvas()` accessors on EditorContext; History stack
carries a `fabric: object | null` JSON snapshot per commit and
`loadFromJSON`s it on undo/redo; Export pipeline accepts an optional
`fabricCanvas` and bakes Fabric objects via `obj.render(ctx)` under a
`ctx.scale(sx, sy)`; ImageCanvas exposes a `fabricInteractive` prop
that tools (Text, Draw, Shapes, Move) flip on so Fabric captures
pointer events natively for selection and free-drawing.

### ✅ Phase F3 — Crop + Move/Select + Layers panel (2026-04-29)

[CropTool.tsx](src/editor/tools/CropTool.tsx) uses a Fabric `Rect`
with native handles (`object:moving` / `object:scaling` clamp to
image bounds; aspect lock flips `lockUniScaling`). The Move tool
routes to `<ImageCanvas fabricInteractive />`, giving click-to-select

- free transform + multi-select on every Fabric layer. A global
  `object:modified` listener in ImageCanvas commits all Fabric
  transforms to history. [LayersList.tsx](src/editor/LayersList.tsx)
  reads the live Fabric scene; visibility / delete / reorder go
  through Fabric APIs.

### ✅ Phase F4 — New tools

- [x] **Shapes tool** (rail entry, `U` shortcut). 11 sub-modes
      (Rect / RoundedRect / Ellipse / Line / Arrow / Triangle /
      Polygon / Star / Heart / Speech bubble / Cloud) selected from
      an icon strip. Stroke / fill / opacity / stroke-width / per-kind
      params. Aspect lock + Shift-drag constraint.
- [x] **Pen tool** (rail entry, `N` shortcut). Click anchors + drag
      bezier handles. Shipped under F4.5.
- [x] **Sticker / SVG drop** (rail entry, `K` shortcut). 8 pre-loaded
      local SVG stickers. Shipped under F4.5.
- [x] **Per-image filter layers** (Layers panel `Wand` affordance).
      Shipped under F4.5.
- [x] **Smart guides + snap** — full alignment guides shipped under
      F4.5 (doc edges + centers + every other object's edges +
      centers; coral dashed snap-line overlay).

### ✅ Phase F4.5 — UX fixes + F4 carryover

A UX review during the F4 → F5 transition lumped polish + carryover
into a single phase before save/load lands.

- [x] **Shapes — icons + expanded vocabulary.** Icon strip replaces
      text Segment; Rect, RoundedRect, Ellipse, Line, Arrow,
      Triangle, Polygon, Star, Heart, Speech bubble, Cloud.
- [x] **Aspect lock for shapes.** Panel toggle (mobile-friendly) +
      Shift-drag constraint (desktop). Lines / Arrows snap to the
      nearest 45°.
- [x] **Delete / Backspace removes the selected Fabric object(s).**
      Works for Shapes / Text / Watermark / Draw paths. Skips Crop
      overlay; honours `IText.isEditing` so backspacing inside a
      caret still edits text.
- [x] **Tool-rail scrollbar fix on desktop.** `no-scrollbar` class
      applied; wheel-scroll preserved.
- [x] **Hasselblad-inspired filter presets.** Natural / Phocus /
      Portrait / Cine / B&W Film / Velvia / Portra — each a tuned
      `AdjustParams` shape feeding the existing per-pixel pipeline.
      Filter panel grows to two rows of thumbs.
- [x] **Spot heal live cursor.** System cursor hidden in the canvas;
      dual-ring overlay (solid heal radius + dashed feather + center
      pip) tracks pointer; ring scales live with the brush slider.
- [x] **Pen tool** ([PenTool.tsx](src/editor/tools/PenTool.tsx) +
      [PenPanel.tsx](src/editor/tools/PenPanel.tsx)) — Click to drop
      anchor points, drag from a click to extrude symmetric bezier
      handles. Live rubber-band preview from the last anchor to the
      cursor. Click the first anchor (or press Enter / double-click)
      to commit; Esc cancels in-progress. Committed paths are tagged
      `cloak:shape` so the Layers panel picks them up.
- [x] **Sticker / SVG drop**
      ([StickerTool.tsx](src/editor/tools/StickerTool.tsx) +
      [StickerPanel.tsx](src/editor/tools/StickerPanel.tsx) +
      [stickers.ts](src/editor/tools/stickers.ts)) — Pre-loaded local
      SVG library (Pin, Star, Heart, Speech, Banner, Bolt, Check,
      Cross). Panel grid for selection; click on canvas drops at a
      sensible default size (~1/6 of the image's short edge). Tagged
      `cloak:sticker`; full Fabric transform after placement.
- [x] **Per-image filter layers**
      ([LayerFilters.tsx](src/editor/LayerFilters.tsx)) — `Wand`
      affordance on any Image-typed layer row in
      [LayersList.tsx](src/editor/LayersList.tsx) expands an inline
      panel with Brightness / Contrast / Saturation / Blur / Hue /
      Grayscale / Sepia driving Fabric's built-in `Image.filters`
      array. Live preview via `applyFilters()` on every change;
      Reset / Commit buttons.
- [x] **Full alignment-guide overlay**
      ([ImageCanvas.tsx](src/editor/ImageCanvas.tsx)) — `object:moving`
      now finds the nearest snap target (within 6 px image-space) on
      each axis among doc edges + center and every other object's
      edges + center, snaps the moving object to it, and paints a
      coral dashed line across the canvas in the after:render hook.
      Cleared on `mouse:up` / `selection:cleared`.

**Phase F4.5 done.**

### ✅ Phase F4.6 — Cross-tool state preservation

A late-stage UX bug, found during the Sketch / Pixelmator-style smoke
sweep: every `<ImageCanvas>` mount creates its own Fabric `Canvas`, so
each tool swap was disposing the canvas and taking every IText, shape,
sticker, watermark and placed image with it. Fabric's history JSON
was only restored on undo / redo — never on routine tool switches.

- [x] **Fabric scene hand-off across tool swaps.**
      [EditorContext.tsx](src/editor/EditorContext.tsx) carries a
      `fabricSnapshotRef` between successive ImageCanvas mounts.
      [ImageCanvas.tsx](src/editor/ImageCanvas.tsx) captures
      `fc.toObject(["cloakKind"])` immediately before disposing the
      old canvas and `loadFromJSON`s it on the next mount, so every
      non-destructive Fabric layer survives a tool change. Transient
      overlays (`cloak:cropOverlay`, `cloak:penWork`) are filtered
      out at capture time.
- [x] **Tag survival through serialisation.** Both the existing
      history commit and the new hand-off pass `["cloakKind"]` to
      `toObject` so layer tags stick — without this, the Layers
      panel, Delete-key handler, and the watermark / sticker / shape
      lookup helpers all break after an undo or carryover.
- [x] **Auto-flush of preview-state tools.** Adjust, Filter, and
      Frame register a flush callback via
      `registerPendingApply(fn)`; `setActiveTool` invokes it before
      the tool changes, so an unapplied slider drag bakes into
      history instead of vanishing. Crop and Remove BG deliberately
      stay manual — auto-baking those is too easy to surprise the
      user with.
- [x] **Reset to original.** Top-bar refresh button +
      `EditorContext.resetToOriginal()` rolls the working canvas +
      Fabric scene back to the first history entry and pushes a
      "Reset" entry so the reset itself is undoable.

### ✅ Phase FX — Tailwind v4 migration + auto dark mode

Sequenced before F5 so any chrome refactor lands once. Mirrors
CloakPDF: Tailwind v4 with `@theme { ... }` tokens, paired
light/dark token sets, and
`@custom-variant dark (@media (prefers-color-scheme: dark))` so
dark mode follows the OS — no manual toggle.

Starting state: 78 source files, **388 inline `style={{ }}` blocks
across 37 files**, custom CSS in
[src/tokens.css](src/tokens.css) (433 lines), manual
`[data-theme="dark"]` toggle wired through
`EditorContext.toggleTheme` and a TopBar button.

End state: **95 inline-style blocks** survive (-75%), manual
theme system fully removed, build clean, JS bundle stable at
~661 KB / 202 KB gzip, CSS 19 KB → 60 KB raw (12 KB gzipped — the
gzip overhead of the Tailwind utility surface).

#### Phase FX-0 — Pre-Tailwind cleanup

- [x] Drop the manual theme system. Removed `theme`, `setTheme`,
      `toggleTheme`, `initialTheme` from
      [EditorContext.tsx](src/editor/EditorContext.tsx); stripped
      the `data-theme` attribute write in
      [UnifiedEditor.tsx](src/editor/UnifiedEditor.tsx); removed
      the theme-toggle button from
      [TopBar.tsx](src/editor/TopBar.tsx); converted
      `[data-theme="dark"]` selectors in
      [tokens.css](src/tokens.css) to
      `@media (prefers-color-scheme: dark)`. `Theme` type also
      dropped from [types.ts](src/editor/types.ts).
- [x] Atom extraction (`IconButton` / `Card` / `Pill`) and
      `onMouseEnter` hover refactor — folded into FX-2A/FX-2B
      since those files were rewritten anyway. Hover states are
      now `hover:`-modifier Tailwind utilities.
- [x] Pruned unused tokens (`--aurora-*` were already gone,
      `pill-ocean`, `--ocean-*` scale, `--glow-coral`, `--glow-ocean`
      removed).

#### Phase FX-1 — Install Tailwind + token bridge

- [x] `pnpm add -D tailwindcss@4.2.4 @tailwindcss/vite@4.2.4`
- [x] Added `tailwindcss()` plugin to
      [vite.config.ts](vite.config.ts).
- [x] Rewrote [tokens.css](src/tokens.css) with
      `@import "tailwindcss"`,
      `@theme { --color-coral-500 … --color-text, … --color-dark-text, … }`,
      and `@custom-variant dark (@media (prefers-color-scheme: dark));`.
- [x] Kept small custom CSS for: sunset backdrop + keyframes,
      checker pattern, custom scrollbar, logo wordmark gradient,
      `.kbd`, plus the legacy `.btn`/`.pill-*`/`.t-*` classes
      (still consumed in places that aren't worth churning) and
      a flat `:root` legacy-name bridge so any inline `var(--*)`
      lookups stay theme-correct.

#### Phase FX-2 — Mechanical migration (file-by-file)

Converted `style={{ }}` → Tailwind utility classes. Order by
isolation (least-coupled first).

- [x] **Batch A — Landing.** Landing, Header, Footer,
      ReloadPrompt, StartModal, Sunset migrated.
- [x] **Batch B — Editor chrome.** UnifiedEditor, TopBar,
      ToolRail, MobileSheet, PropertiesPanel, LayerFilters
      migrated.
- [x] **Batch C — Modals + atoms.** ExportModal, BatchView,
      LayersList, ColorPicker, atoms migrated.
- [x] **Batch D — Tool panels.** AdjustPanel, FilterPanel,
      ShapesPanel, StickerPanel, WatermarkPanel, TextPanel,
      PenPanel, ColorPickerPanel, PalettePanel, RemoveBgPanel,
      ResizePanel, FrameTool, CropTool, DefaultPanel,
      DrawPanel, RedactPanel, SpotHealPanel migrated.

#### Phase FX-3 — Drop the bridge CSS (partial)

- [x] Pruned obviously-unused bridge entries (ocean scale, glow
      tokens, pill-ocean).
- [ ] **Deferred** — full bridge removal needs every remaining
      inline `var(--text)` / `var(--surface)` / `var(--canvas-bg)`
      / `var(--shadow-modal)` reference rewritten to either
      Tailwind utilities or `var(--color-*)` form. The bridge's
      `@media (prefers-color-scheme: dark) :root { … }` block is
      what currently makes those inline-style usages theme-correct;
      dropping it without the rewrite would break dark-mode for
      gradients and dynamic shadows. Tracked into F6 polish.
- [x] [fabricDefaults.ts](src/editor/fabricDefaults.ts) already
      uses inline coral hex (Fabric statics can't read CSS vars).

#### Phase FX-4 — Verify

- [x] `pnpm build` clean. JS 660 KB / 202 KB gzip (flat vs.
      pre-migration), CSS 60 KB / 12 KB gzip (Tailwind utility
      surface, +7 KB gzip vs. legacy 4 KB).
- [x] `pnpm tsc --noEmit` clean.
- [x] Inline-style count: 388 → 95. Survivors are legitimately
      dynamic (gradient strings, computed slider thumb / sunset
      blob positions, dynamic preset thumbnail dimensions, shadow
      tokens that need `var(--shadow-modal)`).
- [ ] Manual sweep — light + dark, landing + editor + modals +
      every tool panel. To be done by the human before F5 starts.

### ✅ Phase F4.7 — Polish pack (2026-05-05)

A grab-bag of small UX items that don't fit a single phase but raise the
overall feel of the editor. Sequenced before F5 so the chrome is settled
before save/load lands.

- [x] **PWA file_handlers + GET share target.**
      [vite.config.ts](vite.config.ts) — manifest now declares the app
      as a system handler for png/jpg/webp/avif/gif/heic. The OS
      "Open with CloakIMG" path uses the LaunchQueue API to deliver a
      `FileSystemFileHandle` to [App.tsx](src/App.tsx), which resolves
      it to a `File` and feeds it through the existing upload flow —
      bypassing the StartModal entirely. GET-style share target also
      registered for URL/text shares. **Note:** POST-with-files share
      (the photo → Share → CloakIMG path on Android) needs a custom
      service worker — generateSW won't intercept the POST, so this
      requires migrating to `injectManifest`. Tracked in the backlog.
- [x] **Slider double-click → reset to default.**
      [atoms.tsx](src/editor/atoms.tsx) — `Slider` accepts an optional
      `defaultValue` prop; double-click fires `onChange(defaultValue)`.
      Wired across Adjust (0.5 for all 11 sliders), SpotHeal (brush
      0.32, feather 0.2), Filter (intensity 0.65, grain 0), Redact
      (strength 0.5, brush 0.32, feather 0.2), Remove BG (feather
      0.2, threshold 0.5), and Export quality (0.92).
- [x] **Numeric input next to sliders (Adjust panel).**
      [atoms.tsx](src/editor/atoms.tsx) gains a `NumericReadout` atom
      and `PropRow.valueInput` slot. The displayed chip is now a real
      `<input>` — click to edit, type a number, Enter / blur to commit,
      Esc to revert. AdjustPanel wires real-unit conversion per slider
      so a user can type "+12" or "-30" instead of dragging. Slider
      also gets `role="slider"` + aria-valuemin/max/now and tabIndex
      for keyboard a11y.
- [x] **Copy to clipboard from Export.**
      [ExportModal.tsx](src/editor/ExportModal.tsx) — new "Copy" button
      between Cancel and Download. PNG-encodes the working canvas (with
      Fabric overlays baked in) at full resolution and writes it via
      `navigator.clipboard.write`. Brief "Copied" confirmation; modal
      stays open so users can also Download right after. PNG regardless
      of selected Format because clipboard interop is tightest with
      PNG (Slack, Mail, Photos, Messages).
- [x] **Live histogram in the Adjust panel.**
      New [Histogram.tsx](src/editor/Histogram.tsx) renders a 256-bin
      RGB + luma histogram of the current working canvas. Sourced from
      a 240-px-long-edge scratch downsample (cached + recycled across
      recomputes). Refreshes whenever `historyVersion` ticks (commit /
      undo / redo); uses `mix-blend-mode: screen` so overlapping
      channel curves read white, matching Photoshop's look. Required
      adding `historyVersion` to `EditorReadValue` so consumers can
      tell when the working bitmap mutated in place.
- [x] **Spot heal touch loupe + offset.**
      [SpotHealTool.tsx](src/editor/tools/SpotHealTool.tsx) — on
      coarse pointers the heal target now sits 80 CSS px above the
      finger, clamped against the top edge so the ring doesn't fly
      off-image. A coral pip at the actual touch point with a dashed
      connector up to the ring tells the user where they're touching
      vs where the heal will land. Heal target is offset in image-space
      via the cached transform scale, so visual ring and heal pixel
      stay in sync at any zoom. Builds on the earlier coarse-pointer
      stroke-thickness pass.
- [x] **Two-finger-tap → undo on touch.**
      [ImageCanvas.tsx](src/editor/ImageCanvas.tsx) — when both
      fingers come up within 280 ms of the second going down, with
      neither finger having strayed > 10 px from the start midpoint
      and the pinch distance change < 10 px, we fire `undo()`. Any
      meaningful pinch-zoom or two-finger pan invalidates the tap;
      `pointercancel` clears any pending tap. Matches the
      Procreate / Concepts / Pixelmator gesture vocabulary.
- [x] **Verified already-shipped items.** AVIF export
      ([exportPipeline.ts](src/editor/exportPipeline.ts) — listed in
      `BASE_FORMATS`, with WebP fallback for older engines) and
      drag-reorder layers
      ([LayersList.tsx](src/editor/LayersList.tsx) — HTML5 drag with
      Fabric `bringObjectForward` / `sendObjectBackwards`).

`vp check` clean. No new runtime dependencies — all changes are
either manifest fields, ambient TS types, or new components built on
the existing atoms.

### ✅ Phase F4.8 — Tone curve (2026-05-05)

A real Curves tool inside the Adjust panel. Pairs naturally with the
F4.7 histogram (now the curve editor's background); unlocks classic
S-curves, shadow lift, and highlight roll-off without touching the
sliders.

- [x] **Curve in tool state.**
      [toolState.ts](src/editor/toolState.ts) — new
      `curveRGB: CurvePoint[]` field, defaulted to the two-point
      identity `[(0,0), (255,255)]`. Helpers `IDENTITY_CURVE` and
      `isCurveIdentity` for fast no-op detection.
- [x] **LUT bake in the per-pixel pipeline.**
      [adjustments.ts](src/editor/tools/adjustments.ts) — new
      `buildCurveLUT(curve)` evaluates a Catmull-Rom spline through
      the user's points at every x ∈ [0..255] and clamps. Both
      `bakeAdjust` and `bakeAdjustAsync` accept an optional `curve`
      param and apply the LUT at the end of each pixel's pass (after
      grain, before write-back). Identity curves skip the LUT build
      entirely. New `isAdjustIdentity(arr, curve)` helper handles the
      "any reason to bake at all?" check across both inputs.
- [x] **Live preview.**
      [useAdjustPreview.ts](src/editor/tools/useAdjustPreview.ts) —
      new optional `curve` param, threaded into the bake call and
      added to the effect deps so a curve drag re-bakes at rAF rate
      against the downsampled preview canvas, just like a slider.
      [AdjustTool.tsx](src/editor/tools/AdjustTool.tsx) passes
      `toolState.curveRGB` through.
- [x] **CurveEditor component.**
      [CurveEditor.tsx](src/editor/tools/CurveEditor.tsx) — square
      SVG with quartile grid, fade-blend RGB+luma histogram in the
      background, dashed identity diagonal, coral curve, white-fill
      coral-stroke control points. Click empty area to add a point;
      drag to move (with neighbour-bound x clamping); double-click an
      interior point to remove. Endpoints are sticky on x so the
      curve never chops off shadows or highlights. Reset link in the
      footer caption snaps back to identity.
- [x] **Adjust panel rewrite.**
      [AdjustPanel.tsx](src/editor/tools/AdjustPanel.tsx) — replaces
      the F4.7 standalone `<Histogram />` with `<CurveEditor />` (the
      histogram lives inside the editor now). Reset clears the curve
      back to identity alongside the sliders; the dirty / pending-apply
      check now considers both sliders and curve, so a curve-only
      change still auto-flushes on tool switch.
- [x] **Histogram.tsx removed.** Its compute helper was inlined into
      `CurveEditor.tsx` and no other consumer existed; deletion keeps
      the surface area honest.

### ✅ Phase F4.9 — Refinement: touch + usability audit (2026-05-05)

A focused pass over the F4.7 (polish pack) and F4.8 (tone curve)
features to make sure every interaction works the same on desktop,
tablet, and phone, and that touch-target sizes match the
`pointer-coarse:` conventions the rest of the editor already follows.

**Curve editor (F4.8 carryover)**

- [x] **Square aspect, locked.**
      [CurveEditor.tsx](src/editor/tools/CurveEditor.tsx) — dropped
      the `maxHeight: 180` cap that was stretching the SVG to a
      non-square box on wider panels (which turned every control
      handle into an ellipse and skewed the diagonal identity
      reference). The widget now uses `aspectRatio: 1/1` only, so
      it scales with the panel width on phones, tablets, and
      desktop while staying geometrically honest.
- [x] **Coarse-pointer geometry.** Control point radius doubled
      (7 → 11 viewBox units), hit-test radius bumped (14 → 20), and
      the drag-off-edge delete margin grown (24 → 32). The constants
      live behind the `COARSE_POINTER` matchMedia detection so
      precision pointers keep their compact handle.
- [x] **Drag-off-edge to delete.** Replaces the previous
      `onDoubleClick` on the SVG circles, which was unreliable
      across mobile WebKit / WebView combos and triggered the lint
      rule against interactive static SVG elements. The point
      currently in delete range fades to 0.35 opacity so the user
      sees the lift will remove it; endpoints are exempt and lifts
      that aren't past the margin restore normally. Single,
      consistent gesture on every device — desktop included.
- [x] **Reset link tap-target.** The footer Reset button gets
      `pointer-coarse:` padding + type-size variants so it clears
      ~44 pt on touch without changing the desktop chrome.

**Sliders + numeric readout (F4.7 carryover)**

- [x] **Numeric readout coarse sizing.**
      [atoms.tsx](src/editor/atoms.tsx) — `NumericReadout` now grows
      from `w-12 px-1 text-[11px]` to `w-16 px-2 py-1 text-[12.5px]`
      on coarse pointers. The visible chip stays compact on hover
      pointers; only the touch-target footprint expands.
- [x] **iOS-safe double-tap reset.** Replaced the `onDoubleClick`
      handler with a pointer-event detector that records the time +
      x of each completed tap (down → up with < 6 px movement) and
      fires the snap-back to `defaultValue` when a second tap lands
      within 300 ms and 18 px of the first. iOS Safari suppresses
      `dblclick` on elements with `touch-action: none`, which the
      slider has to keep the page from scrolling on a horizontal
      drag — the manual detector sidesteps that.

**Pointer / gesture (F4.7 carryover)**

- [x] **Two-finger-tap undo: false-positive guard.**
      [ImageCanvas.tsx](src/editor/ImageCanvas.tsx) — the gesture
      now only arms when the second pointer arrives within 80 ms of
      the first. Real two-finger taps land both fingers within
      ~50 ms; a single-finger tool gesture (Spot Heal commits on
      pointerdown) followed by an accidental second-finger brush
      ~100 ms later no longer turns into a destructive undo. Existing
      motion-based invalidation (≥ 10 px change in midpoint or pinch
      distance) still applies. `firstPointerDownTimeRef` is cleared
      on the last pointer release / cancel so the timer doesn't
      bleed across gestures.

**Export modal (F4.7 carryover)**

- [x] **Mobile button row.** Three buttons in a single row —
      Cancel + Copy + Download — were squeezing on the smallest
      phones (320 px). The mobile modal already has an X close
      button in its header, so the bottom Cancel was redundant on
      small screens; it's now hidden on mobile, which gives Copy
      and Download breathing room. Desktop keeps Cancel for
      muscle-memory parity with the other modals.

`vp check` clean across all 105 files. No new dependencies; every
change is either a JS state addition, a Tailwind variant, or a
delete.

### ✅ Phase F4.10 — New tools pack: Levels / Selective colour / Perspective / Border (2026-05-06)

A user-facing audit during the F4.9 → F5 transition flagged four
gaps versus Lightroom / Snapseed / Photoshop: no Levels, no per-band
HSL, no perspective rectification, and Frame's stylized inset borders
didn't cover the simpler "pad the canvas to a square for Instagram"
case. F4.10 ships all four as standalone rail tools, each with the
same desktop / tablet / mobile UX as the existing tools (rail
button + scrolling mobile toolbar entry + `PropertiesPanel` on
desktop / `MobileSheet` on phones, single-key shortcut, history
commit on apply).

- [x] **Levels.** Five sliders — input black, midtone gamma, input
      white, output black, output white. New
      [levels.ts](src/editor/tools/levels.ts) with `buildLevelsLUT`
      (256-entry, linear remap into output range with a
      pow(1/gamma) midtone), `bakeLevels` (single LUT lookup per
      channel), and identity detection. Live preview through
      [useLevelsPreview.ts](src/editor/tools/useLevelsPreview.ts) at
      720 px / 1440 px depending on viewport, just like Adjust.
      Auto-flushes on tool switch via `registerPendingApply` so an
      unapplied slider never silently drops.
- [x] **Selective colour (HSL).** Eight bands × three sliders.
      [hsl.ts](src/editor/tools/hsl.ts) precomputes a 360-entry hue
      LUT in `buildHslLUT` — for every integer input hue, blend the
      two surrounding band offsets linearly so a tone halfway between
      Orange (30°) and Yellow (60°) gets a smooth 50/50 mix instead of
      a hard transition. The per-pixel pass: RGB→HSL, gate the effect
      by saturation (so neutral greys aren't tinted), apply offsets,
      HSL→RGB. The panel's eight-square grid uses `hsl(C, 75%, 50%)`
      as the swatch background so each band's pickability matches the
      colour it controls. A small white dot in the corner of any
      band that's been edited makes the dirty state visible without
      tapping in.
- [x] **Perspective.** Four image-space corner handles painted via
      `paintOverlay`; pointer events route through the stage's
      `onImagePointer*` so a drag stays in image-space at any zoom
      level. Touch hit radius doubles on coarse pointers (28 px vs
      18 px) so the handles stay grabbable on a phone. The bake in
      [perspective.ts](src/editor/tools/perspective.ts) solves the
      3×3 homography that maps the user's quad to a clean rectangle
      via Gaussian elimination on the 8×8 linear system, then
      bilinear-samples every output pixel through H⁻¹. Output
      dimensions auto-derive from the average of opposite-side
      lengths so the rectified subject keeps its real-world aspect.
      Apply runs behind the busy spinner (`runBusy`) since the warp
      is O(W × H) sampling work. Fabric layers are dropped on apply
      because their positions don't translate cleanly through a
      homography — users with custom layers will Cmd-Z and finish the
      perspective first.
- [x] **Border.** Two modes via Segment.
      [border.ts](src/editor/tools/border.ts) carries `bakeBorder`,
      which returns the new canvas + the (offsetX, offsetY) by which
      the original image was shifted. The Apply step grows the
      working canvas, fills the chosen colour, draws the original
      image centred, and shifts every Fabric layer by the same offset
      so a watermark or text label stays anchored to the image rather
      than sliding to the new top-left. Live preview paints the
      eventual border into the matte via `paintOverlay`. Aspect mode
      offers seven ratios from `BORDER_ASPECTS`; tapping the active
      ratio toggles it off so the user can step out of Aspect mode
      without switching tools. Distinct from Frame, which paints
      stylized borders inset on the existing canvas; Border grows the
      canvas with a flat pad (closer to Photoshop's Image → Canvas
      Size).
- [x] **Wiring.** New `ToolId` entries in
      [tools.ts](src/editor/tools.ts) keep the rail in editing-stage
      order (Perspective sits next to Crop in the `select` group;
      Levels and Selective colour join Adjust in `tone`; Border joins
      Frame in `output`). Four new icons in
      [icons.tsx](src/components/icons.tsx) — `Perspective` (a square
      in two-point perspective), `Levels` (dual-triangle Photoshop
      glyph), `Hsl` (concentric hue arcs), `Border` (outer rect +
      inner rect). [useKeyboardShortcuts.ts](src/editor/useKeyboardShortcuts.ts)
      maps `L` / `J` / `Q` / `O`. State fields land in
      [toolState.ts](src/editor/toolState.ts) with neutral defaults
      so the rail reads identical-output until the user changes
      something.

`vp check` clean across all 119 files. `vp build` clean. The mobile
rail is already a horizontal scroller (Phase F4.5) so the four new
entries fit without any chrome refactor.

### ⏳ Phase F5 — Project save / load

- [ ] `.cloakimg` project file —
      `{ version, working: dataURL, fabric: canvasJSON, metadata: { createdAt, name } }`.
      Top-bar "Save project" / "Open project" buttons; reachable from
      the start modal alongside Recents.
- [ ] IndexedDB-backed Projects, alongside Recents. Per-project thumb
      generated from the working canvas.
- [ ] Auto-save — debounced (5–10 s after last edit) snapshot to IDB
      under a "draft" key so a tab crash doesn't lose work.

### ⏳ Phase F6 — Polish

- [ ] **Group / ungroup** (`Cmd-G` / `Cmd-Shift-G`).
- [ ] **Lock layer** (visibility column gets a lock toggle).
- [ ] **Z-order shortcuts** — bring to front / send to back / forward
      / backward, mapped to `]` / `[` with `Cmd` modifier.
- [ ] **Copy / paste / duplicate** (`Cmd-C` / `Cmd-V` / `Cmd-D`) for
      Fabric objects; coexists with the existing image-paste-replace.
- [ ] **Object opacity slider** in the Layers panel.
- [ ] **Rotate slider + flip H/V** in the per-object panel.
- [ ] **Outline + shadow** controls for IText layers.
- [ ] **Constrain rotate to 15°** when Shift held during rotation.
- [ ] **Move → Select rename** in the rail.

### ⏳ Phase F7 — Verify & ship Fabric-era

- [ ] `vp check` clean.
- [ ] Manual smoke matrix re-run focused on layer behaviour:
  - Every tool × every theme × every layout.
  - Multi-select + transform.
  - Undo / redo across 30+ ops.
  - Crop bake matches old output.
  - Save / open / auto-save round-trip.
  - Export with mixed Fabric layers (text + image + path + shape).
  - Wi-Fi off mid-session.
- [ ] Bundle audit — confirm ≤ 110 KB gzipped delta.

---

## Backlog (post-ship, not part of the phases)

1. Auto-save / draft restore via IndexedDB.
2. Web Worker pool for batch — current sequential runner pinpoints
   the main thread on large batches.
3. PNG / HEIC / AVIF / RAW EXIF readers for the Metadata panel
   display (export already strips on those formats).
4. Drag-to-reposition for the watermark anchor (currently six fixed
   positions only).
5. Per-stroke smoothing for the Draw tool (Catmull-Rom or simple
   Chaikin pass).
6. i18n layer (strings are hardcoded English).
7. Explicit focus-return on modal close.
8. A test harness — `vp test` is wired but no `*.test.ts` files
   exist.
9. Custom branded transform handles via Fabric custom controls.
10. WebGL Fabric backend for very large canvases.
11. Animation timeline (Fabric supports per-property animations).
12. Export profiles (saved combinations of format + size + quality).
13. **Web Share Target POST (file payload)** — declares the app as a
    target in the OS Share sheet for images. Needs migrating the PWA
    plugin from `generateSW` to `injectManifest` so a custom service
    worker can intercept the multipart POST and route the file into
    the launch flow. (F4.7 shipped GET-only as a partial step.)

Collaboration is explicitly out of scope — would break the
local-only guarantee.

---

## Risk register

- **Bundle size creep** — guarded with the 110 KB Fabric-delta
  budget. Currently at +90 KB; another carryover item could push us
  close.
- **Coordinate model drift** — Fabric's `viewportTransform` and the
  custom pan/zoom math need to agree exactly or pointer events on
  the destructive overlays will go off-by-N. Validated repeatedly
  through F1–F4.
- **History size** — Fabric JSON for a busy scene can be tens of KB;
  30-entry cap holds. Diff strategy is open if working sets get
  heavy.
- **EraserBrush + image filters** — both are real but fiddly; budget
  for an extra half-day on each.
- **Move-tool semantics** — making Move-as-active toggle Fabric's
  selectability without leaking state into other tools is the kind
  of thing that breaks subtly. Plan a focused test pass at the end
  of F7.
