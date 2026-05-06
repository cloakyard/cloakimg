// hsl.ts — Selective colour: per-band Hue / Saturation / Luminance
// shifts. Eight bands centred on Red, Orange, Yellow, Green, Cyan,
// Blue, Purple, Magenta — the same set Lightroom and Capture One use.
//
// Implementation: for every input hue 0..359, compute an effective
// (dh, ds, dl) by linearly blending the two surrounding band offsets.
// Per pixel: RGB→HSL, apply the LUT, HSL→RGB. The LUT keeps the inner
// loop branch-free; the conversions themselves are unavoidable.

import { acquireCanvas } from "../doc";

export const HSL_BAND_NAMES = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Cyan",
  "Blue",
  "Purple",
  "Magenta",
] as const;

/** Band centres in degrees. 360-wrap is handled when building the LUT
 *  by treating the array as cyclic — Magenta's 300° interpolates into
 *  Red's 360° (= 0°) for hues 300..360. */
export const HSL_BAND_CENTERS = [0, 30, 60, 120, 180, 210, 270, 300] as const;

export const HSL_BAND_COUNT = HSL_BAND_NAMES.length;

export interface HslParams {
  /** Per-band hue offset in 0..1; 0.5 = no shift. ±0.5 → ±60° shift. */
  hue: number[];
  /** Per-band saturation factor in 0..1; 0.5 = neutral. ±0.5 → ±100%. */
  sat: number[];
  /** Per-band luminance factor in 0..1; 0.5 = neutral. ±0.5 → ±50%. */
  lum: number[];
}

export function hslIdentity(): HslParams {
  return {
    hue: Array(HSL_BAND_COUNT).fill(0.5),
    sat: Array(HSL_BAND_COUNT).fill(0.5),
    lum: Array(HSL_BAND_COUNT).fill(0.5),
  };
}

export function isHslIdentity(p: HslParams): boolean {
  for (let i = 0; i < HSL_BAND_COUNT; i++) {
    if (Math.abs((p.hue[i] ?? 0.5) - 0.5) > 1e-3) return false;
    if (Math.abs((p.sat[i] ?? 0.5) - 0.5) > 1e-3) return false;
    if (Math.abs((p.lum[i] ?? 0.5) - 0.5) > 1e-3) return false;
  }
  return true;
}

/** Per-band signed values. hue is in degrees, sat/lum in -1..+1. */
function unpackBands(p: HslParams): { dh: Float32Array; ds: Float32Array; dl: Float32Array } {
  const dh = new Float32Array(HSL_BAND_COUNT);
  const ds = new Float32Array(HSL_BAND_COUNT);
  const dl = new Float32Array(HSL_BAND_COUNT);
  for (let i = 0; i < HSL_BAND_COUNT; i++) {
    dh[i] = ((p.hue[i] ?? 0.5) - 0.5) * 120; // ±60° on full slider
    ds[i] = ((p.sat[i] ?? 0.5) - 0.5) * 2; // ±1.0
    dl[i] = ((p.lum[i] ?? 0.5) - 0.5) * 1; // ±0.5 (luminance shifts feel strong; cap them)
  }
  return { dh, ds, dl };
}

/** Build a 360-entry LUT mapping integer input hue → (dh, ds, dl).
 *  Neighbouring band offsets are blended linearly across each
 *  segment, so a pixel sitting between Orange (30°) and Yellow (60°)
 *  receives a 50/50 mix of those two bands' settings. */
export function buildHslLUT(p: HslParams): {
  dh: Float32Array;
  ds: Float32Array;
  dl: Float32Array;
} {
  const out = {
    dh: new Float32Array(360),
    ds: new Float32Array(360),
    dl: new Float32Array(360),
  };
  const { dh, ds, dl } = unpackBands(p);
  const centers = HSL_BAND_CENTERS;
  // Treat the band array as cyclic: index N wraps to band 0 with its
  // centre shifted up by 360°.
  for (let h = 0; h < 360; h++) {
    // Find the segment [centers[i], centers[i+1]] containing h.
    let i = 0;
    for (; i < HSL_BAND_COUNT; i++) {
      const c = centers[i] ?? 0;
      const n = i + 1 < HSL_BAND_COUNT ? (centers[i + 1] ?? 0) : 360;
      if (h >= c && h < n) break;
    }
    const ci = i;
    const cnext = (i + 1) % HSL_BAND_COUNT;
    const cStart = centers[ci] ?? 0;
    const cEnd = ci + 1 < HSL_BAND_COUNT ? (centers[ci + 1] ?? 0) : 360;
    const span = cEnd - cStart;
    const t = span > 0 ? (h - cStart) / span : 0;
    out.dh[h] = (dh[ci] ?? 0) * (1 - t) + (dh[cnext] ?? 0) * t;
    out.ds[h] = (ds[ci] ?? 0) * (1 - t) + (ds[cnext] ?? 0) * t;
    out.dl[h] = (dl[ci] ?? 0) * (1 - t) + (dl[cnext] ?? 0) * t;
  }
  return out;
}

export function bakeHsl(src: HTMLCanvasElement, p: HslParams): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  if (isHslIdentity(p)) return out;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const lut = buildHslLUT(p);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const hsl = rgbToHsl(r, g, b);
    let h = hsl[0];
    let s = hsl[1];
    let l = hsl[2];
    // Saturation gates the effect: pixels with no chroma (pure greys)
    // are colour-agnostic; shifting their hue is meaningless and
    // pushing their saturation tints them on a single channel which
    // looks broken. Fade the shifts in as saturation rises.
    const gate = Math.min(1, s * 4);
    const idx = (((h | 0) % 360) + 360) % 360;
    h = (h + (lut.dh[idx] ?? 0) * gate) % 360;
    if (h < 0) h += 360;
    s = clamp01(s + (lut.ds[idx] ?? 0) * gate * Math.max(0.15, s));
    l = clamp01(l + (lut.dl[idx] ?? 0) * gate);
    const rgb = hslToRgb(h, s, l);
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** RGB 0..255 → [hue 0..360, sat 0..1, lum 0..1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const r = hueToChannel(p, q, hk + 1 / 3);
  const g = hueToChannel(p, q, hk);
  const b = hueToChannel(p, q, hk - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToChannel(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** A flat 6-stop CSS gradient stop list keyed off the canonical hue
 *  positions, so swatches and pickers in the panel always render the
 *  same colour wheel. Returned as a CSS gradient value. */
export function hslWheelGradient(): string {
  return "linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))";
}
