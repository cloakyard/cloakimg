import { describe, expect, it } from "vitest";
import { backgroundFillForMode, backgroundFillLabel, backgroundPalette } from "./backgroundFill";

describe("Remove BG background fills", () => {
  it("maps persisted modes defensively", () => {
    expect([0, 1, 2, 3].map(backgroundFillForMode)).toEqual([
      "transparent",
      "solid",
      "gradient",
      "vignette",
    ]);
    expect(backgroundFillForMode(99)).toBe("transparent");
  });

  it("keeps solid output exact and derives both gradient tones from one colour", () => {
    expect(backgroundPalette("#336699", "solid")).toEqual({
      first: "#336699",
      second: "#336699",
    });
    expect(backgroundPalette("#336699", "gradient")).toEqual({
      first: "#a3bad1",
      second: "#2d5a87",
    });
    expect(backgroundPalette("#336699", "vignette")).toEqual({
      first: "#668cb3",
      second: "#203f5f",
    });
  });

  it("provides human-readable output labels", () => {
    expect(backgroundFillLabel("transparent")).toBe("Transparent");
    expect(backgroundFillLabel("vignette")).toBe("Vignette");
  });
});
