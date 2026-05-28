// Tests for relight — the depth-aware directional shading core. Canvas
// 2D isn't available under jsdom, so we exercise the pure `relightPixels`
// loop directly against plain RGBA + depth arrays.

import { describe, expect, it } from "vitest";
import { isRelightIdentity, type RelightParams, relightPixels, shadeFromDepth } from "./relight";

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

describe("shadeFromDepth — fused full-res path matches the two-pass path", () => {
  // The full-resolution Apply bakes via shadeFromDepth (normals fused into
  // the shade loop to avoid ~200 MB of intermediate arrays). It MUST be
  // byte-identical to relightPixels (computeNormals + shade), or Apply
  // would look different from the live preview.
  it("is byte-identical to relightPixels on a varied depth field", () => {
    const w = 17;
    const h = 13;
    const depth = new Float32Array(w * h);
    for (let i = 0; i < depth.length; i++) {
      // A non-flat, non-trivial height-field so the normal gradient is
      // exercised in every direction (not just the falloff term).
      depth[i] = (Math.sin(i * 0.7) * 0.5 + 0.5) * (((i * 31) % 97) / 97);
    }
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = (i * 13) % 256;
      px[i + 1] = (i * 7) % 256;
      px[i + 2] = (i * 29) % 256;
      px[i + 3] = 255;
    }
    const params: RelightParams = {
      sunX: 0.3,
      sunY: 0.7,
      elevation: 0.4,
      intensity: 0.8,
      warmth: 0.75,
    };
    const a = px.slice();
    const b = px.slice();
    relightPixels(a, depth, w, h, params);
    shadeFromDepth(b, depth, w, h, params);
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});
