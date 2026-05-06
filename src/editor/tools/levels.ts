// levels.ts — Classic Photoshop-style Levels: input black/white/gamma
// remap a 0..255 channel into a normalised 0..1, gamma-curve it, then
// re-stretch to the [outBlack, outWhite] output range. Built as a
// 256-entry LUT so the per-pixel pass is a single byte lookup per
// channel — no hot-path math.

import { acquireCanvas } from "../doc";

export interface LevelsParams {
  /** Input black point in 0..255. Pixels darker than this clip to outBlack. */
  blackIn: number;
  /** Input white point in 0..255. Pixels brighter than this clip to outWhite. */
  whiteIn: number;
  /** Midtone gamma; 1.0 is linear, <1 lifts midtones, >1 darkens them.
   *  Photoshop's slider runs 0.1..9.99 — we expose 0.1..3.0 since
   *  beyond that the result reads as broken. */
  gamma: number;
  /** Output black point in 0..255. */
  blackOut: number;
  /** Output white point in 0..255. */
  whiteOut: number;
}

export const LEVELS_DEFAULT: LevelsParams = {
  blackIn: 0,
  whiteIn: 255,
  gamma: 1,
  blackOut: 0,
  whiteOut: 255,
};

export function isLevelsIdentity(p: LevelsParams): boolean {
  return (
    p.blackIn === 0 &&
    p.whiteIn === 255 &&
    Math.abs(p.gamma - 1) < 1e-3 &&
    p.blackOut === 0 &&
    p.whiteOut === 255
  );
}

/** 256-entry LUT for a Levels pass. Out-of-range inputs clip to the
 *  output bounds so the curve never wraps. */
export function buildLevelsLUT(p: LevelsParams): Uint8Array {
  const lut = new Uint8Array(256);
  const black = Math.max(0, Math.min(254, p.blackIn));
  const white = Math.max(black + 1, Math.min(255, p.whiteIn));
  const range = white - black;
  const oBlack = Math.max(0, Math.min(255, p.blackOut));
  const oWhite = Math.max(0, Math.min(255, p.whiteOut));
  const oRange = oWhite - oBlack;
  // Photoshop convention: the slider's "midtone" value is 1/gamma in
  // pow() space, so 1.0 stays neutral. Clamp away from 0 so we never
  // divide by it.
  const g = 1 / Math.max(0.01, p.gamma);
  for (let x = 0; x < 256; x++) {
    let n = (x - black) / range;
    if (n < 0) n = 0;
    else if (n > 1) n = 1;
    n = n ** g;
    const out = oBlack + n * oRange;
    lut[x] = out < 0 ? 0 : out > 255 ? 255 : Math.round(out);
  }
  return lut;
}

/** Apply a Levels pass to `src`, returning a fresh pooled canvas. The
 *  source is left untouched. */
export function bakeLevels(src: HTMLCanvasElement, p: LevelsParams): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  if (isLevelsIdentity(p)) return out;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const lut = buildLevelsLUT(p);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i] ?? 0] ?? 0;
    data[i + 1] = lut[data[i + 1] ?? 0] ?? 0;
    data[i + 2] = lut[data[i + 2] ?? 0] ?? 0;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
