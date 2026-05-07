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

function getWorker(): Worker {
  if (worker) return worker;
  // Vite picks up `new URL("./worker.ts", import.meta.url)` and emits
  // a separate worker chunk — keeps transformers.js out of the main
  // bundle. `type: "module"` lets the worker use the same ESM imports
  // as the main code.
  aiLog.debug("runtime", "spawning AI worker (cold pipeline cache)");
  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "cloakimg-ai-worker",
  });
  worker.onmessage = (e: MessageEvent<AiResponse>) => {
    const msg = e.data;
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
  worker.onerror = (e) => {
    // Worker-level error (e.g. failed to load transformers.js, ORT
    // WASM fetch blocked, etc.). Reject every in-flight call and
    // drop the singleton so the next attempt spins a fresh worker.
    // Surface filename + line so the cause is visible in the console
    // — `e.message` alone is often empty for module-load errors.
    aiLog.error("runtime", "worker crashed", e.error ?? e, {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      pendingCount: pending.size,
    });
    const message = e.message || "AI worker crashed (see browser console for details)";
    rejectAllPending(new Error(message));
    terminate();
  };
  return worker;
}

/** Tear down the worker. Caller is responsible for handling pending
 *  rejections — `rejectAllPending` exists for that, called from the
 *  abort and worker-error paths. */
function terminate() {
  if (!worker) return;
  aiLog.debug("runtime", "terminating AI worker", { pendingCount: pending.size });
  worker.terminate();
  worker = null;
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
  const w = getWorker();

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

    const message: AiRequest = { ...req, id } as AiRequest;
    w.postMessage(message, transfer ?? []);
  });
}

/** Eagerly tear down the worker. Useful from settings/debug paths;
 *  not needed in normal operation since browsers reclaim the worker
 *  on tab close. */
export function shutdownAiWorker() {
  rejectAllPending(new AiAbortError());
  terminate();
}
