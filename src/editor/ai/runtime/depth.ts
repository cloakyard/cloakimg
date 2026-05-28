// depth.ts — Monocular depth-estimation facade. Mirrors segment.ts: cap
// the source to the model's inference long-edge and hand a transferable
// bitmap to the worker.
//
// The result is a grayscale depth map (near = bright) at the model's
// inference resolution (≤518 px long edge), NOT upscaled to source dims.
// Depth is smooth, so resizing it to whatever a consumer needs — relight's
// `readDepth` scales it to the ~1440 px preview downsample on each drag,
// and to full res once at apply — is visually indistinguishable from
// running the model at full resolution, while keeping the cached buffer
// tiny instead of leaving a 24 MP grayscale canvas resident per source.

import { acquireCanvas } from "../../doc";
import { aiLog } from "../log";
import { isHfModelCached } from "./cache";
import { preferredAiDevice } from "./device";
import { ACTIVE_DEPTH_FAMILY, type DepthModelTier, getDepthInferenceLongEdge } from "./depthModels";
import { runAi } from "./runtime";
import type { AiProgress } from "./types";

interface DepthOptions {
  tier: DepthModelTier;
  onProgress?: (p: AiProgress) => void;
  /** Cancellation — terminates the AI worker (no graceful ONNX
   *  interrupt exists). The next call respawns; cached weights stay. */
  signal?: AbortSignal;
}

/** Estimate a depth map for `src`. Returns a fresh pooled canvas (caller
 *  releases it once consumed) holding a grayscale depth map at source
 *  dimensions. The source canvas is left untouched. Rejects with
 *  AiAbortError on cancel. */
export async function estimateDepth(
  src: HTMLCanvasElement,
  opts: DepthOptions,
): Promise<HTMLCanvasElement> {
  const { tier, onProgress, signal } = opts;
  const startedAt = performance.now();
  aiLog.debug("depth", "estimateDepth start", {
    family: ACTIVE_DEPTH_FAMILY.id,
    model: tier.repo,
    dtype: tier.dtype,
    src: `${src.width}x${src.height}`,
  });

  // Cap the long edge to the model's working resolution before transfer
  // — same memory argument as segment.ts.
  const inferenceCap = getDepthInferenceLongEdge();
  const longEdge = Math.max(src.width, src.height);
  const scale = longEdge > inferenceCap ? inferenceCap / longEdge : 1;
  const infW = Math.max(1, Math.round(src.width * scale));
  const infH = Math.max(1, Math.round(src.height * scale));

  let inputBitmap: ImageBitmap;
  try {
    if (scale < 1) {
      const off = new OffscreenCanvas(infW, infH);
      const offCtx = off.getContext("2d", { willReadFrequently: false });
      if (!offCtx) throw new Error("OffscreenCanvas 2D context unavailable for downscale");
      offCtx.imageSmoothingEnabled = true;
      offCtx.imageSmoothingQuality = "high";
      offCtx.drawImage(src, 0, 0, infW, infH);
      inputBitmap = await createImageBitmap(off);
    } else {
      inputBitmap = await createImageBitmap(src);
    }
  } catch (err) {
    aiLog.error("depth", "createImageBitmap failed", err, {
      src: `${src.width}x${src.height}`,
      inference: `${infW}x${infH}`,
    });
    throw err;
  }

  onProgress?.({ phase: "download", ratio: 0, label: "Preparing model…" });

  let result: Awaited<ReturnType<typeof runAi>>;
  try {
    result = await runAi(
      {
        kind: "depth",
        bitmap: inputBitmap,
        model: tier.repo,
        dtype: tier.dtype,
        // iOS WebKit's WebGPU can hard-crash the tab during depth pipeline
        // init (uncatchable, so the worker's wasm fallback never runs).
        // Pin iOS to wasm; elsewhere "auto" prefers webgpu with fallback.
        device: preferredAiDevice(),
      },
      {
        signal,
        transfer: [inputBitmap],
        onProgress: (p) => onProgress?.(p),
      },
    );
  } catch (err) {
    if (!(err instanceof Error && err.name === "AiAbortError")) {
      aiLog.error("depth", "worker dispatch failed", err, {
        model: tier.repo,
        inference: `${infW}x${infH}`,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }
    throw err;
  }

  if (result.resultKind !== "depth") {
    aiLog.error("depth", "worker returned wrong result kind", null, {
      resultKind: result.resultKind,
    });
    throw new Error("AI worker returned an unexpected result shape.");
  }

  onProgress?.({ phase: "decode", ratio: 0.95, label: "Finalising…" });

  // Keep the depth map at its native inference resolution — a plain 1:1
  // draw, no upscale. `readDepth` (relight.ts) resizes it to whatever the
  // consumer bakes at (preview downsample or full res), so upscaling here
  // would only force an immediate downscale on every preview frame AND
  // keep a full-res grayscale buffer resident in the capability cache.
  const out = acquireCanvas(result.width, result.height);
  const ctx = out.getContext("2d");
  if (!ctx) {
    result.bitmap.close();
    throw new Error("Could not acquire canvas context for depth map");
  }
  ctx.drawImage(result.bitmap, 0, 0);
  result.bitmap.close();

  aiLog.info("depth", "estimateDepth done", {
    device: result.device,
    out: `${result.width}x${result.height}`,
    inference: `${infW}x${infH}`,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  onProgress?.({ phase: "decode", ratio: 1, label: "Done" });
  return out;
}

/** Whether a given tier's model bytes are already cached from a prior
 *  session — drives the consent modal's "Already downloaded" badge and
 *  the service's implicit-consent-on-hit path. */
export async function isDepthModelCached(tier: DepthModelTier): Promise<boolean> {
  return isHfModelCached(tier.repo, tier.dtype);
}

export { AiAbortError } from "./types";
