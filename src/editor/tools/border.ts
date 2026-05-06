// border.ts — Outer padding around the image. Two modes:
//
//   • Solid: a fixed thickness on all four sides. Useful for matting
//     a print or giving a screenshot breathing room.
//   • Aspect: pad until the canvas hits a target aspect ratio. The
//     image stays centred; the shorter axis grows to match. Great for
//     posting tall iPhone shots to a 1:1 grid.
//
// Returns the new canvas (always larger than the source) plus the
// (left, top) offset that callers need so layers / Fabric objects can
// shift along with the image.

import { createCanvas } from "../doc";

export type BorderMode = 0 | 1; // 0 = Solid, 1 = Aspect

export interface BorderParams {
  mode: BorderMode;
  /** Solid mode only: padding thickness in image-space pixels. */
  thickness: number;
  color: string;
  /** Aspect mode only: ratio of width / height. >0; e.g. 1 for square. */
  aspect: number;
}

/** Aspect presets for the Aspect mode. Mirror common social sizes
 *  plus a few useful "letterbox" ratios. Index 0 is Original (no-op
 *  in aspect mode — the panel ignores it). */
export const BORDER_ASPECTS = [
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "5:4", ratio: 5 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
] as const;

export interface BorderResult {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

export function isBorderIdentity(p: BorderParams, srcW: number, srcH: number): boolean {
  if (p.mode === 0) return p.thickness <= 0;
  if (!p.aspect || p.aspect <= 0) return true;
  const target = computeAspectTargetSize(srcW, srcH, p.aspect);
  return target.w === srcW && target.h === srcH;
}

/** For Aspect mode: figure out the target canvas size that contains
 *  (srcW × srcH) at the requested aspect ratio. Always grows — we
 *  never crop in this tool. */
export function computeAspectTargetSize(
  srcW: number,
  srcH: number,
  aspect: number,
): { w: number; h: number } {
  if (aspect <= 0) return { w: srcW, h: srcH };
  const srcAspect = srcW / srcH;
  if (Math.abs(srcAspect - aspect) < 1e-3) return { w: srcW, h: srcH };
  if (srcAspect > aspect) {
    // Source is too wide — grow height.
    return { w: srcW, h: Math.round(srcW / aspect) };
  }
  // Source is too tall — grow width.
  return { w: Math.round(srcH * aspect), h: srcH };
}

/** Bake the border. The source is left untouched; the returned canvas
 *  is freshly allocated at the new dimensions. */
export function bakeBorder(src: HTMLCanvasElement, p: BorderParams): BorderResult {
  let outW = src.width;
  let outH = src.height;
  let offsetX = 0;
  let offsetY = 0;
  if (p.mode === 0) {
    const t = Math.max(0, Math.round(p.thickness));
    outW = src.width + t * 2;
    outH = src.height + t * 2;
    offsetX = t;
    offsetY = t;
  } else {
    const target = computeAspectTargetSize(src.width, src.height, p.aspect);
    outW = target.w;
    outH = target.h;
    offsetX = Math.floor((outW - src.width) / 2);
    offsetY = Math.floor((outH - src.height) / 2);
  }
  const out = createCanvas(outW, outH);
  const ctx = out.getContext("2d");
  if (!ctx) return { canvas: out, offsetX: 0, offsetY: 0 };
  ctx.fillStyle = p.color;
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(src, offsetX, offsetY);
  return { canvas: out, offsetX, offsetY };
}

/** Slider ceiling for the Solid mode. 25 % of the shorter side keeps
 *  the slider expressive without blowing up the canvas — and the
 *  bake is gated on the result being larger, so anything zero or
 *  negative becomes a no-op. */
export function solidBorderMax(srcW: number, srcH: number): number {
  const shorter = Math.max(1, Math.min(srcW, srcH));
  return Math.max(40, Math.round(shorter * 0.25));
}
