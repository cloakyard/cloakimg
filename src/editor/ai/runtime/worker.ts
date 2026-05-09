/// <reference lib="webworker" />
// worker.ts — Top-level dispatcher for the AI worker.
//
// Was a single 450-line file with one hard-coded "if segment" branch
// and the segment-specific pipeline cache + buildSegmenter glue inline.
// Refactored into a thin router so adding a new worker-bound capability
// is:
//   1. Define the request variant in ./types.ts (e.g. AiDepthRequest).
//   2. Add a handler module under ./handlers/ exporting `handleDepth`.
//   3. Register it in HANDLERS below.
// The dispatcher and the env-setup block above stay untouched.
//
// Capabilities that don't fit the worker model (e.g. MediaPipe
// Tasks Web — its Emscripten loader uses `importScripts`, which
// isn't available in module workers) live as main-thread runners
// under `capabilities/<feature>/runner.ts` instead and DO NOT
// register here.
//
// The shared infrastructure (bitmap conversions, postProgress, friendly
// error mapping, device-fallback ordering) lives in ./handlers/shared.ts
// — every handler imports those primitives so a future protocol bump
// or error-copy refresh lands in one place.

import { env, LogLevel } from "@huggingface/transformers";
import type { AiRequest } from "./types";
import { handleSegment } from "./handlers/segmentHandler";
import { buildSelfErrorMessage, postError, postReady, postSelfError } from "./handlers/shared";

declare const self: DedicatedWorkerGlobalScope;

// —————————————— transformers.js env ——————————————

// Disable filesystem-backed local model loading — we ship the bytes
// from the HF CDN and let the browser cache them.
env.allowLocalModels = false;
env.useBrowserCache = true;
// `useWasmCache` (new in v4) preloads the ONNX Runtime WASM factory
// (.mjs) cross-origin from jsdelivr, converts it to a blob URL, and
// then has ORT dynamic-import from that blob. In our PWA + module-
// worker context that path is fragile: a cross-origin blob import
// can fail with an opaque ErrorEvent (no message, no filename) that
// the worker's self.onerror can't intercept, and the user sees the
// generic "AI module failed to start" fallback even though the
// upstream model bytes are reachable. Disabling the preload reverts
// to v3's behaviour: ORT fetches the WASM directly via its built-in
// loader on first inference.
env.useWasmCache = false;
// Suppress transformers.js + ONNX Runtime info / warning chatter.
env.logLevel = LogLevel.ERROR;

// —————————————— Handler registry ——————————————

/** Per-kind dispatch table. Each entry is the worker-side handler for
 *  one request kind. The kinds are constrained by `AiRequest["kind"]`
 *  so an unregistered kind is a TS exhaustiveness error at the
 *  registry definition site, not a runtime drop. */
type HandlerFor<K extends AiRequest["kind"]> = (
  req: Extract<AiRequest, { kind: K }>,
) => Promise<void>;

// Build the table with explicit per-kind entries. As new kinds land in
// AiRequest, TS forces a registration here — silent drops are
// impossible.
const HANDLERS: { [K in AiRequest["kind"]]: HandlerFor<K> } = {
  segment: handleSegment,
};

// —————————————— Top-level dispatch ——————————————

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data;
  const handler = HANDLERS[req.kind] as HandlerFor<typeof req.kind> | undefined;
  if (!handler) {
    // Should be impossible — TS would have flagged a missing entry in
    // HANDLERS. But protect against a forwarded message from a future
    // version of the main thread that registered a kind we don't
    // implement yet, surfacing a real error instead of a silent drop.
    postError(req.id, new Error(`Unknown AI request kind: ${(req as AiRequest).kind}`), true);
    return;
  }
  void (handler as (r: AiRequest) => Promise<void>)(req).catch((err) => {
    postError(req.id, err, true);
  });
};

// Capture errors thrown OUTSIDE a request handler — top-level module
// faults, an unhandled rejection from a stray promise, an error in a
// callback we didn't await. Post them as `self-error` messages so the
// main-thread runtime can render a real error to the user instead of
// the opaque "AI worker crashed (see browser console for details)"
// fallback that an empty ErrorEvent produces.
self.onerror = (event) => {
  const message = typeof event === "string" ? event : (event.message ?? "Unknown worker error");
  const filename = typeof event === "string" ? undefined : event.filename;
  const errorObj =
    typeof event === "string" ? undefined : event.error instanceof Error ? event.error : undefined;
  postSelfError(buildSelfErrorMessage(message, filename), errorObj?.stack);
};
self.onunhandledrejection = (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  postSelfError(`Unhandled rejection: ${message}`, stack);
};

// Post the ready ping AFTER the imports above have evaluated. If
// transformers.js (or any handler module's imports) fails to load,
// we never reach this line — the main thread's getWorker() readiness
// promise rejects with a clear "model runtime failed to initialize"
// instead of an opaque ErrorEvent.
postReady();
