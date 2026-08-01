// history.test.ts — Sanity tests for the History class with focus on
// the new HistoryScrubber-facing surface (thumb generation,
// entriesSnapshot ordering, base-pinning). Doesn't exercise the async
// WebP compression path — that's flaky in jsdom (no real toBlob) and
// covered indirectly by the live editor probes.

import { describe, expect, it } from "vitest";
import { History } from "./history";

function makeCanvas(w: number, h: number, fill = "#abcdef"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

describe("History.entriesSnapshot", () => {
  it("returns entries in stack order, latest last", () => {
    const h = new History();
    h.push("Open", makeCanvas(10, 10), [], null);
    h.push("Crop", makeCanvas(8, 8), [], null);
    h.push("Adjust", makeCanvas(8, 8), [], null);
    const snap = h.entriesSnapshot();
    expect(snap.map((s) => s.label)).toEqual(["Open", "Crop", "Adjust"]);
  });

  it("snapshots width/height of each entry's working canvas", () => {
    const h = new History();
    h.push("Open", makeCanvas(100, 50), [], null);
    h.push("Crop", makeCanvas(60, 60), [], null);
    const snap = h.entriesSnapshot();
    expect(snap[0]).toMatchObject({ width: 100, height: 50 });
    expect(snap[1]).toMatchObject({ width: 60, height: 60 });
  });

  it("exposes a thumb slot on every entry — populated when the env can paint", () => {
    const h = new History();
    h.push("Open", makeCanvas(200, 100), [], null);
    const [base] = h.entriesSnapshot();
    // The field must exist; the value is allowed to be null in
    // environments where a 2D context can't be acquired (jsdom
    // without the `canvas` npm dep). Real browsers always populate
    // it; the scrubber renders a placeholder dot for the null case.
    expect(base).toHaveProperty("thumb");
    const thumb = base?.thumb ?? null;
    if (thumb) {
      // When a context IS available, the thumb should clamp to
      // ≤96 px on the long edge while preserving aspect (200×100 →
      // 96×48 at most).
      expect(thumb.width).toBeLessThanOrEqual(96);
      expect(thumb.width).toBeGreaterThan(0);
      expect(thumb.height).toBeLessThanOrEqual(96);
    }
  });

  it("returns an empty snapshot when the history is fresh", () => {
    const h = new History();
    expect(h.entriesSnapshot()).toEqual([]);
  });

  it("drops the redo branch on a new push (so snapshot matches cursor reality)", () => {
    const h = new History();
    h.push("Open", makeCanvas(10, 10), [], null);
    h.push("A", makeCanvas(10, 10), [], null);
    h.push("B", makeCanvas(10, 10), [], null);
    h.undo();
    h.undo();
    // Cursor now sits on "Open"; pushing "C" should drop A + B.
    h.push("C", makeCanvas(10, 10), [], null);
    expect(h.entriesSnapshot().map((s) => s.label)).toEqual(["Open", "C"]);
  });
});

describe("History cursor + base pinning", () => {
  it("restores the semantic background treatment with each entry", () => {
    const h = new History();
    h.push("Open", makeCanvas(10, 10), [], null, "original");
    h.push("Remove BG", makeCanvas(10, 10), [], null, "transparent");
    h.push("Add background", makeCanvas(10, 10), [], null, "gradient");

    expect(h.undo()?.backgroundTreatment).toBe("transparent");
    expect(h.undo()?.backgroundTreatment).toBe("original");
    expect(h.redo()?.backgroundTreatment).toBe("transparent");
    expect(h.redo()?.backgroundTreatment).toBe("gradient");
  });

  it("currentIndex tracks pushes and undo/redo", () => {
    const h = new History();
    h.push("Open", makeCanvas(10, 10), [], null);
    expect(h.currentIndex()).toBe(0);
    h.push("Crop", makeCanvas(10, 10), [], null);
    expect(h.currentIndex()).toBe(1);
    h.undo();
    expect(h.currentIndex()).toBe(0);
    h.redo();
    expect(h.currentIndex()).toBe(1);
  });

  it("pins the first-push entry as the compare-view base", () => {
    const h = new History();
    h.push("Open", makeCanvas(10, 10), [], null);
    const base = h.base();
    expect(base).toBeTruthy();
    expect(base?.label).toBe("Open");
    h.push("Crop", makeCanvas(10, 10), [], null);
    // Even after a second push the base reference stays the same.
    expect(h.base()).toBe(base);
  });
});
