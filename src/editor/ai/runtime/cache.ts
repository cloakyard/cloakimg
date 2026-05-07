// cache.ts — CacheStorage probe for HuggingFace model assets.
//
// transformers.js stores fetched model files in a CacheStorage bucket
// (default name "transformers-cache"). We use this from the consent
// dialog and the mask service to answer "are the bytes already on
// disk for this <model, dtype> combo?" — which lets us suppress the
// download dialog when nothing would actually be downloaded.
//
// Generic on purpose: any future pipeline (face-detect, OCR, depth)
// can call `isHfModelCached(repo, dtype)` with no extra plumbing.

const HF_CACHE_PREFIXES = [
  "transformers-cache",
  // transformers.js has historically used a few cache names across
  // versions; checking both means a library upgrade doesn't silently
  // claim the model isn't cached and pop the dialog spuriously.
  "transformers-cache-v3",
];

/** Return true when CacheStorage holds at least one entry for the
 *  given HuggingFace repo + dtype. Match is intentionally loose — we
 *  look for `<repo>` in the URL path AND a dtype-suffixed `.onnx`
 *  filename so the small (q8) tier doesn't false-positive when only
 *  the medium (fp16) is on disk.
 *
 *  Errors and unsupported environments resolve to false — better to
 *  prompt the user once too often than silently skip a real download. */
export async function isHfModelCached(repo: string, dtype: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const onnxNeedle = filenameForDtype(dtype);
    const repoNeedle = repo.toLowerCase();
    const keys = await caches.keys();
    for (const key of keys) {
      // Restrict to transformers.js buckets so we don't iterate every
      // service-worker cache on the origin (fonts, runtime, app
      // shell, etc.).
      const lower = key.toLowerCase();
      if (!HF_CACHE_PREFIXES.some((p) => lower.includes(p))) continue;
      const c = await caches.open(key);
      const entries = await c.keys();
      for (const req of entries) {
        const url = req.url.toLowerCase();
        if (url.includes(repoNeedle) && url.includes(onnxNeedle)) return true;
      }
    }
  } catch {
    // CacheStorage is gated behind secure context; on file:// it's
    // unavailable. No info → false → user gets the dialog.
  }
  return false;
}

/** Map a transformers.js dtype label to the on-disk ONNX filename
 *  segment HF publishes. Files live under `<repo>/onnx/<filename>` so
 *  matching on the filename is enough to identify the dtype.
 *
 *  Keep in sync with the dtypes used by `segment.ts`'s tier registry —
 *  a typo here would make the cache probe always return false and the
 *  consent dialog would never show "Already downloaded". */
function filenameForDtype(dtype: string): string {
  switch (dtype) {
    case "fp32":
      return "model.onnx";
    case "fp16":
      return "model_fp16.onnx";
    case "q8":
    case "int8":
      return "model_quantized.onnx";
    case "q4":
      return "model_q4.onnx";
    case "q4f16":
      return "model_q4f16.onnx";
    case "bnb4":
      return "model_bnb4.onnx";
    case "uint8":
      return "model_uint8.onnx";
    default:
      return `model_${dtype}.onnx`;
  }
}
