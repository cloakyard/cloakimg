// segment.ts — Subject-segmentation facade.
//
// Public API mirrors the old `smartRemoveBg.ts` so the seven downstream
// callers (subjectMask service, hook, dialogs, panels) didn't have to
// change shape — only their import paths moved.
//
// Internals are now transformers.js + ONNX, running in our own worker
// (see ai/worker.ts). The model is `briaai/RMBG-1.4` across all three
// tiers, varying by ONNX dtype:
//
//   small  → q8   (~44 MB)  best for portraits and most photos
//   medium → fp16 (~88 MB)  sharper edges, slower first-run
//   large  → fp32 (~176 MB) highest fidelity, heavy download
//
// To upgrade to BiRefNet later, swap MODEL_REGISTRY's `repo` to e.g.
// `onnx-community/BiRefNet-ONNX`. The cache probe and dispatch are
// already model-agnostic.

import { acquireCanvas } from "../../doc";
import { isHfModelCached } from "./cache";
import { runAi } from "./runtime";
import { AiAbortError, type AiProgress, type AiQuality } from "./types";

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

  // 1. Encode the source as a PNG Blob. The worker decodes it via
  //    createImageBitmap which is off-thread — cheaper than shipping
  //    a fresh ImageData over postMessage.
  const srcBlob = await canvasToPngBlob(src);
  if (signal?.aborted) throw new AiAbortError();

  onProgress?.({ phase: "download", ratio: 0, label: "Preparing model…" });

  // 2. Hand off to the worker. Progress events route through here so
  //    each call's panel sees its own ticks (the runtime closes over
  //    `onProgress` per call, not globally).
  const tier = MODEL_REGISTRY[quality];
  const result = await runAi(
    {
      kind: "segment",
      blob: srcBlob,
      model: tier.repo,
      dtype: tier.dtype,
      device: "auto",
    },
    {
      signal,
      onProgress: (p) => {
        onProgress?.(p);
      },
    },
  );
  if (signal?.aborted) throw new AiAbortError();

  onProgress?.({ phase: "decode", ratio: 0.95, label: "Finalising…" });

  // 3. Decode the PNG back into a canvas the editor can copyInto.
  //    createImageBitmap is fast and off-thread; we paint into a
  //    pooled canvas so the editor's render path doesn't see a fresh
  //    allocation per call.
  const blob = new Blob([new Uint8Array(result.pngBytes)], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  if (signal?.aborted) {
    bitmap.close();
    throw new AiAbortError();
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

// Re-export the abort error so callers that want to specifically
// distinguish "user cancelled" from "inference failed" can.
export { AiAbortError } from "./types";
