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

export function createProgressAggregator(label: string): ProgressAggregator {
  const files = new Map<string, FileState>();
  let lastReportedRatio = -1;

  const aggregate = (): { ratio: number; cur: number; tot: number } => {
    let cur = 0;
    let tot = 0;
    for (const v of files.values()) {
      cur += v.current;
      tot += v.total;
    }
    const ratio = tot > 0 ? Math.min(0.99, cur / tot) : 0;
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
