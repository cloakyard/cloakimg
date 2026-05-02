// exportPipeline.ts — Compose the doc + layers onto a target-sized
// canvas and encode to a Blob with the chosen format / quality.
//
// Re-encoding through canvas.toBlob strips all EXIF. That matches the
// privacy default; selectively *preserving* a subset of tags (the
// "Keep ICC profile" toggle, etc.) would need a per-format encoder
// that's out of scope for the in-browser implementation today.

import type { Canvas as FabricCanvas } from "fabric";
import { createCanvas, type EditorDoc, type Layer } from "./doc";
import { filterAndInjectExif, type KeepRules } from "./tools/exifFilter";

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
  /** 0..4 → JPG | PNG | WebP | AVIF | HEIC (HEIC is Safari-only). */
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

/**
 * HEIC export availability — Safari is the only browser whose
 * `canvas.toBlob('image/heic', …)` actually returns HEIC bytes; every
 * other engine silently falls back to PNG. We probe once on first
 * call and cache. The check encodes a 1×1 canvas, so it's cheap.
 *
 * Note: AVIF gives the same wide-gamut + small-file benefits cross-
 * browser via canvas.toBlob('image/avif'), with no patent baggage.
 * The HEIC option is offered when supported but the export modal
 * surfaces this so users on Chrome/Firefox aren't confused.
 */
let heicSupportPromise: Promise<boolean> | null = null;
export function isHeicEncodeSupported(): Promise<boolean> {
  if (!heicSupportPromise) {
    heicSupportPromise = (async () => {
      try {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        const blob = await new Promise<Blob | null>((resolve) =>
          c.toBlob((b) => resolve(b), "image/heic", 0.5),
        );
        return !!blob && blob.type === "image/heic";
      } catch {
        return false;
      }
    })();
  }
  return heicSupportPromise;
}

function sizeMultiplier(bucket: number): number {
  return bucket === 1 ? 1 : bucket === 2 ? 0.5 : 1;
  // bucket 0 == Original (1x of doc), bucket 1 == @2x (full),
  // bucket 2 == @1x (half). The design's mockup labels "@2x" as the
  // active middle tab so we treat that as the doc's native size.
}

export async function exportDoc(
  doc: EditorDoc,
  layers: Layer[],
  settings: ExportSettings,
  metaRules?: KeepRules,
  fabricCanvas?: FabricCanvas | null,
): Promise<RenderResult> {
  const format = settingsToFormat(settings);
  let outW = settings.width ?? Math.round(doc.width * sizeMultiplier(settings.sizeBucket));
  let outH = settings.height ?? Math.round(doc.height * sizeMultiplier(settings.sizeBucket));
  outW = Math.max(1, outW);
  outH = Math.max(1, outH);

  const out = createCanvas(outW, outH);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Could not create export context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(doc.working, 0, 0, outW, outH);

  // All non-destructive layers (text, watermark, watermarkImage, draw)
  // are now Fabric objects (Phases F2-B-1 through F2-B-4). The
  // `layers` array is retained as a typed slot for future reuse but
  // contributes nothing to the export bake.
  void layers;
  const sx = outW / doc.width;
  const sy = outH / doc.height;

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
      obj.render(ctx);
    }
    ctx.restore();
  }

  let blob = await encode(out, format, settings.quality);
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

async function encode(canvas: HTMLCanvasElement, format: Format, quality: number): Promise<Blob> {
  const mime = FORMAT_TO_MIME[format];
  const blob = await canvasToBlob(canvas, mime, quality);
  if (blob && blob.type === mime) return blob;
  // HEIC: only Safari encodes natively. If the browser fell back to
  // PNG we surface a clear error rather than handing the user a
  // mislabeled blob — the export modal already gates this path on
  // `isHeicEncodeSupported`, so reaching here means the user's browser
  // claimed support and then reneged.
  if (format === "heic") {
    throw new Error("HEIC export needs Safari 17+ — try AVIF for the same benefits cross-browser.");
  }
  // AVIF fallback: a few older engines can't encode AVIF; fall through
  // to WebP and quietly relabel.
  if (format === "avif") {
    const webp = await canvasToBlob(canvas, "image/webp", quality);
    if (webp) return webp;
  }
  if (!blob) throw new Error(`Browser refused to encode ${mime}`);
  return blob;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

function renameForFormat(name: string, format: Format): string {
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
  const blob = await new Promise<Blob | null>((resolve) =>
    thumb.toBlob((b) => resolve(b), FORMAT_TO_MIME[format], s.quality),
  );
  if (!blob) return estimateBytes(targetW, targetH, s);
  const targetPx = Math.max(1, targetW * targetH);
  const thumbPx = Math.max(1, tw * th);
  return Math.round((blob.size * targetPx) / thumbPx);
}
