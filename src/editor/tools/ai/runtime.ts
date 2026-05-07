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
}

const pending = new Map<string, PendingCall>();

function getWorker(): Worker {
  if (worker) return worker;
  // Vite picks up `new URL("./worker.ts", import.meta.url)` and emits
  // a separate worker chunk — keeps transformers.js out of the main
  // bundle. `type: "module"` lets the worker use the same ESM imports
  // as the main code.
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
    if (msg.type === "result") {
      call.resolve(msg);
      return;
    }
    call.reject(new Error(msg.message));
  };
  worker.onerror = (e) => {
    // Worker-level error (e.g. failed to load transformers.js).
    // Reject every in-flight call and drop the singleton so the next
    // attempt spins a fresh worker.
    const message = e.message || "AI worker crashed";
    for (const call of pending.values()) call.reject(new Error(message));
    pending.clear();
    terminate();
  };
  return worker;
}

/** Tear down the worker and reject all in-flight calls. Used by abort
 *  paths and by the worker-level error handler. */
function terminate() {
  if (!worker) return;
  worker.terminate();
  worker = null;
}

interface DispatchOptions {
  signal?: AbortSignal;
  onProgress?: PendingCall["onProgress"];
}

/** Dispatch a single AI request. Resolves with the raw result message
 *  from the worker (PNG bytes + dims + device); rejects with
 *  `AiAbortError` on abort, or a generic Error on inference failure. */
export function runAi(
  req: Omit<AiRequest, "id">,
  opts: DispatchOptions = {},
): Promise<AiResultResponse> {
  const { signal, onProgress } = opts;
  if (signal?.aborted) return Promise.reject(new AiAbortError());

  const id = `req-${++nextId}`;
  const w = getWorker();

  return new Promise<AiResultResponse>((resolve, reject) => {
    const call: PendingCall = { resolve, reject, onProgress };
    pending.set(id, call);

    const onAbort = () => {
      pending.delete(id);
      // Terminating is the only honest way to stop a running ONNX
      // inference — the runtime has no graceful interrupt. The next
      // dispatch will spin a fresh worker; pipeline weights stay in
      // CacheStorage so the warm-up is just an import + tiny config
      // fetch, not a re-download.
      terminate();
      reject(new AiAbortError());
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    // Transfer the source blob's underlying buffer if the caller
    // already owns an ArrayBuffer; for now blobs go by value (cheap
    // structured-clone of a refcounted blob, not the bytes).
    const message: AiRequest = { ...req, id };
    w.postMessage(message);
  });
}

/** Eagerly tear down the worker. Useful from settings/debug paths;
 *  not needed in normal operation since browsers reclaim the worker
 *  on tab close. */
export function shutdownAiWorker() {
  // Reject any pending calls so callers don't hang.
  for (const call of pending.values()) call.reject(new AiAbortError());
  pending.clear();
  terminate();
}
