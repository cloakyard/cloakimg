// Tests for relight — the depth-aware directional shading core. Canvas
// 2D isn't available under jsdom, so we exercise the pure `relightPixels`
// loop directly against plain RGBA + depth arrays.

import { describe, expect, it } from "vitest";
import { isRelightIdentity, type RelightParams, relightPixels } from "./relight";

const BASE: RelightParams = {
  sunX: 0.5,
  sunY: 0.5,
  elevation: 0.6,
  intensity: 0,
  warmth: 0.5,
};

/** Build a flat mid-gray RGBA buffer of (w*h) pixels. */
function grayField(w: number, h: number, v = 128): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  return px;
}

describe("isRelightIdentity", () => {
  it("is identity when intensity is 0", () => {
    expect(isRelightIdentity(BASE)).toBe(true);
  });
  it("is not identity once intensity rises", () => {
    expect(isRelightIdentity({ ...BASE, intensity: 0.4 })).toBe(false);
  });
});

describe("relightPixels — directional brightening", () => {
  // A flat depth field has no relief, so shading is driven purely by the
  // point light's distance falloff: pixels nearer the sun get brighter
  // than pixels far from it.
  it("brightens pixels near the sun more than pixels far from it", () => {
    const w = 9;
    const h = 1;
    const depth = new Float32Array(w * h).fill(0.5);
    const px = grayField(w, h);
    // Sun at the left edge.
    relightPixels(px, depth, w, h, { ...BASE, sunX: 0, sunY: 0.5, intensity: 1 });
    const left = px[0]!; // nearest the sun
    const right = px[(w - 1) * 4]!; // farthest
    expect(left).toBeGreaterThan(right);
  });

  it("leaves the buffer effectively unchanged at intensity 0 (guarded by isRelightIdentity)", () => {
    const w = 5;
    const h = 1;
    const depth = new Float32Array(w * h).fill(0.5);
    const px = grayField(w, h);
    const before = Array.from(px);
    // Callers gate on isRelightIdentity; relightPixels itself with k=0
    // multiplies by 1 and adds 0 warmth, so the buffer is untouched.
    relightPixels(px, depth, w, h, { ...BASE, intensity: 0 });
    expect(Array.from(px)).toEqual(before);
  });

  it("warmth pushes the lit side warm (more red than blue)", () => {
    const w = 5;
    const h = 1;
    const depth = new Float32Array(w * h).fill(0.5);
    const px = grayField(w, h);
    // Sun directly over pixel 0 (lit, m>1), strong warmth.
    relightPixels(px, depth, w, h, {
      ...BASE,
      sunX: 0,
      sunY: 0.5,
      intensity: 1,
      warmth: 1,
    });
    const r = px[0]!;
    const b = px[2]!;
    expect(r).toBeGreaterThan(b);
  });

  it("does not touch the alpha channel", () => {
    const w = 4;
    const h = 1;
    const depth = new Float32Array(w * h).fill(0.5);
    const px = grayField(w, h);
    relightPixels(px, depth, w, h, { ...BASE, intensity: 1 });
    for (let i = 3; i < px.length; i += 4) {
      expect(px[i]).toBe(255);
    }
  });
});
