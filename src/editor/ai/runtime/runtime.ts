// runtime.ts — Main-thread harness for the AI worker.
//
// One shared Worker for the whole tab. Pipelines (segment / detect /
// ocr / depth) all dispatch through the same `runAi()` entry — the
// worker holds its own pipeline cache, so two `runAi({kind:"segment"})`
// calls in a row reuse the loaded model.
//
// Abort semantics: AbortSignal.aborted before the worker resolves
// rejects with `AiAbortError` AND terminates the worker (the only way
// to actually stop a running ONNX inference). Subsequent calls spin a
// fresh worker — the pipeline cache survives in CacheStorage so the
// re-spawn is fast for any model the user has already touched.

import { aiLog } from "../log";
import {
  AiAbortError,
  type AiProgress,
  type AiRequest,
  type AiResponse,
  type AiResultResponse,
} from "./types";

let worker: Worker | null = null;
let nextId = 0;
/** Resolves with the worker once it has emitted its `ready` ping
 *  (transformers.js + ORT bindings imported successfully). Rejects on
 *  module-load failure or after the readiness timeout. Every dispatch
 *  awaits this so we never `postMessage` to a half-dead worker — and
 *  if init fails the user sees a real error instead of the opaque
 *  "AI worker crashed" fallback. Re-built whenever `terminate()`
 *  fires, so a worker respawn starts a fresh handshake. */
let workerReady: Promise<Worker> | null = null;

/** How long to wait for the worker's `ready` message before declaring
 *  the module-load failed. The cold path should resolve in ~50–200 ms
 *  on desktop and ~300–800 ms on mid-tier phones; 5 s catches a
 *  genuinely failed import without blocking the main thread on a
 *  noisy network. */
const WORKER_READY_TIMEOUT_MS = 5000;

interface PendingCall {
  resolve: (r: AiResultResponse) => void;
  reject: (err: unknown) => void;
  onProgress?: (p: AiProgress) => void;
  /** Cleanup hook — removes the abort listener attached to this
   *  call's signal (if any). Called from every settle path so a
   *  long-lived signal that supervises many calls doesn't accumulate
   *  listeners. */
  cleanup: () => void;
}

const pending = new Map<string, PendingCall>();

function getWorker(): Promise<Worker> {
  if (workerReady) return workerReady;
  // Vite picks up `new URL("./worker.ts", import.meta.url)` and emits
  // a separate worker chunk — keeps transformers.js out of the main
  // bundle. `type: "module"` lets the worker use the same ESM imports
  // as the main code.
  aiLog.debug("runtime", "spawning AI worker (cold pipeline cache)");
  const w = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "cloakimg-ai-worker",
  });
  worker = w;
  workerReady = new Promise<Worker>((resolveReady, rejectReady) => {
    let settled = false;
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      rejectReady(err);
    };
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolveReady(w);
    };

    const timeoutId = window.setTimeout(() => {
      aiLog.error(
        "runtime",
        "worker init timeout — module never reported ready",
        new Error("worker-init-timeout"),
        { timeoutMs: WORKER_READY_TIMEOUT_MS, pendingCount: pending.size },
      );
      const err = new Error(
        "AI module didn't finish loading. Reload the page and try again — your image stayed on this device.",
      );
      rejectAllPending(err);
      terminate();
      settleReject(err);
    }, WORKER_READY_TIMEOUT_MS);

    w.onmessage = (e: MessageEvent<AiResponse>) => {
      const msg = e.data;
      // Lifecycle frames first — they're not tied to a request id.
      if (msg.type === "ready") {
        aiLog.debug("runtime", "worker reported ready");
        settleResolve();
        return;
      }
      if (msg.type === "self-error") {
        // Worker caught its own top-level / unhandled-rejection
        // error and posted a structured frame. Tear down + reject
        // every in-flight call with the worker's own (already
        // user-friendly) message instead of waiting for the opaque
        // ErrorEvent that may follow.
        aiLog.error("runtime", "worker self-error", new Error(msg.message), {
          message: msg.message,
          stack: msg.stack,
          pendingCount: pending.size,
        });
        const err = new Error(msg.message);
        rejectAllPending(err);
        terminate();
        settleReject(err);
        return;
      }
      // Per-request frames.
      const call = pending.get(msg.id);
      if (!call) return; // late message after abort — safe to drop.
      if (msg.type === "progress") {
        call.onProgress?.(msg.progress);
        return;
      }
      pending.delete(msg.id);
      call.cleanup();
      if (msg.type === "result") {
        call.resolve(msg);
        return;
      }
      aiLog.warn("runtime", "worker reported error result", {
        id: msg.id,
        message: msg.message,
        fatal: msg.fatal,
      });
      call.reject(new Error(msg.message));
    };
    w.onerror = (e) => {
      // Worker-level error (failed to load transformers.js, ORT
      // WASM fetch blocked, etc.). Reject every in-flight call and
      // drop the singleton so the next attempt spins a fresh worker.
      // Surface filename + line so the cause is visible in the
      // console — `e.message` alone is often empty for module-load
      // errors. Most of the time `self-error` above will have
      // already settled before this fires; the fallback path here
      // covers the case where the worker died before its top-level
      // handlers got a chance to run (e.g. a true module load
      // failure where `import` itself threw).
      aiLog.error("runtime", "worker onerror", e.error ?? e, {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        pendingCount: pending.size,
      });
      // Suppress the default "uncaught error in worker" logging —
      // we've already captured + routed it through aiLog.
      e.preventDefault?.();
      const message =
        e.message ||
        "AI module failed to start. Reload the page and try again — your image stayed on this device.";
      const err = new Error(message);
      rejectAllPending(err);
      terminate();
      settleReject(err);
    };
  });

  return workerReady;
}

/** Tear down the worker. Caller is responsible for handling pending
 *  rejections — `rejectAllPending` exists for that, called from the
 *  abort and worker-error paths. Clears the readiness promise too so
 *  the next `getWorker()` spins a fresh one. */
function terminate() {
  if (!worker) return;
  aiLog.debug("runtime", "terminating AI worker", { pendingCount: pending.size });
  worker.terminate();
  worker = null;
  workerReady = null;
}

/** Reject every in-flight call with the given error and clear the
 *  table. Used when the worker dies (terminate from abort, onerror)
 *  so concurrent callers don't hang on the dead worker. */
function rejectAllPending(err: unknown) {
  for (const call of pending.values()) {
    call.cleanup();
    call.reject(err);
  }
  pending.clear();
}

interface DispatchOptions {
  signal?: AbortSignal;
  onProgress?: PendingCall["onProgress"];
  /** Transferables to hand off to the worker (zero-copy). Defaults
   *  to whatever transferable fields the caller knows about — e.g.
   *  segment requests pass [bitmap]. */
  transfer?: Transferable[];
}

/** Dispatch a single AI request. Resolves with the raw result message
 *  from the worker (bitmap + dims + device); rejects with
 *  `AiAbortError` on abort, or a generic Error on inference failure.
 *
 *  Aborting one call terminates the worker, which by extension rejects
 *  every other call in flight (worker is dead — no honest way to keep
 *  serving them). The next call re-spawns. */
export function runAi(
  req: Omit<AiRequest, "id">,
  opts: DispatchOptions = {},
): Promise<AiResultResponse> {
  const { signal, onProgress, transfer } = opts;
  if (signal?.aborted) return Promise.reject(new AiAbortError());

  const id = `req-${++nextId}`;

  return new Promise<AiResultResponse>((resolve, reject) => {
    let onAbort: (() => void) | null = null;

    const cleanup = () => {
      if (onAbort && signal) {
        signal.removeEventListener("abort", onAbort);
        onAbort = null;
      }
    };

    const call: PendingCall = { resolve, reject, onProgress, cleanup };
    pending.set(id, call);

    onAbort = () => {
      // Pull this id out *before* terminating, so the rejectAll loop
      // below doesn't double-reject this call (we want our own
      // AiAbortError, not a generic "worker terminated").
      pending.delete(id);
      cleanup();
      // Terminating is the only honest way to stop a running ONNX
      // inference — the runtime has no graceful interrupt. Any other
      // calls in flight die with the worker; we reject them so they
      // don't hang. The next dispatch re-spawns; pipeline weights
      // stay in CacheStorage so warm-up is fast.
      const orphaned = Array.from(pending.values());
      pending.clear();
      terminate();
      reject(new AiAbortError());
      for (const other of orphaned) {
        other.cleanup();
        other.reject(new AiAbortError());
      }
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    // Wait for the worker's `ready` ping before posting. Module-load
    // failures surface as a real rejected promise here (with a
    // user-friendly message from the runtime/worker error mapping)
    // instead of a fire-and-forget postMessage to a dead worker. If
    // an abort fires while we're waiting on init, the abort handler
    // above already pulled the call out of `pending`, so this branch
    // is a no-op when the readiness promise eventually settles.
    getWorker()
      .then((w) => {
        // Re-check membership: an abort between getWorker resolving
        // and this `.then` running may have already routed the
        // rejection through the abort path.
        if (!pending.has(id)) return;
        const message: AiRequest = { ...req, id } as AiRequest;
        w.postMessage(message, transfer ?? []);
      })
      .catch((err) => {
        // Init failure (timeout, self-error, onerror). The readiness
        // promise's reject path already called `rejectAllPending`,
        // which cleaned up every pending call — but our entry here
        // is the one that triggered the spawn, so it might still be
        // sitting in the map if we got here before the timeout
        // tripped. Clean up defensively.
        const stillPending = pending.get(id);
        if (stillPending) {
          pending.delete(id);
          stillPending.cleanup();
          stillPending.reject(err);
        }
      });
  });
}

/** Eagerly tear down the worker. Useful from settings/debug paths;
 *  not needed in normal operation since browsers reclaim the worker
 *  on tab close. */
export function shutdownAiWorker() {
  rejectAllPending(new AiAbortError());
  terminate();
}
