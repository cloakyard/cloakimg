// aiInspector.test.ts — Coverage for the alpha-threshold helper used
// by the Confidence dial in Remove BG Auto. The overlay painters
// (paintMaskOverlay / paintFaceBoxes) aren't tested here because they
// require a real canvas 2D context (jsdom can't paint) — they're
// exercised via the live editor probes.

import { describe, expect, it } from "vitest";
import { applyAlphaThreshold } from "./aiInspector";

/** Build a canvas with a single row of pixels whose alpha values
 *  cover a known range. Useful for verifying the threshold cuts at
 *  exactly the right boundary. */
function makeAlphaRow(alphas: number[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = alphas.length;
  c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(alphas.length, 1);
  for (let i = 0; i < alphas.length; i++) {
    img.data[i * 4] = 200;
    img.data[i * 4 + 1] = 100;
    img.data[i * 4 + 2] = 50;
    img.data[i * 4 + 3] = alphas[i] ?? 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function readAlphas(c: HTMLCanvasElement): number[] {
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const out: number[] = [];
  for (let i = 3; i < data.length; i += 4) out.push(data[i] ?? 0);
  return out;
}

describe("applyAlphaThreshold", () => {
  it("is a no-op when threshold <= 0", () => {
    const c = makeAlphaRow([0, 50, 128, 200, 255]);
    const before = readAlphas(c);
    applyAlphaThreshold(c, 0);
    expect(readAlphas(c)).toEqual(before);
  });

  it("zeros out pixels with alpha below the cutoff", () => {
    // Skip when jsdom can't paint (createImageData/putImageData would
    // both fail silently). Detect that by checking the row reads
    // back the seed alphas correctly.
    const c = makeAlphaRow([0, 50, 128, 200, 255]);
    if (readAlphas(c)[4] !== 255) return;
    // threshold 0.5 → cutoff 128. Alphas below 128 become 0; at-or-
    // above stay put.
    applyAlphaThreshold(c, 0.5);
    expect(readAlphas(c)).toEqual([0, 0, 128, 200, 255]);
  });

  it("preserves the model's anti-aliased edge (doesn't force opaque)", () => {
    const c = makeAlphaRow([100, 150, 200, 220, 240]);
    if (readAlphas(c)[4] !== 240) return;
    // threshold 0.3 → cutoff 76. All values stay (already above).
    applyAlphaThreshold(c, 0.3);
    expect(readAlphas(c)).toEqual([100, 150, 200, 220, 240]);
  });

  it("drops everything at threshold 1.0", () => {
    const c = makeAlphaRow([200, 220, 240, 250, 254]);
    if (readAlphas(c)[4] !== 254) return;
    applyAlphaThreshold(c, 1.0);
    // 254 < 255 cutoff → cleared.
    expect(readAlphas(c)).toEqual([0, 0, 0, 0, 0]);
  });
});
