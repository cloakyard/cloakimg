/// <reference lib="webworker" />
// shared.ts — Helpers used by every worker handler.
//
// Goals:
//   • One bitmap ↔ RawImage round-trip implementation. Each capability's
//     handler does the same conversion (input ImageBitmap → RawImage,
//     output RawImage → ImageBitmap); duplicating it 5+ times is the
//     kind of thing that sprouts subtle channel-handling drift.
//   • One wire-format helper layer (postProgress / postError /
//     postSelfError / postReady) so a future protocol bump touches one
//     spot.
//   • One friendly-error mapping, scoped to handler-agnostic wording —
//     "model fetch failed" etc.
//   • One device-fallback helper. Every transformers.js pipeline today
//     wants WebGPU first, WASM as a graceful fallback; the loop is
//     identical regardless of the pipeline kind.

import type { RawImage } from "@huggingface/transformers";
import type {
  AiErrorResponse,
  AiProgress,
  AiProgressResponse,
  AiReadyResponse,
  AiResponse,
  AiResultResponse,
  AiSelfErrorResponse,
} from "../types";

declare const self: DedicatedWorkerGlobalScope;

// —————————————— Wire-format helpers ——————————————

export function postProgress(id: string, progress: AiProgress): void {
  const msg: AiProgressResponse = { id, type: "progress", progress };
  self.postMessage(msg);
}

export function postResult(result: AiResultResponse, transfer: Transferable[]): void {
  self.postMessage(result, transfer);
}

export function postError(id: string, err: unknown, fatal: boolean): void {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const message = friendlyErrorMessage(rawMessage);
  const msg: AiErrorResponse = { id, type: "error", message, fatal };
  self.postMessage(msg);
}

export function postReady(): void {
  const msg: AiReadyResponse = { type: "ready" };
  self.postMessage(msg);
}

export function postSelfError(message: string, stack?: string): void {
  const msg: AiSelfErrorResponse = { type: "self-error", message, stack };
  self.postMessage(msg);
}

export function buildSelfErrorMessage(message: string, filename?: string): string {
  const friendly = friendlyErrorMessage(message);
  if (friendly !== message || !filename) return friendly;
  return `${friendly} (${filename})`;
}

// Re-export AiResponse so handlers don't have to import from two paths.
export type { AiResponse };

// —————————————— Bitmap ↔ RawImage ——————————————

/** Convert an incoming source ImageBitmap to a RawImage transformers.js
 *  can ingest. Path: bitmap → OffscreenCanvas → getImageData →
 *  RawImage. Skips a PNG decode that `RawImage.fromBlob` would
 *  otherwise pay (~50–100 ms on a 12 MP photo). */
export function bitmapToRawImage(bitmap: ImageBitmap, RawImageCtor: typeof RawImage): RawImage {
  const w = bitmap.width;
  const h = bitmap.height;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  return new RawImageCtor(imageData.data, w, h, 4);
}

/** Paint the model's RawImage output into an OffscreenCanvas and hand
 *  back a transferable ImageBitmap. Channel handling is conservative
 *  so a future model swap that yields RGB or 1-channel masks still
 *  produces the right pixels.
 *
 *  Saves ~130 ms per detection vs the older Blob round-trip. */
export function rawImageToBitmap(img: RawImage): ImageBitmap {
  const w = img.width;
  const h = img.height;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker");
  const imageData = ctx.createImageData(w, h);
  const src = img.data;
  const dst = imageData.data;
  if (img.channels === 4) {
    dst.set(src);
  } else if (img.channels === 3) {
    // RGB → RGBA with full alpha. Defensive: today's segmentation
    // pipeline doesn't hit this, but a future RGB-only model would
    // otherwise produce a black canvas.
    for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
      dst[j] = src[i] ?? 0;
      dst[j + 1] = src[i + 1] ?? 0;
      dst[j + 2] = src[i + 2] ?? 0;
      dst[j + 3] = 255;
    }
  } else if (img.channels === 1) {
    // Single-channel mask — interpret as alpha over a black RGB.
    for (let i = 0; i < src.length; i++) {
      const a = src[i] ?? 0;
      const j = i * 4;
      dst[j] = 0;
      dst[j + 1] = 0;
      dst[j + 2] = 0;
      dst[j + 3] = a;
    }
  } else {
    throw new Error(`Unsupported channel count from pipeline: ${img.channels}`);
  }
  ctx.putImageData(imageData, 0, 0);
  return offscreen.transferToImageBitmap();
}

// —————————————— Device fallback ——————————————

/** Order to try inference backends given a hint. "auto" → WebGPU then
 *  WASM. Explicit values force one path (used by integration tests
 *  and by capability-level fallback retry). */
export function deviceOrder(hint: "auto" | "webgpu" | "wasm" | undefined): ("webgpu" | "wasm")[] {
  if (hint === "wasm") return ["wasm"];
  if (hint === "webgpu") return ["webgpu"];
  return ["webgpu", "wasm"];
}

// —————————————— Friendly error mapping ——————————————

/** Map opaque transformer / ORT / fetch / browser-storage errors to
 *  copy a user can act on. Identical to the segment-only version that
 *  used to live in worker.ts — kept handler-agnostic so any new
 *  capability gets the same friendly messages for free. */
export function friendlyErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("quotaexceeded") ||
    lower.includes("quota exceeded") ||
    lower.includes("storage full") ||
    lower.includes("disk is full")
  ) {
    return "Browser storage is full — the model bytes can't be cached. Clear some space in browser settings or use a private tab to try once without caching.";
  }
  if (
    lower.includes("aborterror") ||
    lower.includes("the user aborted") ||
    lower.includes("the operation was aborted") ||
    lower.includes("request aborted")
  ) {
    return "Download was interrupted by the browser. This usually happens after a long pause — try again to resume.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("err_") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return "Couldn't reach the model server. Check your connection and try again.";
  }
  if (
    lower.includes("out of memory") ||
    lower.includes("oom") ||
    lower.includes("allocation failed") ||
    lower.includes("rangeerror") ||
    lower.includes("array buffer allocation failed")
  ) {
    return "This device ran out of memory loading the model. Try a smaller tier, or switch to a non-AI tool.";
  }
  if (lower.includes("webassembly") || lower.includes("wasm")) {
    return "The on-device runtime didn't compile in this browser. Try a recent Chrome / Safari, or use a non-AI tool.";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "The model files weren't found on the server. The CloakIMG team may have updated them — try reloading the page.";
  }
  if (lower.includes("importscripts") || lower.includes("syntax")) {
    return "AI module failed to load. Reload the page and try again.";
  }
  return raw || "AI worker hit an unexpected error.";
}
