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
  // Pre-scan the LUT for hues whose dh/ds/dl are all near-zero. Users
  // typically only push 1–2 bands at a time, leaving the other 6
  // contributing nothing. Pixels whose hue falls into a null band can
  // skip the hslToRgb round-trip entirely (the costly half of the
  // loop). nullHue[i] is true ⇒ the LUT is identity for hue `i`.
  const nullHue = new Uint8Array(360);
  for (let h = 0; h < 360; h++) {
    if (
      Math.abs(lut.dh[h] ?? 0) < 1e-4 &&
      Math.abs(lut.ds[h] ?? 0) < 1e-4 &&
      Math.abs(lut.dl[h] ?? 0) < 1e-4
    ) {
      nullHue[h] = 1;
    }
  }
  // Inlined rgbToHsl below to avoid the 3-element tuple allocation per
  // pixel — at 2 M pixels per preview that's 2 M short-lived arrays.
  const SAT_GATE_EPS = 1e-4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    // Fast-path 1: pure grey → no chroma, no possible shift.
    if (r === g && g === b) continue;
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = rn > gn ? (rn > bn ? rn : bn) : gn > bn ? gn : bn;
    const min = rn < gn ? (rn < bn ? rn : bn) : gn < bn ? gn : bn;
    const l = (max + min) * 0.5;
    const d = max - min;
    // d===0 caught by the grey fast-path above; still guard for
    // floating-point safety.
    if (d === 0) continue;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    // Fast-path 2: gate vanishes for near-zero saturation.
    const gate = s * 4 < 1 ? s * 4 : 1;
    if (gate < SAT_GATE_EPS) continue;
    let h: number;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    const idx = (((h | 0) % 360) + 360) % 360;
    // Fast-path 3: the LUT is identity for this pixel's hue.
    if (nullHue[idx]) continue;
    const dh = lut.dh[idx] ?? 0;
    const ds = lut.ds[idx] ?? 0;
    const dl = lut.dl[idx] ?? 0;
    let h2 = (h + dh * gate) % 360;
    if (h2 < 0) h2 += 360;
    const s2 = clamp01(s + ds * gate * (s < 0.15 ? 0.15 : s));
    const l2 = clamp01(l + dl * gate);
    // Inlined hslToRgb. s2===0 produces a pure grey, which is already
    // the input pixel's luminance — fall back to the grey writeback.
    if (s2 === 0) {
      const v = (l2 * 255 + 0.5) | 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      continue;
    }
    const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
    const pV = 2 * l2 - q;
    const hk = h2 / 360;
    const rOut = hueToChannel(pV, q, hk + 1 / 3);
    const gOut = hueToChannel(pV, q, hk);
    const bOut = hueToChannel(pV, q, hk - 1 / 3);
    data[i] = (rOut * 255 + 0.5) | 0;
    data[i + 1] = (gOut * 255 + 0.5) | 0;
    data[i + 2] = (bOut * 255 + 0.5) | 0;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One of HSL's standard six-segment hue→channel ramps. Kept as a
 *  standalone helper because the bake loop calls it three times per
 *  non-skipped pixel — pulling it out keeps the inner loop readable
 *  without changing the inlined call-site cost. */
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
