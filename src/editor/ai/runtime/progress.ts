// progress.ts — Aggregated download-progress accumulator.
//
// transformers.js emits one progress event per model file (`model.onnx`,
// `config.json`, `preprocessor_config.json`, …). The user shouldn't
// see "model.onnx 80 % / config.json 100 %" — they want one bar that
// reflects total bytes vs total bytes. This module owns that math.
//
// Used inside the worker (where the events fire) and again by the
// runtime if it ever needs to merge across multiple concurrent
// pipelines. Keeping it pure makes both sites trivial.

import type { AiProgress } from "./types";

interface FileState {
  current: number;
  total: number;
}

export interface ProgressAggregator {
  /** Feed one per-file progress sample. Returns the next aggregated
   *  AiProgress to broadcast, or `null` when the change is below the
   *  reporting threshold (avoids spamming postMessage with sub-percent
   *  ticks on a fast connection). */
  push(file: string, current: number, total: number): AiProgress | null;
  /** Snapshot the current aggregate without feeding new data. Useful
   *  when the worker wants to flip phases (download → inference) and
   *  needs the final download tick. */
  snapshot(): AiProgress;
}

const REPORT_THRESHOLD = 0.005; // ~0.5 % steps; cheap and smooth.

/**
 * @param label   Human-readable phase label for the broadcast events.
 * @param expectedTotal  Best pre-flight estimate of the *total* bytes for
 *   the whole model download (the big weights file dominates). Anchors
 *   the denominator so the bar tracks the real download instead of
 *   spiking. transformers.js loads the tiny config files FIRST and only
 *   discovers the big weights file afterwards — summing just the bytes
 *   seen so far makes a 1 KB config.json that finishes first read as
 *   ~100 %, then the weights file appears, the denominator balloons, and
 *   the bar snaps back toward 0 %. Dividing by the known total keeps the
 *   early config bytes negligible. Pass 0 (default) when no estimate is
 *   available — the aggregator then falls back to the discovered sum.
 */
export function createProgressAggregator(label: string, expectedTotal = 0): ProgressAggregator {
  const files = new Map<string, FileState>();
  let lastReportedRatio = -1;
  // Highest ratio reported so far. A download only moves forward, so we
  // clamp against this — incremental file discovery (or an under-
  // estimated expectedTotal) must never rewind the bar.
  let peakRatio = 0;

  const aggregate = (): { ratio: number; cur: number; tot: number } => {
    let cur = 0;
    let sum = 0;
    for (const v of files.values()) {
      cur += v.current;
      sum += v.total;
    }
    // Once the real totals exceed the estimate (or no estimate was
    // given) the discovered sum wins; early on the estimate keeps tiny
    // config files from dominating.
    const tot = Math.max(sum, expectedTotal);
    const raw = tot > 0 ? cur / tot : 0;
    // Monotonic + capped below 1 (the lib signals 100 % with a separate
    // "done" event, not a final "progress" tick).
    const ratio = Math.min(0.99, Math.max(raw, peakRatio));
    peakRatio = ratio;
    return { ratio, cur, tot };
  };

  return {
    push(file, current, total) {
      if (total <= 0) return null;
      files.set(file, { current, total });
      const { ratio, cur, tot } = aggregate();
      if (Math.abs(ratio - lastReportedRatio) <= REPORT_THRESHOLD) return null;
      lastReportedRatio = ratio;
      return {
        phase: "download",
        ratio,
        label,
        bytesDownloaded: cur,
        bytesTotal: tot,
      };
    },
    snapshot() {
      const { ratio, cur, tot } = aggregate();
      return {
        phase: "download",
        ratio,
        label,
        bytesDownloaded: cur,
        bytesTotal: tot,
      };
    },
  };
}
