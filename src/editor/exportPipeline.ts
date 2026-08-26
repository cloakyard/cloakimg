// exportPipeline.ts — Compose the doc + layers onto a target-sized
// canvas and encode to a Blob with the chosen format / quality.
//
// Re-encoding through canvas.toBlob strips all EXIF. That matches the
// privacy default; selectively *preserving* a subset of tags (the
// "Keep ICC profile" toggle, etc.) would need a per-format encoder
// that's out of scope for the in-browser implementation today.

import type { Canvas as FabricCanvas } from "fabric";
import { createCanvas, type EditorDoc, type Layer } from "./doc";
import { encodeModernCanvas } from "./exportCodec";
import { filterAndInjectExif, type KeepRules } from "./tools/exifFilter";
import { TRANSIENT_CLOAK_KINDS } from "./tools/penPath";

export type Format = "jpeg" | "png" | "webp" | "avif" | "heic";

const FORMAT_INDEX_TO_MIME: Format[] = ["jpeg", "png", "webp", "avif", "heic"];
const FORMAT_TO_MIME: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
};

const FORMAT_TO_EXTENSION: Record<Format, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  avif: ".avif",
  heic: ".heic",
};

export interface ExportSettings {
  /** 0..4 → JPG | PNG | WebP | AVIF | HEIC. */
  format: number;
  /** 0..1, ignored for PNG. */
  quality: number;
  /** 0..2 → Original | @2x | @1x */
  sizeBucket: number;
  /** Optional explicit target dimensions; overrides sizeBucket. */
  width?: number;
  height?: number;
}

export interface RenderResult {
  blob: Blob;
  format: Format;
  width: number;
  height: number;
  fileName: string;
}

export function settingsToFormat(s: ExportSettings): Format {
  return FORMAT_INDEX_TO_MIME[s.format] ?? "webp";
}

export function formatSupportsQuality(format: Format): boolean {
  return format !== "png";
}

function sizeMultiplier(bucket: number): number {
  return bucket === 1 ? 1 : bucket === 2 ? 0.5 : 1;
  // bucket 0 == Original (1x of doc), bucket 1 == @2x (full),
  // bucket 2 == @1x (half). The design's mockup labels "@2x" as the
  // active middle tab so we treat that as the doc's native size.
}

/** Resolve export dimensions without ever changing the edited image's
 * aspect ratio. A single explicit edge is authoritative; when both are
 * present (for example from settings persisted by an older build), width
 * wins so a stale height cannot stretch the output. */
export function resolveExportDimensions(
  sourceWidth: number,
  sourceHeight: number,
  settings: ExportSettings,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(sourceWidth));
  const safeHeight = Math.max(1, Math.round(sourceHeight));
  const aspect = safeWidth / safeHeight;

  if (settings.width !== undefined) {
    const width = Math.max(1, Math.round(settings.width));
    return { width, height: Math.max(1, Math.round(width / aspect)) };
  }
  if (settings.height !== undefined) {
    const height = Math.max(1, Math.round(settings.height));
    return { width: Math.max(1, Math.round(height * aspect)), height };
  }

  const multiplier = sizeMultiplier(settings.sizeBucket);
  return {
    width: Math.max(1, Math.round(safeWidth * multiplier)),
    height: Math.max(1, Math.round(safeHeight * multiplier)),
  };
}

export async function exportDoc(
  doc: EditorDoc,
  layers: Layer[],
  settings: ExportSettings,
  metaRules?: KeepRules,
  fabricCanvas?: FabricCanvas | null,
): Promise<RenderResult> {
  const format = settingsToFormat(settings);
  const { width: outW, height: outH } = resolveExportDimensions(doc.width, doc.height, settings);

  const out = renderCompositeCanvas(doc, layers, outW, outH, fabricCanvas);
  let blob = await encodeCanvas(out, format, settings.quality);
  // JPEG-only: optionally splice the source's EXIF (filtered per the
  // metadata panel toggles) into the freshly-encoded bytes.
  if (format === "jpeg" && metaRules && doc.sourceIsJpeg && doc.sourceBytes) {
    const encoded = new Uint8Array(await blob.arrayBuffer());
    const merged = filterAndInjectExif(doc.sourceBytes, encoded, metaRules);
    if (merged !== encoded) {
      const buf = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
      blob = new Blob([buf as ArrayBuffer], { type: "image/jpeg" });
    }
  }
  const fileName = renameForFormat(doc.fileName, format);
  return { blob, format, width: outW, height: outH, fileName };
}

/** Render the editable raster plus persistent Fabric layers to a
 *  canvas. Tool-owned handles and crop guides are intentionally
 *  omitted so output actions can run while a tool is still active. */
export function renderCompositeCanvas(
  doc: EditorDoc,
  layers: Layer[],
  outW = doc.width,
  outH = doc.height,
  fabricCanvas?: FabricCanvas | null,
): HTMLCanvasElement {
  const out = createCanvas(Math.max(1, Math.round(outW)), Math.max(1, Math.round(outH)));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Could not create export context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(doc.working, 0, 0, out.width, out.height);

  // All non-destructive layers (text, watermark, watermarkImage, draw)
  // are now Fabric objects (Phases F2-B-1 through F2-B-4). The
  // `layers` array is retained as a typed slot for future reuse but
  // contributes nothing to the export bake.
  void layers;
  const sx = out.width / doc.width;
  const sy = out.height / doc.height;

  // Bake Fabric objects (Phase F2-B onwards). Their coordinates live
  // in image-space, so a single ctx.scale(sx, sy) brings them to the
  // export canvas's output-space; each object's own matrix
  // (left/top/scaleX/scaleY/angle/originX/originY) is applied by
  // Fabric.Object.render.
  if (fabricCanvas) {
    ctx.save();
    ctx.scale(sx, sy);
    for (const obj of fabricCanvas.getObjects()) {
      if (!obj.visible) continue;
      const kind = (obj as { cloakKind?: string }).cloakKind ?? "";
      if (TRANSIENT_CLOAK_KINDS.has(kind)) continue;
      obj.render(ctx);
    }
    ctx.restore();
  }
  return out;
}

/** Encode a canvas without ever relabelling one format's bytes as
 * another. Browser canvas implementations are allowed to fall back to
 * PNG for an unsupported MIME type, so both the reported MIME and the
 * binary signature are checked before the result can be downloaded. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: Format,
  quality: number,
): Promise<Blob> {
  const mime = FORMAT_TO_MIME[format];
  const blob = await canvasToBlob(canvas, mime, quality);
  if (blob?.type === mime && (await blobMatchesFormat(blob, format))) return blob;

  // AVIF and HEIC get real WASM fallbacks. WebP/JPEG/PNG are supported
  // by all target browsers; if one of those encoders refuses or lies,
  // fail visibly rather than produce a corrupt/misnamed download.
  if (format === "avif" || format === "heic") {
    const encoded = await encodeModernCanvas(canvas, format, quality);
    if (encoded.type === mime && (await blobMatchesFormat(encoded, format))) return encoded;
    throw new Error(`${format.toUpperCase()} encoder returned invalid bytes`);
  }

  if (!blob) throw new Error(`Browser refused to encode ${mime}`);
  if (blob.type === mime) throw new Error(`Browser returned invalid ${mime} bytes`);
  throw new Error(`Browser returned ${blob.type || "an unknown format"} instead of ${mime}`);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Validate the file's magic bytes. This is intentionally exported for
 * regression tests and for any future file-system writer that bypasses
 * the modal. */
export async function blobMatchesFormat(blob: Blob, format: Format): Promise<boolean> {
  const bytes = new Uint8Array(await readBlobBytes(blob.slice(0, 64)));
  switch (format) {
    case "jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png":
      return (
        bytes[0] === 0x89 &&
        ascii(bytes, 1, 3) === "PNG" &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "avif":
      return isIsoBaseMedia(bytes, new Set(["avif", "avis"]));
    case "heic":
      return isIsoBaseMedia(bytes, new Set(["heic", "heix", "hevc", "hevx"]));
  }
}

function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  // Blob.arrayBuffer is universal in target browsers, but FileReader
  // keeps this validator usable in older WebViews and jsdom's smaller
  // Blob implementation used by the regression suite.
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read encoded image"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Could not read encoded image"));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function isIsoBaseMedia(bytes: Uint8Array, brands: ReadonlySet<string>): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return false;
  // Major brand starts at byte 8; compatible brands follow the minor
  // version at byte 16. Checking the complete ftyp header accepts the
  // variants emitted by native encoders without confusing AVIF/HEIC.
  if (brands.has(ascii(bytes, 8, 4))) return true;
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    if (brands.has(ascii(bytes, offset, 4))) return true;
  }
  return false;
}

export function renameForFormat(name: string, format: Format): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}${FORMAT_TO_EXTENSION[format]}`;
}

/** Cheap empirical estimate, in bytes. Good enough as a fallback when
 *  the thumb-encode estimator hasn't returned yet. */
export function estimateBytes(width: number, height: number, s: ExportSettings): number {
  const px = width * height;
  switch (settingsToFormat(s)) {
    case "jpeg":
      return Math.round(px * (0.06 + 0.5 * s.quality));
    case "webp":
      return Math.round(px * (0.04 + 0.32 * s.quality));
    case "avif":
      return Math.round(px * (0.025 + 0.22 * s.quality));
    case "heic":
      // HEIC (HEVC frames) compresses ~10–15% smaller than AVIF in
      // practice on photos; Safari's encoder is well-tuned.
      return Math.round(px * (0.022 + 0.2 * s.quality));
    case "png":
      return Math.round(px * 1.6);
  }
}

const THUMB_LONG_EDGE = 320;

/** Encode a downsampled thumb at the requested format/quality and
 *  scale the bytes by the area ratio for an accurate estimate. */
export async function estimateBytesByEncode(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  s: ExportSettings,
): Promise<number> {
  const longEdge = Math.max(source.width, source.height);
  const ratio = longEdge > THUMB_LONG_EDGE ? THUMB_LONG_EDGE / longEdge : 1;
  const tw = Math.max(1, Math.round(source.width * ratio));
  const th = Math.max(1, Math.round(source.height * ratio));
  const thumb = createCanvas(tw, th);
  const ctx = thumb.getContext("2d");
  if (!ctx) return estimateBytes(targetW, targetH, s);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, tw, th);
  const format = settingsToFormat(s);
  const blob = await encodeCanvas(thumb, format, s.quality).catch(() => null);
  if (!blob) return estimateBytes(targetW, targetH, s);
  const targetPx = Math.max(1, targetW * targetH);
  const thumbPx = Math.max(1, tw * th);
  return Math.round((blob.size * targetPx) / thumbPx);
}
