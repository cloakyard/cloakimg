// toolState.ts — The flat shape of all per-tool settings the editor
// keeps in memory. Pulling these out into one object means a tool's
// settings persist when the user switches tools and comes back, which
// matches the design's promise of a single canvas.

import type { Rect } from "./tools/cropMath";
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

export interface ToolState {
  activeTool: ToolId;

  // Crop / rotate
  cropAspect: number; // index into ASPECT_OPTIONS
  cropRect: Rect | null; // image-space pixels
  rotationDeg: number; // -45..+45 (free) or any 0/90/180/270 from the 90° button
  flipH: boolean;
  flipV: boolean;

  // Resize
  resizeW: number;
  resizeH: number;
  resizeAspectLock: boolean;
  resizeQuality: number; // [Fast, High] — High uses Lanczos-3

  // Adjust — 9 sliders, each 0..1, 0.5 == "no change"
  adjust: number[];

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
}

export const DEFAULT_TOOL_STATE: ToolState = {
  activeTool: "move",
  cropAspect: 0,
  cropRect: null,
  rotationDeg: 0,
  flipH: false,
  flipV: false,

  resizeW: 0,
  resizeH: 0,
  resizeAspectLock: true,
  resizeQuality: 0,

  adjust: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],

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

  frameWidth: 24,
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
};
