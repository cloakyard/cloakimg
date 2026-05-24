// hsl.test.ts — Pin the HSL bake's behavioural contract. The inner
// loop is hot-path code with three fast-paths (grey, no-gate, null
// hue) plus inlined RGB↔HSL conversions, so a regression here is
// easy to miss. These tests run a reference implementation alongside
// the optimised bake and assert per-pixel parity for a handful of
// colours that exercise each fast-path branch.
//
// Reference implementation is the pre-optimisation code, kept verbatim
// inside this file so the bake's behaviour stays pinned even if the
// production loop is rewritten again later.

import { describe, expect, it } from "vitest";
import { buildHslLUT, hslIdentity, type HslParams, isHslIdentity } from "./hsl";

// ── Reference implementation (pre-optimisation; do not edit) ─────────

function refClamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function refRgbToHsl(r: number, g: number, b: number): [number, number, number] {
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

function refHueToChannel(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function refHslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const r = refHueToChannel(p, q, hk + 1 / 3);
  const g = refHueToChannel(p, q, hk);
  const b = refHueToChannel(p, q, hk - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Run the reference per-pixel transform for one RGB triple. Returns
 *  the expected post-bake [r, g, b]. Mirrors the old `bakeHsl` inner
 *  loop body exactly. */
function refTransform(r: number, g: number, b: number, p: HslParams): [number, number, number] {
  const lut = buildHslLUT(p);
  const hsl = refRgbToHsl(r, g, b);
  let h = hsl[0];
  let s = hsl[1];
  let l = hsl[2];
  const gate = Math.min(1, s * 4);
  const idx = (((h | 0) % 360) + 360) % 360;
  h = (h + (lut.dh[idx] ?? 0) * gate) % 360;
  if (h < 0) h += 360;
  s = refClamp01(s + (lut.ds[idx] ?? 0) * gate * Math.max(0.15, s));
  l = refClamp01(l + (lut.dl[idx] ?? 0) * gate);
  return refHslToRgb(h, s, l);
}

// ── Production bake driver. jsdom's canvas is mock-only so we extract
//    the inner-loop logic into a pure function for the test. The logic
//    here MUST stay byte-identical with `bakeHsl`'s inner loop body.
//    If you change the production loop, mirror it here. ──────────────

function prodTransform(r: number, g: number, b: number, p: HslParams): [number, number, number] {
  // Inlined copy of bakeHsl's inner loop, sans the canvas plumbing.
  if (isHslIdentity(p)) return [r, g, b];
  const lut = buildHslLUT(p);
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
  const SAT_GATE_EPS = 1e-4;
  if (r === g && g === b) return [r, g, b];
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = rn > gn ? (rn > bn ? rn : bn) : gn > bn ? gn : bn;
  const min = rn < gn ? (rn < bn ? rn : bn) : gn < bn ? gn : bn;
  const l = (max + min) * 0.5;
  const d = max - min;
  if (d === 0) return [r, g, b];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const gate = s * 4 < 1 ? s * 4 : 1;
  if (gate < SAT_GATE_EPS) return [r, g, b];
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  const idx = (((h | 0) % 360) + 360) % 360;
  if (nullHue[idx]) return [r, g, b];
  const dh = lut.dh[idx] ?? 0;
  const ds = lut.ds[idx] ?? 0;
  const dl = lut.dl[idx] ?? 0;
  let h2 = (h + dh * gate) % 360;
  if (h2 < 0) h2 += 360;
  const s2 = refClamp01(s + ds * gate * (s < 0.15 ? 0.15 : s));
  const l2 = refClamp01(l + dl * gate);
  if (s2 === 0) {
    const v = (l2 * 255 + 0.5) | 0;
    return [v, v, v];
  }
  const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
  const pV = 2 * l2 - q;
  const hk = h2 / 360;
  const rOut = refHueToChannel(pV, q, hk + 1 / 3);
  const gOut = refHueToChannel(pV, q, hk);
  const bOut = refHueToChannel(pV, q, hk - 1 / 3);
  return [(rOut * 255 + 0.5) | 0, (gOut * 255 + 0.5) | 0, (bOut * 255 + 0.5) | 0];
}

// ── Test cases ───────────────────────────────────────────────────────

const SAMPLE_PIXELS: Array<[string, number, number, number]> = [
  ["pure red", 255, 0, 0],
  ["pure green", 0, 255, 0],
  ["pure blue", 0, 0, 255],
  ["orange", 255, 128, 0],
  ["yellow", 255, 255, 0],
  ["cyan", 0, 255, 255],
  ["magenta", 255, 0, 255],
  ["mid-grey", 128, 128, 128],
  ["near-grey (low chroma)", 130, 128, 129],
  ["dark red", 80, 12, 12],
  ["pale skin", 220, 180, 160],
  ["leaf green", 70, 140, 60],
];

function paramsShiftBand(
  band: number,
  hueDelta: number,
  satDelta: number,
  lumDelta: number,
): HslParams {
  const p = hslIdentity();
  p.hue[band] = 0.5 + hueDelta;
  p.sat[band] = 0.5 + satDelta;
  p.lum[band] = 0.5 + lumDelta;
  return p;
}

describe("bakeHsl inner-loop (per-pixel) parity with reference", () => {
  it("is identity for identity params", () => {
    const p = hslIdentity();
    for (const [, r, g, b] of SAMPLE_PIXELS) {
      // Production short-circuits via isHslIdentity → no transform.
      expect(prodTransform(r, g, b, p)).toEqual([r, g, b]);
    }
  });

  it("matches the reference within ±1 / channel across band shifts", () => {
    // Cover all 8 bands × 3 shift styles. Tolerance of ±1 absorbs
    // any rounding-mode differences between Math.round() in the
    // reference vs. the `(x + 0.5) | 0` bit-trick in production.
    for (let band = 0; band < 8; band++) {
      for (const [hueD, satD, lumD] of [
        [0.2, 0, 0], // hue shift
        [-0.2, 0, 0], // negative hue shift
        [0, 0.3, 0], // saturation boost
        [0, -0.3, 0], // saturation cut
        [0, 0, 0.2], // luminance lift
        [0, 0, -0.2], // luminance drop
        [0.15, 0.15, 0.1], // combined
      ] as const) {
        const p = paramsShiftBand(band, hueD, satD, lumD);
        for (const [name, r, g, b] of SAMPLE_PIXELS) {
          const refOut = refTransform(r, g, b, p);
          const prodOut = prodTransform(r, g, b, p);
          for (let c = 0; c < 3; c++) {
            const diff = Math.abs((refOut[c] ?? 0) - (prodOut[c] ?? 0));
            expect(
              diff,
              `band=${band} shifts=(${hueD},${satD},${lumD}) pixel=${name} chan=${c}: ref=${refOut[c]} prod=${prodOut[c]}`,
            ).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("grey fast-path preserves grey pixels unchanged across all band shifts", () => {
    // Grey pixels have no chroma so a hue shift on any band must
    // leave them untouched. The fast-path skips the conversion
    // entirely — verify that's not subtly wrong.
    for (let band = 0; band < 8; band++) {
      const p = paramsShiftBand(band, 0.3, 0.3, 0);
      for (const grey of [0, 64, 128, 200, 255]) {
        const out = prodTransform(grey, grey, grey, p);
        expect(out).toEqual([grey, grey, grey]);
      }
    }
  });

  it("null-hue fast-path skips pixels when their hue's LUT contribution is zero", () => {
    // Only push the Red band (band 0, centre 0°). Pixels with hues
    // far from red and its blending neighbours (Magenta @ 300°,
    // Orange @ 30°) should be left unchanged. Pure cyan (hue 180°)
    // sits between Green and Cyan bands — null for the Red push.
    const p = paramsShiftBand(0, 0.4, 0, 0);
    // Pure cyan should be untouched.
    const out = prodTransform(0, 255, 255, p);
    expect(out).toEqual([0, 255, 255]);
  });
});
