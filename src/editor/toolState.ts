// toolState.ts — The flat shape of all per-tool settings the editor
// keeps in memory. Pulling these out into one object means a tool's
// settings persist when the user switches tools and comes back, which
// matches the design's promise of a single canvas.

import type { Rect } from "./tools/cropMath";
import { LEVELS_DEFAULT } from "./tools/levels";
import { hslIdentity } from "./tools/hsl";
import type { ToolId } from "./tools";

export interface MetaToggles {
  stripGPS: boolean;
  stripCamera: boolean;
  stripTimestamp: boolean;
  keepICC: boolean;
}

/** Adjust sliders, in the order shown in the property panel. */
export type AdjustKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "saturation"
  | "vibrance"
  | "temp"
  | "vignette"
  | "sharpen";

export const ADJUST_KEYS: AdjustKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "saturation",
  "vibrance",
  "temp",
  "vignette",
  "sharpen",
];

/** A control point on the tone curve. Both axes are 8-bit pixel
 *  intensities (0..255). The curve maps an input value on x to an
 *  output value on y. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Identity curve — straight line from (0,0) to (255,255). */
export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

/** Cheap "is this curve a no-op?" check. Skipping the LUT bake
 *  entirely is a meaningful win on big images. */
export function isCurveIdentity(curve: CurvePoint[]): boolean {
  if (curve.length !== 2) return false;
  const a = curve[0];
  const b = curve[1];
  if (!a || !b) return false;
  return a.x === 0 && a.y === 0 && b.x === 255 && b.y === 255;
}

export interface ToolState {
  activeTool: ToolId;

  // Crop / rotate
  cropAspect: number; // index into ASPECT_OPTIONS
  cropRect: Rect | null; // image-space pixels
  /** Fine rotation from the slider, in degrees, range [-45, +45]. */
  rotationDeg: number;
  /** 90° button presses; total rotation = `cropQuarterTurns * 90 + rotationDeg`.
   *  Kept separate so the slider's fine adjustment composes with quarter-
   *  turn rotation instead of overflowing past its [-45, +45] range. */
  cropQuarterTurns: number;
  flipH: boolean;
  flipV: boolean;

  // ID photo sheet — non-destructive crop + physical output settings.
  idPhotoPresetId: string;
  idPhotoPaperId: string;
  idPhotoCrop: Rect | null;
  idPhotoCustomW: number;
  idPhotoCustomH: number;
  idPhotoCutLines: boolean;

  // Resize
  resizeW: number;
  resizeH: number;
  resizeAspectLock: boolean;
  resizeQuality: number; // [Fast, High] — High uses Lanczos-3

  // Adjust — 9 sliders, each 0..1, 0.5 == "no change"
  adjust: number[];

  /** Master tone curve. Each point is ([0..255] in, [0..255] out),
   *  sorted by x ascending. The identity curve has exactly two points:
   *  (0,0) and (255,255). Applied as a 256-entry LUT after every other
   *  per-pixel adjustment in bakeAdjust. */
  curveRGB: CurvePoint[];

  /** Mask scope for the per-pixel adjustment tools (Adjust, Filter,
   *  Levels, HSL). 0 = whole image, 1 = subject only, 2 = background
   *  only. Picking 1 or 2 lazily triggers subject detection through
   *  the central mask service the first time it's used; subsequent
   *  scoped edits across any of these tools share the same cached
   *  mask. Per-tool scope keys keep one tool's "subject only" choice
   *  from leaking into another's defaults. */
  adjustScope: number;
  filterScope: number;
  levelsScope: number;
  hslScope: number;

  // Redact
  redactMode: number; // [Rect, Brush]
  redactStyle: number; // [Pixelate, Blur, Solid]
  redactStrength: number;
  brushSize: number;
  feather: number;

  // Filter
  filterPreset: number;
  filterIntensity: number;
  grain: number;

  // Metadata
  meta: MetaToggles;

  // Draw
  drawColor: string;
  drawSize: number;
  drawMode: number; // [Pen, Eraser]

  // Text
  textValue: string;
  textSize: number;
  textColor: string;
  textFont: number; // index into FONT_OPTIONS
  textWeight: number; // index into WEIGHT_OPTIONS
  textAlign: number; // index into ALIGN_OPTIONS
  /** Curve amount in [-1, +1]. 0 = straight; negative arcs upward,
   *  positive arcs downward. ±1 hits a half-circle. */
  textCurve: number;
  /** Italic / oblique on the active selection. */
  textItalic: boolean;
  /** Underline on the active selection. */
  textUnderline: boolean;
  /** Stroke colour around glyphs (outline). Empty / transparent → none. */
  textStrokeColor: string;
  textStrokeWidth: number;
  /** Letter spacing in 1/1000 em — Fabric's `charSpacing` unit. */
  textCharSpacing: number;

  // Watermark
  watermarkMode: number; // [Text, Image]
  watermarkText: string;
  watermarkPosition: number; // index into TL,TC,TR,BL,BC,BR
  watermarkOpacity: number;
  watermarkColor: string;
  watermarkSize: number; // image-space px or scale factor for image watermarks
  watermarkImageDataUrl: string | null;

  // Shapes (Phase F4 / F4.5)
  shapeKind: number; // index into SHAPE_KINDS in ShapesPanel
  shapeFill: string;
  shapeStroke: string;
  shapeStrokeWidth: number;
  shapeOpacity: number;
  shapeCornerRadius: number; // RoundedRect — image-space px
  shapeSides: number; // Polygon — 3..12
  shapeStarPoints: number; // Star — 4..12
  shapeLockAspect: boolean; // 1:1 bbox during drag (Shift held also forces this)

  // Pen
  penStroke: string;
  penFill: string;
  penStrokeWidth: number;

  // Emoji — selected glyph (single grapheme cluster) that the
  // EmojiTool drops on canvas click. The panel writes whichever
  // emoji the user picked from the grid or pasted into the custom
  // input; the tool just lays it out as a FabricText using the
  // platform's colour-emoji font.
  emojiChar: string;

  // Frame (border around the image)
  frameWidth: number; // image-space pixels — inset border thickness
  frameColor: string;
  frameStyle: number; // index into FRAME_STYLES (Solid / Polaroid / Double / Rounded)

  // Color picker
  pickedColor: string | null;
  /** Live (hover) eyedropper preview — updated on pointer move, not committed. */
  hoverColor: string | null;
  /** Currently focused layer in the Layers panel, if any. */
  selectedLayerId: string | null;

  // Default (for any tool without bespoke controls)
  genericStrength: number;
  genericSize: number;
  genericMode: number;

  // Remove BG — explicit chroma sample. When set, takes priority over
  // the perimeter auto-sampling. Captured by clicking the canvas while
  // bgPickActive is true.
  bgSample: string | null;
  /** True while the user has the eyedropper armed in the Remove BG
   *  panel. The next canvas click sets `bgSample` and turns this off. */
  bgPickActive: boolean;
  /** Remove BG mode: 0 = Auto (U²-Net ML), 1 = Chroma (perimeter
   *  sampling). Auto is the default; chroma stays available for
   *  flat studio backdrops where it's faster + needs no model load. */
  bgMode: number;
  /** Output behind the cutout: 0 transparent, 1 solid, 2 gradient,
   *  3 vignette. Gradient/vignette derive their tones from the single
   *  user-selected base colour. */
  bgFillMode: number;
  /** Base colour used by solid, gradient, and vignette output. */
  bgFillColor: string;
  /** Auto-mode quality / size trade-off (ISNet ONNX dump):
   *    0 = small  (~42 MB q8 model, fastest, fits any device)
   *    1 = medium (~84 MB fp16 model, sharper edges)
   *    2 = large  (~168 MB fp32 model, highest fidelity, tablet+) */
  bgQuality: number;
  /** Subject-mask alpha threshold for Remove BG Auto + scoped tools.
   *  The mask is an RGBA cut where alpha encodes per-pixel confidence
   *  (0=background, 1=subject). At apply time pixels with alpha
   *  ≥ `bgConfidence` are kept as subject; lower-confidence edges get
   *  rounded down. Lower values are aggressive (keep uncertain
   *  pixels), higher values are conservative (clean cut, may leave
   *  wispy hair behind). Lightroom / Photoshop don't expose this knob
   *  at all — the AI's certainty is hidden in their UI. We surface it. */
  bgConfidence: number;
  /** Minimum face-detection score (0..1) below which detected faces
   *  are ignored by Smart Anonymize Faces and the AI Inspector
   *  overlay. Defaults to 0.3 because BlazeFace's full-range model
   *  routinely reports scores in the 0.3–0.6 band for real faces; a
   *  higher floor would silently drop legitimate detections. The dial
   *  lets the user trade recall vs precision for their specific scene. */
  faceConfidence: number;
  /** "Show me what the AI sees" toggle. When on:
   *    • Remove BG Auto — paints the subject mask as a coral overlay
   *      where the cut would land, with the uncertain-edge band shown
   *      as a striped fringe.
   *    • Redact (Smart anonymize Faces) — draws labelled boxes around
   *      every detected face with its confidence score.
   *  Single shared state so the toggle's identity follows the user
   *  between tools — once they've turned the inspector on, they don't
   *  need to re-enable it per panel. */
  aiInspector: boolean;

  // Portrait blur — gaussian / lens / tilt-shift blur applied to the
  // background. The "blur the subject" mode used to live here too but
  // it overlapped with Redact's anonymisation tooling; this panel is
  // now strictly background-focused depth-of-field.
  /** 0 = Whole image, 2 = Background only. We deliberately skip the
   *  numeric value 1 to keep numeric parity with the other scope
   *  fields and the central MaskScope type, so existing applyMaskScope
   *  helpers don't need a mode switch for this tool. */
  bgBlurScope: number;
  /** Blur strength 0..1; mapped to 0..40 px gaussian radius at the
   *  bake. 0 means no blur. */
  bgBlurAmount: number;
  /** Lens flavour. "gaussian" = even soft blur, "lens" = multi-pass
   *  bokeh approximation, "tilt-shift" = horizontal sharp band over
   *  the subject with strong blur top + bottom. */
  bgBlurLens: "gaussian" | "lens" | "tilt-shift";
  /** When true, blur strength ramps with distance from the subject —
   *  near the silhouette stays softer, far parts of the image get the
   *  full radius. Subject-aware progressive depth-of-field. */
  bgBlurProgressive: boolean;

  // Levels — input black/white/midtone gamma + output black/white.
  levelsBlackIn: number; // 0..255
  levelsWhiteIn: number; // 0..255
  levelsGamma: number; // 0.1..3.0 (1.0 = neutral)
  levelsBlackOut: number; // 0..255
  levelsWhiteOut: number; // 0..255

  // HSL Selective Colour — eight bands × Hue/Sat/Lum sliders. Each
  // array has eight entries, one per band, each in 0..1 with 0.5 ==
  // "no change". `hslBand` is the currently selected band index used
  // by the panel to drive the Hue/Sat/Lum sliders.
  hslHue: number[];
  hslSat: number[];
  hslLum: number[];
  hslBand: number;

  // Border / padding — Solid mode adds N pixels on every side; Aspect
  // mode pads the shorter dimension to match `borderAspect`.
  borderMode: number; // 0 = Solid, 1 = Aspect
  borderThickness: number; // image-space pixels (Solid mode)
  borderColor: string;
  /** Aspect ratio for Aspect mode, expressed as width / height. 0
   *  means "no aspect chosen yet" and the bake skips. */
  borderAspect: number;

  // Perspective — four image-space corner points, in TL/TR/BR/BL
  // order. Null until the tool seeds them to the image corners on
  // first open. Drag handles on the canvas mutate this.
  persCorners: [number, number][] | null;

  /** Time-of-Day slider — a single 0..1 axis the user drags through
   *  Dawn → Morning → Noon (0.5, identity) → Golden → Sunset → Night.
   *  Internally composes temperature, exposure, saturation, and
   *  contrast into a "look" matching that hour of day. Lightroom /
   *  Photoshop don't ship anything like this — they expose the raw
   *  knobs; CloakIMG exposes the emotional axis. The user can still
   *  use Adjust afterward to fine-tune. Lives in its own slot so it
   *  doesn't trample the manual adjust array on undo / redo. */
  timeOfDay: number;

  /** Relight — depth-aware directional light. The sun's position lives
   *  in normalized image space (0..1) so it survives crop / resize, and
   *  the draggable on-canvas handle writes it directly. `relightScope`
   *  reuses the shared MaskScope (0 whole / 1 subject / 2 background) so
   *  the user can relight just the subject. Identity at intensity 0 —
   *  visiting the tool bakes nothing until the user drags. Depends on
   *  the on-device depth capability (downloaded on first open). */
  relightSunX: number;
  relightSunY: number;
  /** Light height 0..1 — grazing side-light → top-down. */
  relightElevation: number;
  /** Relight strength 0..1. 0 = identity. */
  relightIntensity: number;
  /** 0..1, 0.5 neutral; warms the lit side / cools shadows above 0.5. */
  relightWarmth: number;
  relightScope: number;

  /** One-shot hand-off from Tap-to-fix: image-space point the user
   *  tapped before launching Spot heal. SpotHealTool seeds its brush
   *  ring here on mount so the user lands exactly where they tapped,
   *  then clears it back to null. Null means "no pending hand-off". */
  spotHealSeed: { x: number; y: number } | null;
}

export const DEFAULT_TOOL_STATE: ToolState = {
  activeTool: "move",
  cropAspect: 0,
  cropRect: null,
  rotationDeg: 0,
  cropQuarterTurns: 0,
  flipH: false,
  flipV: false,

  idPhotoPresetId: "us-passport",
  idPhotoPaperId: "photo-4x6",
  idPhotoCrop: null,
  idPhotoCustomW: 35,
  idPhotoCustomH: 45,
  idPhotoCutLines: true,

  resizeW: 0,
  resizeH: 0,
  resizeAspectLock: true,
  resizeQuality: 0,

  adjust: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  curveRGB: IDENTITY_CURVE,

  adjustScope: 0,
  filterScope: 0,
  levelsScope: 0,
  hslScope: 0,

  redactMode: 0,
  redactStyle: 0,
  redactStrength: 0.5,
  brushSize: 0.32,
  feather: 0.2,

  filterPreset: 0,
  filterIntensity: 0.65,
  grain: 0,

  meta: {
    stripGPS: false,
    stripCamera: false,
    stripTimestamp: false,
    keepICC: true,
  },

  drawColor: "#f5613a",
  drawSize: 8,
  drawMode: 0,

  textValue: "Add a caption",
  textSize: 64,
  textColor: "#ffffff",
  textFont: 0,
  textWeight: 1,
  textAlign: 0,
  textCurve: 0,
  textItalic: false,
  textUnderline: false,
  textStrokeColor: "#000000",
  textStrokeWidth: 0,
  textCharSpacing: 0,

  watermarkMode: 0,
  watermarkText: "© CloakIMG",
  watermarkPosition: 5,
  watermarkOpacity: 0.55,
  watermarkColor: "#ffffff",
  watermarkSize: 24,
  watermarkImageDataUrl: null,

  shapeKind: 0,
  shapeFill: "#f5613a",
  shapeStroke: "#1e1a16",
  shapeStrokeWidth: 2,
  shapeOpacity: 1,
  shapeCornerRadius: 12,
  shapeSides: 6,
  shapeStarPoints: 5,
  shapeLockAspect: false,

  penStroke: "#1e1a16",
  penFill: "transparent",
  penStrokeWidth: 2,

  emojiChar: "😀",

  // 0 = "no frame yet" — the FramePanel seeds a proportional default
  // (~3 % of the shorter image side) the first time the user opens
  // the tool on a given image, so the result scales sensibly across
  // anything from a 400-px badge to a 6 kpx photo.
  frameWidth: 0,
  frameColor: "#ffffff",
  frameStyle: 0,

  pickedColor: null,
  hoverColor: null,
  selectedLayerId: null,

  genericStrength: 0.5,
  genericSize: 0.24,
  genericMode: 0,

  bgSample: null,
  bgPickActive: false,
  bgMode: 0,
  bgFillMode: 0,
  bgFillColor: "#ffffff",
  bgQuality: 0,
  // 0.5 = balanced; matches the centre of the dial and the alpha
  // threshold the lib was implicitly using before we exposed the
  // knob, so existing flows produce identical pixels with the dial
  // untouched.
  bgConfidence: 0.5,
  // 0.3 = BlazeFace's natural noise floor — see the field comment in
  // ToolState. Lower would surface false positives; higher silently
  // drops real faces in difficult angles / lighting.
  faceConfidence: 0.3,
  aiInspector: false,

  // Default to Background scope so the moment the user touches the
  // strength slider, the bake targets the right region without
  // further ceremony. Strength itself defaults to 0 (identity) — the
  // tool must do nothing until the user explicitly asks for it,
  // matching every other auto-flushing pixel tool (Adjust / Filter /
  // Levels / HSL all start at identity). Earlier we seeded 0.4 so
  // opening the panel showed an immediate phone-portrait preview,
  // but that meant just *visiting* the tool and switching away baked
  // a blur into history — silent, surprising, and inconsistent with
  // how every other tool behaves.
  bgBlurScope: 2,
  bgBlurAmount: 0,
  // Default lens kind reads naturally on most photos; users can opt
  // into "lens" for a more cinematic falloff or "tilt-shift" for the
  // miniature look. Progressive falloff defaults to off because it's
  // a stylistic choice — the basic phone-portrait look is even-blur
  // and most users want exactly that.
  bgBlurLens: "gaussian",
  bgBlurProgressive: false,

  levelsBlackIn: LEVELS_DEFAULT.blackIn,
  levelsWhiteIn: LEVELS_DEFAULT.whiteIn,
  levelsGamma: LEVELS_DEFAULT.gamma,
  levelsBlackOut: LEVELS_DEFAULT.blackOut,
  levelsWhiteOut: LEVELS_DEFAULT.whiteOut,

  // hslIdentity returns fresh arrays each call so the default state's
  // arrays aren't shared by reference with anyone else.
  ...(() => {
    const id = hslIdentity();
    return { hslHue: id.hue, hslSat: id.sat, hslLum: id.lum };
  })(),
  hslBand: 0,

  borderMode: 0,
  borderThickness: 0,
  borderColor: "#ffffff",
  borderAspect: 0,

  persCorners: null,

  // 0.5 = identity (Noon). The slider's default lands here so opening
  // the tool shows the original photo until the user actually drags.
  timeOfDay: 0.5,

  // Sun starts upper-centre — the most natural "daylight from above"
  // position. Intensity 0 keeps the tool a no-op until the user engages,
  // matching every other auto-flushing pixel tool.
  relightSunX: 0.5,
  relightSunY: 0.18,
  relightElevation: 0.6,
  relightIntensity: 0,
  relightWarmth: 0.5,
  relightScope: 0,

  spotHealSeed: null,
};
