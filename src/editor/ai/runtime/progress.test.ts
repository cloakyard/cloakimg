// Progress aggregator — exercise the math the consent modal's
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

  // Real-world transformers.js order: the tiny config files download and
  // finish BEFORE the big weights file is even discovered. Without an
  // expected total, the bar spiked to ~100 % on the configs then snapped
  // back when the weights file ballooned the denominator.
  it("with an expected total, a config finishing first doesn't spike the bar", () => {
    const expected = 42 * 1024 * 1024; // 42 MB weights file
    const agg = createProgressAggregator("Downloading…", expected);
    // config.json downloads fully first — must stay near 0, not ~100 %.
    agg.push("config.json", 1_000, 1_000);
    expect(agg.snapshot().ratio).toBeLessThan(0.01);
    // The weights file is discovered and starts — still near 0.
    agg.push("model.onnx", 0, expected);
    expect(agg.snapshot().ratio).toBeLessThan(0.01);
    // Halfway through the weights download the bar reads ~50 %.
    agg.push("model.onnx", expected / 2, expected);
    expect(agg.snapshot().ratio).toBeGreaterThan(0.45);
    expect(agg.snapshot().ratio).toBeLessThan(0.55);
    // The total bytes reported reflect the expected size, so the
    // "X / Y MB" readout is right from the first tick.
    expect(agg.snapshot().bytesTotal).toBeGreaterThanOrEqual(expected);
  });

  it("never reports a ratio that moves backward (monotonic)", () => {
    const agg = createProgressAggregator("Downloading…");
    agg.push("a.onnx", 900, 1_000); // ~0.9
    const high = agg.snapshot().ratio;
    expect(high).toBeCloseTo(0.9, 1);
    // A second, larger file appears — a naive byte-sum would drop the
    // ratio sharply; the aggregator must hold the bar.
    agg.push("b.onnx", 0, 9_000);
    expect(agg.snapshot().ratio).toBeGreaterThanOrEqual(high);
  });
});
