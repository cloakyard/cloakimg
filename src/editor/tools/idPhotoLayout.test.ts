import { describe, expect, it } from "vitest";
import { DEFAULT_TOOL_STATE } from "../toolState";
import {
  buildSinglePagePdf,
  calculateSheetLayout,
  cropPosition,
  findPaperPreset,
  largestCenteredCrop,
  moveCrop,
  zoomCrop,
} from "./idPhotoLayout";

describe("ID photo sheet layout", () => {
  it("starts with cut guide lines enabled", () => {
    expect(DEFAULT_TOOL_STATE.idPhotoCutLines).toBe(true);
  });

  it("fills borderless 4 × 6 paper with six exact US 2 × 2 photos", () => {
    const layout = calculateSheetLayout(
      { widthMm: 50.8, heightMm: 50.8 },
      findPaperPreset("photo-4x6"),
    );
    expect(layout.rotated).toBe(false);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(3);
    expect(layout.copies).toBe(6);
    const last = layout.slots.at(-1);
    expect(last?.xMm).toBeCloseTo(50.8);
    expect(last?.yMm).toBeCloseTo(101.6);
    expect(last?.widthMm).toBeCloseTo(50.8);
    expect(last?.heightMm).toBeCloseTo(50.8);
  });

  it("rotates 35 × 45 photos when that places more copies", () => {
    const layout = calculateSheetLayout(
      { widthMm: 35, heightMm: 45 },
      findPaperPreset("photo-4x6"),
    );
    expect(layout.rotated).toBe(true);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(4);
    expect(layout.copies).toBe(8);
  });

  it("centres, zooms, and moves a fixed-aspect crop inside the image", () => {
    const initial = largestCenteredCrop(1200, 800, 1);
    expect(initial).toEqual({ x: 200, y: 0, w: 800, h: 800 });

    const zoomed = zoomCrop(initial, 1200, 800, 1, 0.75);
    expect(zoomed.w).toBeCloseTo(400);
    expect(zoomed.h).toBeCloseTo(400);

    const moved = moveCrop(zoomed, 1200, 800, 1, 1);
    expect(moved.x).toBeCloseTo(800);
    expect(moved.y).toBeCloseTo(400);
    expect(cropPosition(moved, 1200, 800)).toEqual({ x: 1, y: 1 });
  });

  it("writes an exact-size one-page PDF wrapper around JPEG bytes", () => {
    const pdf = buildSinglePagePdf(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      1200,
      1800,
      101.6,
      152.4,
    );
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 288.0000 432.0000]");
    expect(text).toContain("/Width 1200 /Height 1800");
    expect(text).toContain("xref");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });
});
