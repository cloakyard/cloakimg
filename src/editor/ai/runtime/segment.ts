// segment.ts — Subject-segmentation facade.
//
// Public API mirrors the old `smartRemoveBg.ts` so the seven downstream
// callers (subjectMask service, hook, dialogs, panels) didn't have to
// change shape — only their import paths moved.
//
// Internals are now transformers.js + ONNX, running in our own worker
// (see ai/worker.ts). Source pixels travel as a transferable
// ImageBitmap (no PNG encode on the main thread); the result comes
// back the same way (no PNG decode either) — a typical detection
// shaves ~130 ms of round-trip overhead vs. the Blob path.
//
// Model is `briaai/RMBG-1.4` across all three tiers, varying by ONNX
// dtype:
//
//   small  → q8   (~44 MB)  best for portraits and most photos
//   medium → fp16 (~88 MB)  sharper edges, slower first-run
//   large  → fp32 (~176 MB) highest fidelity, heavy download
//
// To upgrade to BiRefNet later, swap MODEL_REGISTRY's `repo`. The
// cache probe and dispatch are already model-agnostic.

import { acquireCanvas } from "../../doc";
import { aiLog } from "../log";
import { isHfModelCached } from "./cache";
import { runAi } from "./runtime";
import type { AiProgress, AiQuality } from "./types";

/** Re-export the shared types under their old names so the seven
 *  call sites can update their import path with no further shape
 *  changes. New code should prefer importing from `./types` directly. */
export type BgQuality = AiQuality;
export type SmartRemoveProgress = AiProgress;

interface ModelTier {
  /** HF repo id passed to transformers.js' pipeline(). */
  repo: string;
  /** ONNX dtype variant — tells transformers.js which file under
   *  `<repo>/onnx/` to fetch. Different dtypes are different files,
   *  so switching tiers doesn't re-download what's on disk. */
  dtype: string;
}

const MODEL_REGISTRY: Record<BgQuality, ModelTier> = {
  small: { repo: "briaai/RMBG-1.4", dtype: "q8" },
  medium: { repo: "briaai/RMBG-1.4", dtype: "fp16" },
  large: { repo: "briaai/RMBG-1.4", dtype: "fp32" },
};

/** Best-effort byte-size hint shown in the consent dialog. The real
 *  size only resolves once the network responds; these are stable
 *  estimates for the briaai/RMBG-1.4 ONNX dump. */
export const QUALITY_BYTE_ESTIMATES: Record<BgQuality, number> = {
  small: 44 * 1024 * 1024,
  medium: 88 * 1024 * 1024,
  large: 176 * 1024 * 1024,
};

interface RemoveOptions {
  quality?: BgQuality;
  onProgress?: (p: SmartRemoveProgress) => void;
  /** Cancellation. Honouring this terminates the AI worker — there's
   *  no graceful interrupt for ONNX inference, so termination is the
   *  only honest cancel. The next call respawns; pipeline weights
   *  stay in CacheStorage so the warm-up is fast. */
  signal?: AbortSignal;
}

/** Run subject segmentation on `src`. Returns a fresh canvas (acquired
 *  from the canvas pool — caller is responsible for releasing it once
 *  the alpha-keyed pixels have been copied into doc.working). The
 *  source canvas is left untouched.
 *
 *  Errors are surfaced through the rejected promise — the caller is
 *  expected to catch and surface them inline (the panel does this
 *  next to its Apply button, same as the chroma keyer's error path).
 *  An aborted call rejects with `AiAbortError`. */
export async function smartRemoveBackground(
  src: HTMLCanvasElement,
  opts: RemoveOptions = {},
): Promise<HTMLCanvasElement> {
  const { quality = "small", onProgress, signal } = opts;
  const tier = MODEL_REGISTRY[quality];
  const startedAt = performance.now();
  aiLog.debug("segment", "smartRemoveBackground start", {
    quality,
    model: tier.repo,
    dtype: tier.dtype,
    src: `${src.width}x${src.height}`,
  });

  // 1. Snapshot the source as a transferable ImageBitmap. ~5 ms vs.
  //    ~50–200 ms for canvas.toBlob('image/png') on large photos —
  //    keeps the editor's main thread responsive during Apply.
  let inputBitmap: ImageBitmap;
  try {
    inputBitmap = await createImageBitmap(src);
  } catch (err) {
    aiLog.error("segment", "createImageBitmap failed", err, {
      src: `${src.width}x${src.height}`,
    });
    throw err;
  }

  onProgress?.({ phase: "download", ratio: 0, label: "Preparing model…" });

  // 2. Hand off to the worker. The bitmap is in the transferable
  //    list, so postMessage is zero-copy. After this point the main
  //    thread no longer owns inputBitmap — the worker will close it.
  //    runAi handles abort itself; an in-flight cancel rejects with
  //    AiAbortError, which we let bubble.
  let result: Awaited<ReturnType<typeof runAi>>;
  try {
    result = await runAi(
      {
        kind: "segment",
        bitmap: inputBitmap,
        model: tier.repo,
        dtype: tier.dtype,
        device: "auto",
      },
      {
        signal,
        transfer: [inputBitmap],
        onProgress: (p) => {
          onProgress?.(p);
        },
      },
    );
  } catch (err) {
    // Don't double-log AbortError — the cancellation path is expected
    // and the panel UI knows what to do with it.
    if (!(err instanceof Error && err.name === "AiAbortError")) {
      aiLog.error("segment", "worker dispatch failed", err, {
        quality,
        model: tier.repo,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }
    throw err;
  }

  onProgress?.({ phase: "decode", ratio: 0.95, label: "Finalising…" });

  // 3. Paint the result bitmap into a pooled canvas the editor can
  //    copyInto. drawImage from a transferred ImageBitmap is
  //    GPU-direct on every backend we ship — no PNG decode.
  const out = acquireCanvas(result.width, result.height);
  const ctx = out.getContext("2d");
  if (!ctx) {
    result.bitmap.close();
    aiLog.error("segment", "acquireCanvas getContext returned null", null, {
      size: `${result.width}x${result.height}`,
    });
    throw new Error("Could not acquire canvas context");
  }
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(result.bitmap, 0, 0);
  result.bitmap.close();

  aiLog.info("segment", "smartRemoveBackground done", {
    quality,
    device: result.device,
    out: `${result.width}x${result.height}`,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  onProgress?.({ phase: "decode", ratio: 1, label: "Done" });
  return out;
}

/** Whether a given quality tier's model bytes are already on disk
 *  from a previous session. Used by the consent dialog to render the
 *  "Already downloaded" badge and by the mask service to suppress the
 *  prompt when nothing would actually be downloaded.
 *
 *  The HF cache layer keys each dtype as a separate file under the
 *  repo's `/onnx/` path, so different tiers report independently. */
export async function isModelCached(quality: BgQuality): Promise<boolean> {
  const tier = MODEL_REGISTRY[quality];
  return isHfModelCached(tier.repo, tier.dtype);
}

// Re-export the abort error so callers that want to specifically
// distinguish "user cancelled" from "inference failed" can.
export { AiAbortError } from "./types";
