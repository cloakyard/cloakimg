// geometry.test.ts — Tests for the pure box-padding helper that the
// Faces smart action uses to enlarge each detection rect before
// stamping the redaction. Detector bboxes are tight to the visible
// face; this helper is what makes hairline / chin / ear pixels land
// inside the painted region.

import { describe, expect, it } from "vitest";
import { padFaceBox } from "./geometry";

const BOX = { x: 100, y: 100, width: 50, height: 50, score: 0.9 } as const;

describe("padFaceBox", () => {
  it("returns the original box untouched when padding is zero", () => {
    expect(padFaceBox(BOX, 0, 1000, 1000)).toEqual(BOX);
  });

  it("returns the original box untouched when padding is negative", () => {
    // Defensive: treat negatives as no-op rather than shrinking the box.
    // A caller that wants a smaller box should compute that explicitly.
    expect(padFaceBox(BOX, -0.1, 1000, 1000)).toEqual(BOX);
  });

  it("expands the box outward by the requested fraction on each side", () => {
    const padded = padFaceBox(BOX, 0.2, 1000, 1000);
    // 20% of 50 = 10 px on each side → x shrinks by 10, width grows by 20.
    expect(padded).toEqual({
      x: 90,
      y: 90,
      width: 70,
      height: 70,
      score: 0.9,
    });
  });

  it("clips the padded box at the left/top image edges", () => {
    const nearOrigin = { x: 5, y: 5, width: 50, height: 50, score: 0.5 };
    const padded = padFaceBox(nearOrigin, 0.5, 1000, 1000);
    // 50% of 50 = 25 px padding; x would be -20, clipped to 0.
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
    // Right edge padded normally: 5 + 50 + 25 = 80.
    expect(padded.x + padded.width).toBeCloseTo(80);
    expect(padded.y + padded.height).toBeCloseTo(80);
  });

  it("clips the padded box at the right/bottom image edges", () => {
    const nearCorner = { x: 950, y: 950, width: 50, height: 50, score: 0.5 };
    const padded = padFaceBox(nearCorner, 0.5, 1000, 1000);
    // Right edge: 950 + 50 + 25 = 1025 → clip to 1000. Width: 1000 - x.
    expect(padded.x + padded.width).toBe(1000);
    expect(padded.y + padded.height).toBe(1000);
    // Left edge padded normally: 950 - 25 = 925.
    expect(padded.x).toBe(925);
    expect(padded.y).toBe(925);
  });

  it("preserves the score field across padding", () => {
    const padded = padFaceBox(BOX, 0.3, 1000, 1000);
    expect(padded.score).toBe(BOX.score);
  });

  it("tolerates a face box that already exceeds image bounds (defensive)", () => {
    // Faces near the seam of a panorama or a stitched composite can
    // come back with bboxes that hang slightly off-frame. Padding then
    // clipping must still produce a non-degenerate rect.
    const overshooting = { x: -5, y: -5, width: 60, height: 60, score: 0.8 };
    const padded = padFaceBox(overshooting, 0.1, 100, 100);
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
    expect(padded.width).toBeGreaterThan(0);
    expect(padded.height).toBeGreaterThan(0);
    expect(padded.x + padded.width).toBeLessThanOrEqual(100);
    expect(padded.y + padded.height).toBeLessThanOrEqual(100);
  });
});
