// types.ts — Shared types for the on-device AI runtime.
//
// One enum + one progress shape covers every pipeline (segmentation
// today, detection / OCR / depth tomorrow). Pipeline-specific facades
// import these and add their own domain types alongside.

/** Quality / size trade-off shared across pipelines. Each pipeline
 *  maps these to its own model registry — e.g. segmentation uses three
 *  dtypes of the same model, a future detector might pick between
 *  YOLO-n / -s / -m. The user-facing copy stays consistent: small =
 *  fast download / fast inference, large = highest fidelity. */
export type AiQuality = "small" | "medium" | "large";

export interface AiProgress {
  /** Phases the UI distinguishes:
   *    • download — model + tokenizer / preprocessor configs streaming in
   *    • inference — the network actually running (no granular % from
   *      ONNX runtime, so the UI shows an indeterminate stripe)
   *    • decode — converting the result back to a canvas / blob */
  phase: "download" | "inference" | "decode";
  /** 0..1, monotonic within a phase. */
  ratio: number;
  /** Human-readable label the panel can show ("Loading model…",
   *  "Detecting subject…"). */
  label: string;
  /** Bytes downloaded so far (download phase only). */
  bytesDownloaded?: number;
  /** Total bytes expected for the model files. */
  bytesTotal?: number;
}

/** Worker request kinds. Discriminated by `kind`; the worker dispatches
 *  on this and adding a new pipeline (detection, OCR, depth) is a new
 *  variant here + a new branch in the worker. The main-thread runtime
 *  doesn't need to change. */
export type AiRequest = AiSegmentRequest;

export interface AiSegmentRequest {
  /** Caller-assigned request id. The worker echoes it back on every
   *  response so concurrent requests (e.g. mask + future face-detect
   *  in parallel) don't cross wires. */
  id: string;
  kind: "segment";
  /** Source image as a PNG blob. Smaller wire format than ImageData;
   *  the worker decodes via createImageBitmap which is off-thread. */
  blob: Blob;
  /** HF repo id for the segmentation model. Allows the facade to pin
   *  a specific model + revision rather than hard-coding it inside
   *  the worker. */
  model: string;
  /** ONNX dtype variant: "fp32", "fp16", "q8", "q4", etc. The HF cache
   *  layer treats each dtype as a separate file, so switching tiers
   *  doesn't re-download what's already on disk. */
  dtype: string;
  /** Inference backend hint. "auto" tries WebGPU first and falls back
   *  to WASM; explicit values force one path (used by the fallback
   *  retry after a WebGPU shader-compile error). */
  device?: "auto" | "webgpu" | "wasm";
}

/** Worker response variants. All carry the request id so the runtime
 *  can route them back to the right caller's promise / progress
 *  callback. */
export type AiResponse = AiProgressResponse | AiResultResponse | AiErrorResponse;

export interface AiProgressResponse {
  id: string;
  type: "progress";
  progress: AiProgress;
}

export interface AiResultResponse {
  id: string;
  type: "result";
  /** Alpha-keyed PNG bytes. Transferable so the postMessage hop is
   *  zero-copy on browsers that honour it. */
  pngBytes: ArrayBuffer;
  /** Output dimensions — saves the main thread from decoding the PNG
   *  just to size the destination canvas. */
  width: number;
  height: number;
  /** Backend the inference actually ran on. Surfaced in mask state
   *  so the UI can show "Running on WebGPU" / "Running on CPU". */
  device: "webgpu" | "wasm";
}

export interface AiErrorResponse {
  id: string;
  type: "error";
  message: string;
  /** True when the worker has already exhausted its WebGPU → WASM
   *  fallback. The runtime can choose to surface a final error or
   *  throw away the worker singleton and respawn. */
  fatal: boolean;
}

/** Thrown by `runtime.dispatch()` when the caller's AbortSignal fires
 *  before the worker resolves. The worker is terminated and respawned
 *  on the next call — no graceful "interrupt inference" exists in
 *  ONNX runtime today, so termination is the cleanest exit. */
export class AiAbortError extends Error {
  constructor() {
    super("AI inference aborted");
    this.name = "AiAbortError";
  }
}
