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
// Model is `onnx-community/ISNet-ONNX` across all three tiers,
// varying by ONNX dtype:
//
//   small  → q8   (~42 MB)  uint8 quantization, fastest, all devices
//   medium → fp16 (~84 MB)  half precision, recommended balance
//   large  → fp32 (~168 MB) full precision, best fidelity
//
// We previously shipped Xenova/modnet, but a head-to-head bake-off
// against ISNet on three subject types (curly-hair portrait, dog with
// fur, product on white) showed modnet returns an *empty mask* for
// non-human subjects — modnet's training set is portraits-only.
// Users segmenting pets, products, or any non-portrait subject saw
// "no subject detected" or, worse, a fully transparent cut. ISNet is
// general-purpose (DIS dataset) and produces clean masks across all
// three categories at every dtype. The size budget tripled (6→42 MB
// for the Fast tier) but the bytes are real value, not size for size's
// sake — modnet's smaller weights couldn't generalise.
//
// History: we briefly used `briaai/RMBG-1.4` (Segformer-based) but
// transformers.js v4 rejects it because briaai's config.json reports
// `model_type: "SegformerForSemanticSegmentation"` (the class name)
// where v4 expects the lowercase identifier `"segformer"`. ISNet is
// in v4's CUSTOM_ARCHITECTURES_MAPPING and loads cleanly. To swap to
// BiRefNet or BEN2 later, change MODEL_REGISTRY — the cache probe
// and dispatch are model-agnostic. (Note: BiRefNet_lite was tested
// and trips a WebGPU shader storage-buffer limit on common Chrome
// configs, so it's not a viable swap today.)

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
  small: { repo: "onnx-community/ISNet-ONNX", dtype: "q8" },
  medium: { repo: "onnx-community/ISNet-ONNX", dtype: "fp16" },
  large: { repo: "onnx-community/ISNet-ONNX", dtype: "fp32" },
};

/** Best-effort byte-size hint shown in the consent dialog. The real
 *  size only resolves once the network responds; these are stable
 *  estimates for the ISNet ONNX dump. */
export const QUALITY_BYTE_ESTIMATES: Record<BgQuality, number> = {
  small: 42 * 1024 * 1024,
  medium: 84 * 1024 * 1024,
  large: 168 * 1024 * 1024,
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

  // 1. Pick an inference size. ISNet's preprocessor resizes every
  //    input to 1024×1024 internally — feeding 24 MP raw pixels just
  //    inflates worker memory pressure with no quality benefit. We cap
  //    the long edge at INFERENCE_LONG_EDGE before transferring so the
  //    bitmap arrives at the worker already at the model's working
  //    resolution. The worker's bitmap → RawImage → OffscreenCanvas
  //    round trip drops from ~300 MB to under 50 MB.
  //
  //    The mask we get back is at the inference size — we then bilinear-
  //    upscale its alpha onto the original full-res source on the main
  //    thread (step 4) so callers still get a cut at source dimensions.
  //    Quality of an upscaled soft alpha mask is indistinguishable from
  //    one regenerated at full resolution for the kind of edges modnet
  //    produces (it's a probability map, not a hard binary).
  const longEdge = Math.max(src.width, src.height);
  const scale = longEdge > INFERENCE_LONG_EDGE ? INFERENCE_LONG_EDGE / longEdge : 1;
  const infW = Math.max(1, Math.round(src.width * scale));
  const infH = Math.max(1, Math.round(src.height * scale));

  let inputBitmap: ImageBitmap;
  try {
    if (scale < 1) {
      // Build a downscaled snapshot via OffscreenCanvas — much cheaper
      // than handing the worker the full-res bitmap and doing the
      // resize inside the model preprocessor (where it would have
      // already paid the 300 MB memory tax we're trying to avoid).
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
    aiLog.error("segment", "createImageBitmap failed", err, {
      src: `${src.width}x${src.height}`,
      inference: `${infW}x${infH}`,
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
        inference: `${infW}x${infH}`,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }
    throw err;
  }

  onProgress?.({ phase: "decode", ratio: 0.95, label: "Finalising…" });

  // 3. Composite the small cut's alpha back onto the full-res source.
  //    drawImage with the {dx, dy, dw, dh} signature does a bilinear
  //    upscale — visually identical to running the model at full res
  //    for the soft alpha modnet produces, but at a fraction of the
  //    memory cost. The destination canvas matches `src` dimensions
  //    so the cache layer's "cut.width === source.width" invariant
  //    stays intact.
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) {
    result.bitmap.close();
    aiLog.error("segment", "acquireCanvas getContext returned null", null, {
      size: `${src.width}x${src.height}`,
    });
    throw new Error("Could not acquire canvas context");
  }
  ctx.clearRect(0, 0, out.width, out.height);
  // Lay down full-res RGB from the original source first.
  ctx.drawImage(src, 0, 0);
  // Then mask with the upscaled alpha. `destination-in` keeps existing
  // pixels weighted by the second image's alpha — exactly the cut we
  // want without an extra getImageData round-trip.
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(result.bitmap, 0, 0, src.width, src.height);
  ctx.globalCompositeOperation = "source-over";
  result.bitmap.close();

  aiLog.info("segment", "smartRemoveBackground done", {
    quality,
    device: result.device,
    out: `${src.width}x${src.height}`,
    inference: `${infW}x${infH}`,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  onProgress?.({ phase: "decode", ratio: 1, label: "Done" });
  return out;
}

/** Largest dimension we'll feed the segmentation model. ISNet
 *  preprocesses to 1024×1024 internally, so this is the natural
 *  ceiling — anything bigger is just memory pressure with no extra
 *  signal for the model to consume. */
const INFERENCE_LONG_EDGE = 1024;

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
