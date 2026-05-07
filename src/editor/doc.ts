// doc.ts — The editor's mutable document model.
//
// We keep a single off-screen `working` canvas that holds the baked
// image. Tools commit their work onto `working`, push a snapshot onto
// the history stack, and the live canvas is re-painted from
// `working` plus any in-progress overlay (e.g. an unfinished redact
// rectangle, a draw stroke being painted).
//
// Layers (text, watermark, drawings) are *not* baked until the user
// commits or exports; they live as a stack of overlay primitives
// rendered on top of `working`. This lets us tweak them non-
// destructively in the property panel.

import type { StartChoice } from "../landing/StartModal";
import { get2DContext } from "./colorSpace";
import { decodeHeic, isHeicFile } from "./heicDecoder";
import { type ExifData, readExif } from "./tools/exif";

export type LayerKind = "text" | "watermark" | "watermarkImage" | "draw";

export interface BaseLayer {
  id: string;
  kind: LayerKind;
  visible: boolean;
  /** Optional human-readable label shown in the Layers panel. */
  name?: string;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  text: string;
  x: number; // 0..1
  y: number; // 0..1
  size: number; // px in image-space
  color: string;
  font: string;
  weight: number;
  align: "left" | "center" | "right";
  opacity: number; // 0..1
}

export type WatermarkAnchor = "tl" | "tc" | "tr" | "bl" | "bc" | "br";

export interface WatermarkLayer extends BaseLayer {
  kind: "watermark";
  text: string;
  position: WatermarkAnchor;
  size: number;
  color: string;
  opacity: number;
}

export interface WatermarkImageLayer extends BaseLayer {
  kind: "watermarkImage";
  /** Inlined data URL so the layer survives reloads from history. */
  src: string;
  position: WatermarkAnchor;
  /** Width as a fraction of the image width (0..1). */
  scale: number;
  opacity: number;
}

export interface DrawStroke {
  color: string;
  size: number;
  points: [number, number][]; // image-space coords
}

export interface DrawLayer extends BaseLayer {
  kind: "draw";
  strokes: DrawStroke[];
}

export type Layer = TextLayer | WatermarkLayer | WatermarkImageLayer | DrawLayer;

export interface EditorDoc {
  width: number;
  height: number;
  /** Source image as a backup; null for blank canvases. */
  source: ImageBitmap | null;
  /** Raw bytes of the original source file. Used by the EXIF filter on
   *  JPEG export to selectively re-inject the original metadata. Null
   *  for blank canvases or unsupported formats. */
  sourceBytes: Uint8Array | null;
  /** True when the source was a JPEG (only JPEGs carry APP1 EXIF). */
  sourceIsJpeg: boolean;
  /** The "baked" canvas — what export captures. */
  working: HTMLCanvasElement;
  /** Original-source EXIF, if any. */
  exif: ExifData | null;
  /** Suggested file name for export. */
  fileName: string;
  /** Layered, non-destructive primitives. */
  layers: Layer[];
}

export function createCanvas(
  w: number,
  h: number,
  opts?: { willReadFrequently?: boolean },
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // Bind the canvas to display-p3 (where supported) on first context
  // creation so subsequent `getContext("2d")` calls return the same
  // wide-gamut context. drawImage handles sRGB→P3 conversion for sRGB
  // sources, so this is gain-only.
  //
  // `willReadFrequently` is bound here too — it can only be set on the
  // first getContext call, so callers that round-trip through
  // getImageData (preview bakes, pixel-loop adjustments) must opt in
  // at creation time.
  get2DContext(c, { willReadFrequently: opts?.willReadFrequently });
  return c;
}

// ── Scratch-canvas pool ─────────────────────────────────────────────
// Hot paths (Adjust / Filter / Remove BG previews) allocate a fresh
// HTMLCanvasElement on every rAF during a slider drag. At a 720 px
// preview that's ~2 MB of GC pressure per second, plus the cost of
// creating and binding a colour-managed 2D context each time. The
// pool keeps a handful of canvases per (w, h) so consecutive frames
// reuse the same backing store.
//
// Release lifecycle: callers (the preview hooks) must release the
// *previous* canvas before overwriting their state with a new one —
// otherwise the pool slowly drains and we just allocate forever.
const POOL_LIMIT_PER_SIZE = 3;
const pool = new Map<string, HTMLCanvasElement[]>();

function poolKey(w: number, h: number): string {
  return `${w}x${h}`;
}

/** Pull a same-sized scratch canvas from the pool, or create one. The
 *  canvas is cleared before being returned, so callers can treat it as
 *  fresh. Don't use this for canvases that need to outlive a single
 *  rAF — only for short-lived scratch like preview bakes.
 *
 *  Pool canvases are always created with `willReadFrequently: true`
 *  because every consumer (Adjust / Filter / Levels / HSL / Bg blur
 *  bakes) round-trips through `getImageData` + pixel loops. The CPU
 *  backing store cuts the per-frame readback cost dramatically and
 *  silences the browser's "Multiple readback operations" warning. */
export function acquireCanvas(w: number, h: number): HTMLCanvasElement {
  const stack = pool.get(poolKey(w, h));
  const c = stack?.pop();
  if (c) {
    const ctx = c.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, w, h);
    return c;
  }
  return createCanvas(w, h, { willReadFrequently: true });
}

/** Return a canvas to the pool. Caller must drop all references
 *  afterwards — a future `acquireCanvas` may hand the same element to
 *  someone else. Drops on the floor once the per-size cap is hit so a
 *  rapid sequence of unique sizes can't unboundedly grow the pool.
 *
 *  ⚠️ Do not call this inside a `setState` updater function. React
 *  StrictMode double-invokes updaters in dev to flag impurity, which
 *  pushes the same canvas onto the pool twice and corrupts subsequent
 *  acquires. The live-preview hooks track their published canvas in
 *  a ref and release it synchronously before calling setPreview.
 *  See AGENTS.md → "Critical gotcha: live preview hooks". */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return;
  const key = poolKey(c.width, c.height);
  const stack = pool.get(key);
  if (stack) {
    if (stack.length < POOL_LIMIT_PER_SIZE) stack.push(c);
    return;
  }
  pool.set(key, [c]);
}

function fillBackground(c: HTMLCanvasElement, color: string) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
}

/** Build an `EditorDoc` from a start-modal choice. */
export async function createDoc(choice: StartChoice): Promise<EditorDoc> {
  if (choice.kind === "blank") {
    const working = createCanvas(choice.w, choice.h);
    if (choice.background) fillBackground(working, choice.background);
    return {
      width: choice.w,
      height: choice.h,
      source: null,
      sourceBytes: null,
      sourceIsJpeg: false,
      working,
      exif: null,
      fileName: `untitled_${choice.w}x${choice.h}.png`,
      layers: [],
    };
  }
  const isJpeg = choice.file.type === "image/jpeg" || /\.jpe?g$/i.test(choice.file.name);
  const [bitmap, exif, sourceBytes] = await Promise.all([
    loadFile(choice.file),
    readExif(choice.file).catch(() => null),
    isJpeg ? readFileBytes(choice.file).catch(() => null) : Promise.resolve(null),
  ]);
  const working = createCanvas(bitmap.width, bitmap.height);
  const ctx = working.getContext("2d");
  ctx?.drawImage(bitmap, 0, 0);
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    sourceBytes,
    sourceIsJpeg: isJpeg,
    working,
    exif,
    fileName: choice.file.name,
    layers: [],
  };
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function loadFile(file: File): Promise<ImageBitmap> {
  // HEIC/HEIF: only Safari can decode these via createImageBitmap;
  // everywhere else we drop into libheif-js (lazy-loaded WASM). Doing
  // this branch first means Chrome/Firefox don't waste a roundtrip
  // through createImageBitmap before falling back.
  if (isHeicFile(file)) {
    try {
      return await decodeHeic(file);
    } catch {
      // Some `.heic`-named files are actually JPEGs from buggy export
      // tools. Fall through to the standard pipeline so we still open
      // them.
    }
  }
  try {
    return await createImageBitmap(file);
  } catch {
    return await loadViaImage(file);
  }
}

function loadViaImage(file: File): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img).then((bm) => {
        URL.revokeObjectURL(url);
        resolve(bm);
      }, reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode ${file.name}`));
    };
    img.src = url;
  });
}

/** Clone a canvas into a new one of the same dimensions. */
export function snapshot(c: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(c.width, c.height);
  const ctx = out.getContext("2d");
  if (ctx) ctx.drawImage(c, 0, 0);
  return out;
}

/** Replace the contents of dst with src. Resizes if dimensions differ. */
export function copyInto(dst: HTMLCanvasElement, src: HTMLCanvasElement) {
  if (dst.width !== src.width) dst.width = src.width;
  if (dst.height !== src.height) dst.height = src.height;
  const ctx = dst.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, dst.width, dst.height);
  ctx.drawImage(src, 0, 0);
}
