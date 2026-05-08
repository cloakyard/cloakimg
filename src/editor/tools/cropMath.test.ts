// Tests for cropMath — pure geometry helpers.
//
// Focused on the ASPECT_OPTIONS registry, which the panel's Segment
// renders verbatim and the smart-crop bbox-fit math reads. Adding /
// removing entries here propagates immediately to every consumer:
//   • CropTool's panel (option labels)
//   • CropTool's smart-crop aspect-fit branch (numeric ratio)
//   • the saved cropAspect index in toolState
// A regression here would either silently drop an aspect option from
// the UI, or leave saved sessions pointing at a stale slot.

import { describe, expect, it } from "vitest";
import { ASPECT_OPTIONS, clampRectToImage, translate } from "./cropMath";

describe("ASPECT_OPTIONS", () => {
  it("starts with the 'Free' (no-lock) option at index 0", () => {
    expect(ASPECT_OPTIONS[0]).toEqual({ label: "Free", ratio: null });
  });

  // Order matters — the panel renders these in registry order, and the
  // saved cropAspect is a numeric index into this array. Re-ordering or
  // removing an entry would silently re-map every saved session.
  it("preserves the established order: Free · 1:1 · 4:5 · 16:9 · 9:16", () => {
    const labels = ASPECT_OPTIONS.map((a) => a.label);
    expect(labels).toEqual(["Free", "1:1", "4:5", "16:9", "9:16"]);
  });

  it("9:16 is registered for vertical mobile / Story / Reel content", () => {
    const nineSixteen = ASPECT_OPTIONS.find((a) => a.label === "9:16");
    expect(nineSixteen).toBeDefined();
    expect(nineSixteen?.ratio).toBeCloseTo(9 / 16, 6);
  });

  it("9:16 is the inverse of 16:9 (within float precision)", () => {
    const wide = ASPECT_OPTIONS.find((a) => a.label === "16:9")?.ratio ?? 0;
    const tall = ASPECT_OPTIONS.find((a) => a.label === "9:16")?.ratio ?? 0;
    expect(wide * tall).toBeCloseTo(1, 6);
  });

  it("every locked entry has a positive numeric ratio (no NaN, no zero)", () => {
    for (const opt of ASPECT_OPTIONS) {
      if (opt.ratio === null) continue;
      expect(Number.isFinite(opt.ratio)).toBe(true);
      expect(opt.ratio).toBeGreaterThan(0);
    }
  });
});

describe("clampRectToImage", () => {
  it("leaves an in-bounds rect unchanged", () => {
    expect(clampRectToImage({ x: 10, y: 20, w: 100, h: 50 }, 200, 200)).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it("clamps width / height to the image size", () => {
    const r = clampRectToImage({ x: 0, y: 0, w: 9999, h: 9999 }, 200, 100);
    expect(r.w).toBe(200);
    expect(r.h).toBe(100);
  });

  it("enforces a minimum width / height of 8 px (handle hit-box safety)", () => {
    const r = clampRectToImage({ x: 0, y: 0, w: 0, h: 1 }, 200, 200);
    expect(r.w).toBeGreaterThanOrEqual(8);
    expect(r.h).toBeGreaterThanOrEqual(8);
  });

  it("snaps the origin so the rect sits inside the image when nudged off-edge", () => {
    const r = clampRectToImage({ x: 190, y: 90, w: 50, h: 50 }, 200, 100);
    expect(r.x + r.w).toBeLessThanOrEqual(200);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });
});

describe("translate", () => {
  it("offsets the rect by (dx, dy) and clamps to image bounds", () => {
    const r = translate({ x: 10, y: 10, w: 50, h: 50 }, 5, -7, 200, 200);
    expect(r).toEqual({ x: 15, y: 3, w: 50, h: 50 });
  });

  it("clamps when the translation would push the rect off-image", () => {
    const r = translate({ x: 150, y: 0, w: 60, h: 60 }, 100, 0, 200, 200);
    expect(r.x + r.w).toBeLessThanOrEqual(200);
  });
});
