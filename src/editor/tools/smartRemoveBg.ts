// smartRemoveBg.ts — ML-based background removal via U²-Net (IS-Net)
// running entirely in the browser. No network calls per image — the
// model + ONNX runtime download once on first use and live in the
// service-worker cache thereafter, so subsequent removes are
// instantaneous offline.
//
// Privacy properties this preserves:
//   • The image bytes never leave the device. We pass an HTMLCanvasElement
//     to imglyRemoveBackground and get an alpha-keyed Blob back.
//   • The model file (44–88 MB depending on quality) is fetched from
//     staticimgly.com on first run only; from then on it's cached.
//
// The package is dynamically imported so the cold editor bundle stays
// at its current size — the ~1 MB JS surface and the ONNX runtime only
// load when the user actually opens the Auto tab.

import { acquireCanvas } from "../doc";

/** Quality / size trade-off. The package internally maps these to:
 *    small  → isnet_quint8  (~44 MB, int8 quantised)
 *    medium → isnet_fp16    (~88 MB, fp16)
 *    large  → isnet         (~176 MB, fp32) */
export type BgQuality = "small" | "medium" | "large";

export interface SmartRemoveProgress {
  /** "download" while the model + WASM stream in (percentage of bytes
   *  fetched), "inference" while the network actually runs (chunked
   *  pre / post processing). */
  phase: "download" | "inference" | "decode";
  /** 0..1, monotonic within a phase. Combined progress for the user
   *  is computed by the caller (we weight download 0..0.85, inference
   *  0.85..1 since download dominates the very first run and is
   *  basically free on every subsequent run). */
  ratio: number;
  /** A human-readable label the panel can show ("Loading model…",
   *  "Removing background…"). */
  label: string;
  /** Bytes downloaded so far (download phase only). Lets the panel
   *  show "23 MB / 44 MB" instead of just a percentage — useful on
   *  the first run where the download dominates the wait time. */
  bytesDownloaded?: number;
  /** Total bytes expected for the model + runtime. */
  bytesTotal?: number;
}

interface RemoveOptions {
  quality?: BgQuality;
  onProgress?: (p: SmartRemoveProgress) => void;
  /** AbortSignal isn't supported by the underlying lib, so we fake it
   *  by checking the signal at chunk boundaries we control. The lib
   *  itself can't be cancelled mid-inference, but the async wrapper
   *  can refuse to write back to doc.working if the caller aborted
   *  while we were waiting. */
  signal?: AbortSignal;
}

// Lazy module promise. After the first call we hold the resolved
// module so subsequent calls don't pay the dynamic-import cost again.
// We deliberately cache the *module* and not a curried function — the
// progress callback varies per call (each panel mount creates a new
// setProgress closure) and burying the first call's callback in a
// closure would route every subsequent removal's progress back to a
// dead component.
let modulePromise: Promise<typeof import("@imgly/background-removal")> | null = null;

function loadModule() {
  if (!modulePromise) {
    // Dynamic import keeps this 1 MB+ dependency out of the cold bundle.
    modulePromise = import("@imgly/background-removal");
  }
  return modulePromise;
}

/** Run a U²-Net background removal on `src`. Returns a fresh canvas
 *  (acquired from the canvas pool — caller is responsible for
 *  releasing it once the alpha-keyed pixels have been copied into
 *  doc.working). The source canvas is left untouched.
 *
 *  Errors are surfaced through the rejected promise — the caller is
 *  expected to catch and surface them inline (the panel does this
 *  next to its Apply button, same as the chroma keyer's existing
 *  error path). */
export async function smartRemoveBackground(
  src: HTMLCanvasElement,
  opts: RemoveOptions = {},
): Promise<HTMLCanvasElement> {
  const { quality = "small", onProgress, signal } = opts;
  // 1. Encode the source as a PNG Blob so the lib can ingest it. The
  //    lib accepts ImageData and HTMLImageElement too, but Blob is
  //    cheapest because the lib's worker decodes it via createImageBitmap
  //    — that path skips a round-trip through main-thread getImageData.
  const srcBlob = await canvasToPngBlob(src);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  onProgress?.({ phase: "download", ratio: 0, label: "Preparing model…" });

  // 2. Track download progress across multiple resource files. The
  //    lib reports per-resource bytes, so we accumulate into a single
  //    "download progress" number for the user. Inference itself
  //    isn't progress-reportable from the lib — we flip to a
  //    deterministic "Detecting subject…" label once download
  //    finishes and a chunk-based ratio that bumps to 1 on completion.
  //    The label is intentionally generic: this same code path runs
  //    when *any* tool (Adjust scoped to Subject, Portrait blur, Smart
  //    Crop, etc.) needs the subject mask, not just Remove BG.
  const downloadState = new Map<string, { current: number; total: number }>();
  let lastReportedRatio = -1;
  const reportDownload = (key: string, current: number, total: number) => {
    if (total <= 0) return;
    downloadState.set(key, { current, total });
    let cur = 0;
    let tot = 0;
    for (const v of downloadState.values()) {
      cur += v.current;
      tot += v.total;
    }
    const ratio = tot > 0 ? cur / tot : 0;
    // Cap at 0.99 — the final transition to 1.0 happens when we
    // actually start inference, so the bar doesn't park at 100 %
    // for several seconds.
    const capped = Math.min(0.99, ratio);
    if (Math.abs(capped - lastReportedRatio) > 0.005) {
      lastReportedRatio = capped;
      onProgress?.({
        phase: "download",
        ratio: capped,
        label: "Downloading model…",
        bytesDownloaded: cur,
        bytesTotal: tot,
      });
    }
  };

  const mod = await loadModule();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  onProgress?.({ phase: "inference", ratio: 0, label: "Detecting subject…" });

  // 3. Run inference. proxyToWorker keeps it off the main thread so
  //    the editor stays interactive even on a slow phone. The progress
  //    callback is passed per-call (not baked into a cached function)
  //    so each invocation reports to the panel that triggered it,
  //    even after the user has closed and re-opened Remove BG.
  // Translate our friendly quality name into the package's internal
  // model id. The package accepts "small"/"medium"/"large" via its
  // own preprocess mapper, but typing it as the resolved enum keeps
  // strict TS happy without an `as any`.
  const modelId = qualityToModelId(quality);
  const result = await mod.removeBackground(srcBlob, {
    model: modelId,
    proxyToWorker: true,
    output: { format: "image/png", quality: 0.9 },
    progress: reportDownload,
    debug: false,
  });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  onProgress?.({ phase: "decode", ratio: 0.9, label: "Finalising…" });

  // 4. Decode the PNG back into a canvas the editor can copyInto.
  //    createImageBitmap is fast and off-thread; we then paint into a
  //    pooled canvas so the editor's render path doesn't see a fresh
  //    allocation per call.
  const bitmap = await createImageBitmap(result);
  if (signal?.aborted) {
    bitmap.close();
    throw new DOMException("Aborted", "AbortError");
  }
  const out = acquireCanvas(bitmap.width, bitmap.height);
  const ctx = out.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not acquire canvas context");
  }
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  onProgress?.({ phase: "decode", ratio: 1, label: "Done" });
  return out;
}

/** Best-effort byte size lookup for a quality tier. The package
 *  resolves to a CDN that supports HEAD; we only use the value to
 *  brief the user before they consent to the download, so a missing
 *  network is not a hard failure — fall back to the static estimates
 *  in the public hint table. */
export const QUALITY_BYTE_ESTIMATES: Record<BgQuality, number> = {
  small: 44 * 1024 * 1024,
  medium: 88 * 1024 * 1024,
  large: 176 * 1024 * 1024,
};

/** Check whether the user has already downloaded a given model tier in
 *  a previous session. We probe the browser's CacheStorage for the
 *  package's static asset URL — `@imgly/background-removal` serves its
 *  weight files from `staticimgly.com` and the package's own cache
 *  layer registers them under `imgly-background-removal-data` (or, on
 *  a lib upgrade, a versioned variant). This is a "did the bytes
 *  survive the last session?" check, distinct from `state.warm` which
 *  only tracks "did detection complete during this tab's lifetime?".
 *
 *  Returns true when at least one cache entry references the model id.
 *  Errors and unsupported environments resolve to false — we'd rather
 *  prompt the user than silently skip a real download.
 */
export async function isModelCached(quality: BgQuality): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const modelId = qualityToModelId(quality);
    const keys = await caches.keys();
    for (const key of keys) {
      // Filter to imgly-related caches so we don't iterate every
      // service-worker bucket on the origin.
      if (!key.toLowerCase().includes("imgly")) continue;
      const c = await caches.open(key);
      const entries = await c.keys();
      for (const req of entries) {
        if (req.url.includes(modelId)) return true;
      }
    }
  } catch {
    // CacheStorage is gated behind secure context; on http://localhost
    // it works, on file:// it doesn't. Either way, no info means no
    // info — return false and the dialog will offer the download.
  }
  return false;
}

/** Friendly quality enum → the model id the lib actually wires up.
 *  The literal-union return type keeps strict TS happy when this is
 *  passed straight into `removeBackground({ model: ... })`. */
function qualityToModelId(quality: BgQuality): "isnet" | "isnet_fp16" | "isnet_quint8" {
  return quality === "large" ? "isnet" : quality === "medium" ? "isnet_fp16" : "isnet_quint8";
}

function canvasToPngBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Browser refused to encode the source canvas as PNG"));
      },
      "image/png",
      1.0,
    );
  });
}
