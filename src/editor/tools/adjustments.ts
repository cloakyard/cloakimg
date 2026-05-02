// adjustments.ts — Pure functions that translate adjust-slider values
// into either a CSS filter string (for cheap live preview) or per-pixel
// canvas operations (for the destructive Apply).
//
// Each slider stores 0..1 with 0.5 == "no change". We map those to a
// signed range and let the math do the rest.

import { ADJUST_KEYS, type AdjustKey } from "../toolState";
import { createCanvas } from "../doc";

export type AdjustValues = Partial<Record<AdjustKey, number>>;

const RANGE: Record<AdjustKey, number> = {
  exposure: 2, // ±2 stops
  contrast: 1, // 100%
  highlights: 1,
  shadows: 1,
  whites: 1,
  blacks: 1,
  saturation: 1,
  vibrance: 1,
  temp: 1,
  vignette: 1, // -1 = halo, +1 = darken edges
  sharpen: 1, // -1 = blur, +1 = unsharp mask
};

export function sliderToSigned(key: AdjustKey, slider: number): number {
  return (slider - 0.5) * 2 * RANGE[key];
}

export function sliderArrayToValues(arr: number[]): Required<AdjustValues> {
  const out = {} as Required<AdjustValues>;
  ADJUST_KEYS.forEach((k, i) => {
    out[k] = sliderToSigned(k, arr[i] ?? 0.5);
  });
  return out;
}

/** Identity if all sliders are 0.5. */
export function isIdentity(arr: number[]): boolean {
  return arr.every((v) => Math.abs(v - 0.5) < 1e-3);
}

/** A CSS filter string that approximates the adjust pipeline. Used for
 *  live preview only; Apply runs the proper per-pixel bake. */
export function cssFilterFor(arr: number[]): string {
  const v = sliderArrayToValues(arr);
  const parts: string[] = [];
  // exposure: 1.0 base, 1 stop = 2x brightness, but visually ±0.4 reads
  // about right for the design's intent.
  const exposure = 1 + v.exposure * 0.4;
  if (Math.abs(exposure - 1) > 1e-3) parts.push(`brightness(${exposure.toFixed(3)})`);
  // contrast: 1.0 base, ±100% maps to 0..2 visually too aggressive, so
  // damp it.
  const contrast = 1 + v.contrast * 0.6;
  if (Math.abs(contrast - 1) > 1e-3) parts.push(`contrast(${contrast.toFixed(3)})`);
  // saturation
  const saturation = 1 + v.saturation * 0.8;
  if (Math.abs(saturation - 1) > 1e-3) parts.push(`saturate(${saturation.toFixed(3)})`);
  // temp — sepia + hue-rotate gives a warm/cool shift.
  const temp = v.temp;
  if (Math.abs(temp) > 1e-3) {
    const sepia = Math.min(0.6, Math.abs(temp) * 0.6);
    const hue = temp > 0 ? -10 : 30;
    parts.push(`sepia(${sepia.toFixed(3)})`);
    parts.push(`hue-rotate(${hue.toFixed(0)}deg)`);
  }
  return parts.join(" ") || "none";
}

/** Run a real per-pixel pass into a fresh canvas. */
export function bakeAdjust(src: HTMLCanvasElement, arr: number[], grain = 0): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);

  if (isIdentity(arr) && grain === 0) return out;

  const v = sliderArrayToValues(arr);

  // Sharpen runs first (spatial 5-tap) so subsequent per-pixel passes
  // operate on the sharpened result.
  if (Math.abs(v.sharpen) > 1e-3) applySharpen(out, v.sharpen);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;

  // Pre-compute scalars used in the inner loop.
  const expo = Math.pow(2, v.exposure); // ±2 stops
  const con = 1 + v.contrast; // 0..2
  const sat = 1 + v.saturation;
  const vib = v.vibrance;
  const hi = v.highlights * 0.6;
  const sh = v.shadows * 0.6;
  const wh = v.whites * 0.4;
  const bl = v.blacks * 0.4;
  // temp: positive shifts red+, blue-; negative reverses.
  const tempR = v.temp * 25;
  const tempB = -v.temp * 25;

  const grainAmount = grain * 40; // 0..40 units of noise

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] ?? 0;
    let g = data[i + 1] ?? 0;
    let b = data[i + 2] ?? 0;

    // exposure
    r *= expo;
    g *= expo;
    b *= expo;

    // contrast around 128
    r = (r - 128) * con + 128;
    g = (g - 128) * con + 128;
    b = (b - 128) * con + 128;

    // luminance for highlights / shadows / vibrance
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;

    // shadows boost dark, highlights pull bright
    const shadowMask = Math.max(0, 1 - lum / 128);
    const highlightMask = Math.max(0, (lum - 128) / 128);
    const sAdjust = sh * 60 * shadowMask;
    const hAdjust = -hi * 60 * highlightMask;
    r += sAdjust + hAdjust;
    g += sAdjust + hAdjust;
    b += sAdjust + hAdjust;

    // whites / blacks
    if (wh !== 0) {
      const m = Math.max(0, (lum - 200) / 55);
      r += wh * 30 * m;
      g += wh * 30 * m;
      b += wh * 30 * m;
    }
    if (bl !== 0) {
      const m = Math.max(0, (60 - lum) / 60);
      r -= bl * 30 * m;
      g -= bl * 30 * m;
      b -= bl * 30 * m;
    }

    // saturation
    if (sat !== 1) {
      const lum2 = r * 0.2126 + g * 0.7152 + b * 0.0722;
      r = lum2 + (r - lum2) * sat;
      g = lum2 + (g - lum2) * sat;
      b = lum2 + (b - lum2) * sat;
    }

    // vibrance — boost less-saturated pixels more
    if (vib !== 0) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sNow = max === 0 ? 0 : (max - min) / max;
      const factor = 1 + vib * (1 - sNow);
      const lum3 = r * 0.2126 + g * 0.7152 + b * 0.0722;
      r = lum3 + (r - lum3) * factor;
      g = lum3 + (g - lum3) * factor;
      b = lum3 + (b - lum3) * factor;
    }

    // temp
    if (tempR !== 0) {
      r += tempR;
      b += tempB;
    }

    // grain — additive symmetric noise
    if (grainAmount > 0) {
      const n = (Math.random() - 0.5) * grainAmount;
      r += n;
      g += n;
      b += n;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }

  ctx.putImageData(img, 0, 0);

  // Vignette runs last so it tints the fully-graded result.
  if (Math.abs(v.vignette) > 1e-3) applyVignette(out, v.vignette);

  return out;
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

/** Sharpen / blur via a 5-tap cross kernel. Positive amount = unsharp
 *  mask, negative = box blur. Both blend with the source by `|amount|`. */
function applySharpen(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const sd = src.data;
  const dd = dst.data;
  const sharpen = amount > 0;
  const a = Math.min(1, Math.abs(amount));

  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const ic = (y * w + x) * 4;
      const it = (ym * w + x) * 4;
      const ib = (yp * w + x) * 4;
      const il = (y * w + xm) * 4;
      const ir = (y * w + xp) * 4;
      for (let c = 0; c < 3; c++) {
        const pc = sd[ic + c] ?? 0;
        const pt = sd[it + c] ?? 0;
        const pb = sd[ib + c] ?? 0;
        const pl = sd[il + c] ?? 0;
        const pr = sd[ir + c] ?? 0;
        const target = sharpen ? 5 * pc - pt - pb - pl - pr : (pc + pt + pb + pl + pr) / 5;
        dd[ic + c] = clamp255(pc + (target - pc) * a);
      }
      dd[ic + 3] = sd[ic + 3] ?? 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
}

/** Multiplicative radial darken / lighten centred on the canvas. Positive
 *  amount = classic darkened-edges vignette; negative = halo. */
function applyVignette(canvas: HTMLCanvasElement, amount: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dist = Math.hypot(dx, dy) / maxDist;
      const falloff = dist * dist;
      const factor = 1 - amount * falloff;
      const i = (y * w + x) * 4;
      d[i] = clamp255((d[i] ?? 0) * factor);
      d[i + 1] = clamp255((d[i + 1] ?? 0) * factor);
      d[i + 2] = clamp255((d[i + 2] ?? 0) * factor);
    }
  }
  ctx.putImageData(img, 0, 0);
}
