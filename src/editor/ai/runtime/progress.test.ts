// Progress aggregator — exercise the math the consent dialog's
// download bar reads. transformers.js fires per-file events so the
// aggregator merges them into a single monotonic ratio.

import { describe, expect, it } from "vitest";
import { createProgressAggregator } from "./progress";

describe("progress — aggregation across multiple files", () => {
  it("tracks bytes across files (not files-by-count)", () => {
    const agg = createProgressAggregator("Downloading…");
    // model.onnx is the bulk; config.json is tiny. The bar should
    // weight by bytes, not by file count: a 100 % config.json with a
    // not-yet-started model.onnx should read low, not 50 %.
    agg.push("model.onnx", 0, 1_000_000);
    agg.push("config.json", 200, 200);
    // snapshot() bypasses the report threshold so we see the true
    // aggregate without waiting for a 0.5 % byte tick.
    const snap = agg.snapshot();
    expect(snap.ratio).toBeLessThan(0.05);
    expect(snap.bytesTotal).toBe(1_000_200);
  });

  it("debounces sub-threshold updates (no postMessage spam at 60 Hz)", () => {
    const agg = createProgressAggregator("Downloading…");
    const first = agg.push("model.onnx", 100, 1_000_000);
    expect(first).not.toBeNull();
    // Advancing by 1000 bytes (0.1 %) — below the ~0.5 % threshold.
    const second = agg.push("model.onnx", 1100, 1_000_000);
    expect(second).toBeNull();
    // Advancing by 10000 bytes (1 %) — above threshold.
    const third = agg.push("model.onnx", 11_100, 1_000_000);
    expect(third).not.toBeNull();
  });

  it("ignores files reporting total<=0 (no divide-by-zero)", () => {
    const agg = createProgressAggregator("Downloading…");
    expect(agg.push("unknown.json", 50, 0)).toBeNull();
    expect(agg.push("unknown.json", 50, -1)).toBeNull();
  });

  it("caps ratio at 0.99 (the lib emits 'done' for 100 %, not progress)", () => {
    const agg = createProgressAggregator("Downloading…");
    const result = agg.push("model.onnx", 1_000_000, 1_000_000);
    expect(result?.ratio).toBeLessThanOrEqual(0.99);
  });

  it("snapshot returns the current aggregate without changing it", () => {
    const agg = createProgressAggregator("Downloading…");
    agg.push("model.onnx", 250_000, 1_000_000);
    const snap = agg.snapshot();
    expect(snap.ratio).toBeCloseTo(0.25, 1);
    expect(snap.label).toBe("Downloading…");
    expect(snap.phase).toBe("download");
  });
});
