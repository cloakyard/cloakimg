// device.ts — Pick the inference backend hint for the AI worker per
// browser. The worker's `deviceOrder` turns the hint into an attempt
// order ("auto" → webgpu then wasm; "wasm" → wasm only).
//
// Why iOS gets pinned to wasm: on iOS every browser is WebKit, and
// WebKit's WebGPU is new and can hard-crash the tab during pipeline
// init / inference (a GPU-process failure, NOT a catchable JS error —
// so the worker's webgpu→wasm fallback never gets a chance to run, and
// the user just sees the tab "close"). iOS is also the most
// memory-constrained target, where the wasm path is the safer bet.
// Reported against Relight (depth) on mobile Safari.

export type DeviceHint = "auto" | "webgpu" | "wasm";

/** True on iOS — iPhone / iPod, the classic iPad UA, and iPadOS in
 *  "desktop" mode (which reports as Macintosh but is a touch device). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  // iPadOS ≥ 13 defaults to a desktop UA; distinguish it from a real Mac
  // by the presence of touch points.
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number") {
    return navigator.maxTouchPoints > 1;
  }
  return false;
}

/** Backend hint for an AI inference request. iOS → "wasm" (WebGPU there
 *  can crash the tab); everywhere else → "auto" so the worker prefers
 *  WebGPU and transparently falls back to wasm. */
export function preferredAiDevice(): DeviceHint {
  return isIOS() ? "wasm" : "auto";
}
