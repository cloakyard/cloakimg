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

  // Sticker
  stickerKind: number; // index into STICKERS
  /** ID of the user-uploaded sticker selected in the panel; takes
   *  priority over `stickerKind` when set. Cleared when the user
   *  picks a built-in sticker again. */
  customStickerId: string | null;

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
  /** Auto-mode quality / size trade-off:
   *    0 = small  (~44 MB int8 model, fastest, fine for ~1 MP photos)
   *    1 = medium (~88 MB fp16 model, sharper edges)
   *    2 = large  (~176 MB fp32 model, best quality, slow on phones) */
  bgQuality: number;

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
}

export const DEFAULT_TOOL_STATE: ToolState = {
  activeTool: "move",
  cropAspect: 0,
  cropRect: null,
  rotationDeg: 0,
  cropQuarterTurns: 0,
  flipH: false,
  flipV: false,

  resizeW: 0,
  resizeH: 0,
  resizeAspectLock: true,
  resizeQuality: 0,

  adjust: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  curveRGB: IDENTITY_CURVE,

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

  stickerKind: 0,
  customStickerId: null,

  // 0 = "no frame yet" — the FramePanel seeds a proportional default
  // (~3 % of the shorter image side) the first time the user opens
  // the tool on a given image, so the result scales sensibly across
  // anything from a 400-px sticker to a 6 kpx photo.
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
  bgQuality: 0,

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
};
