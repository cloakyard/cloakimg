// Worker-handshake tests for the AI runtime.
//
// The runtime mediates every AI call through a single shared Worker.
// The flow is: spawn → wait for `ready` ping → postMessage. If the
// worker fails to load (CORS, syntax, missing WASM), users see one of
// two symptoms: the editor hangs forever, or "AI worker crashed" with
// no detail. Both regressed at least once before the readiness
// handshake landed; tests below pin every branch.
//
// We replace the Worker constructor with a scriptable fake. Tests
// drive the fake's `onmessage`/`onerror` to simulate ready / result /
// progress / self-error / module-load failure.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeWorker extends EventTarget {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  /** Convenience helpers exposed only on the fake — tests call these
   *  to drive the worker's lifecycle. */
  emitMessage(data: unknown): void;
  emitError(init: { message?: string; filename?: string; error?: Error }): void;
}

const workerInstances: FakeWorker[] = [];
let workerCtorThrows: Error | null = null;

function createFakeWorker(): FakeWorker {
  const target = new EventTarget() as FakeWorker;
  target.postMessage = vi.fn();
  target.terminate = vi.fn();
  target.onmessage = null;
  target.onerror = null;
  target.emitMessage = (data: unknown) => {
    if (target.onmessage) target.onmessage({ data } as MessageEvent);
  };
  target.emitError = (init) => {
    if (target.onerror) {
      const event = {
        message: init.message ?? "",
        filename: init.filename ?? "",
        lineno: 0,
        error: init.error,
        preventDefault: () => undefined,
      } as unknown as ErrorEvent;
      target.onerror(event);
    }
  };
  return target;
}

const OriginalWorker = globalThis.Worker;

beforeEach(() => {
  workerInstances.length = 0;
  workerCtorThrows = null;
  vi.resetModules();
  // Replace the global Worker with a fake constructor. Tests grab the
  // latest instance via `workerInstances[0]`. We use a plain function
  // (not vi.fn()) because `new vi.fn().mockImplementation(...)` does
  // not honour the implementation's return value when invoked as a
  // constructor in some Vitest versions — the wrapped fn returns its
  // own `this` and the fake never lands in workerInstances.
  function FakeWorker(this: FakeWorker) {
    if (workerCtorThrows) throw workerCtorThrows;
    const w = createFakeWorker();
    workerInstances.push(w);
    Object.assign(this, w);
    // Return the real EventTarget-backed instance so listeners attach
    // to the same object the test will drive via emitMessage.
    return w;
  }
  Object.defineProperty(globalThis, "Worker", {
    value: FakeWorker,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "Worker", {
    value: OriginalWorker,
    writable: true,
    configurable: true,
  });
});

async function loadRuntime() {
  return import("./runtime");
}

function withFakeBitmap(): ImageBitmap {
  // The runtime never touches the bitmap — it only forwards it as a
  // transferable. A typed stub satisfies the parameter shape.
  return { width: 1, height: 1, close: () => undefined } as unknown as ImageBitmap;
}

describe("runtime — worker readiness handshake (cold path)", () => {
  it("waits for `ready` before forwarding the request", async () => {
    const { runAi } = await loadRuntime();
    const promise = runAi(
      { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
      { transfer: [] },
    );

    // Spawn happened, but the worker hasn't acked. No postMessage yet.
    expect(workerInstances).toHaveLength(1);
    const w = workerInstances[0]!;
    expect(w.postMessage).not.toHaveBeenCalled();

    w.emitMessage({ type: "ready" });
    // Microtask flush → postMessage happens after ready.
    await new Promise((r) => setTimeout(r, 0));
    expect(w.postMessage).toHaveBeenCalledTimes(1);

    // Resolve the request so the dangling promise doesn't leak.
    const sentMsg = w.postMessage.mock.calls[0]?.[0] as { id: string };
    w.emitMessage({
      id: sentMsg.id,
      type: "result",
      resultKind: "segment",
      bitmap: { close: () => undefined } as unknown as ImageBitmap,
      width: 1,
      height: 1,
      device: "wasm",
    });
    const result = await promise;
    expect(result.device).toBe("wasm");
  });

  it("rejects every pending call when the worker self-errors before ready", async () => {
    const { runAi, AiAbortError } = await import("./runtime").then(async (m) => {
      const types = await import("./types");
      return { ...m, AiAbortError: types.AiAbortError };
    });
    void AiAbortError;
    const promise = runAi(
      { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
      { transfer: [] },
    );

    const w = workerInstances[0]!;
    w.emitMessage({
      type: "self-error",
      message: "transformers.js failed to import",
    });
    await expect(promise).rejects.toThrow(/transformers\.js failed to import/);
    expect(w.terminate).toHaveBeenCalled();
  });

  it("rejects when the worker constructor itself throws (no module-worker support)", async () => {
    workerCtorThrows = new Error("module workers unsupported");
    const { runAi } = await loadRuntime();
    await expect(
      runAi(
        { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
        { transfer: [] },
      ),
    ).rejects.toThrow(/AI runtime couldn't start/);
  });

  it("times out when ready never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { runAi } = await loadRuntime();
      const promise = runAi(
        { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
        { transfer: [] },
      );
      // Attach an immediate catch so a delayed reject from the
      // workerReady promise (settled by the same timer that rejects
      // our pending call) doesn't show up as an unhandled rejection.
      promise.catch(() => undefined);
      // The runtime arms a 5 s timeout. Fast-forward past it.
      await vi.advanceTimersByTimeAsync(6000);
      await expect(promise).rejects.toThrow(/didn't finish loading|finish loading/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runtime — request lifecycle", () => {
  async function startReadyWorker() {
    const { runAi } = await loadRuntime();
    const issue = () =>
      runAi(
        { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
        { transfer: [] },
      );
    const first = issue();
    workerInstances[0]!.emitMessage({ type: "ready" });
    await new Promise((r) => setTimeout(r, 0));
    return { issue, first, w: workerInstances[0]! };
  }

  it("forwards progress events to the caller's onProgress callback", async () => {
    const { runAi } = await loadRuntime();
    const onProgress = vi.fn();
    const promise = runAi(
      { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
      { transfer: [], onProgress },
    );
    const w = workerInstances[0]!;
    w.emitMessage({ type: "ready" });
    await new Promise((r) => setTimeout(r, 0));
    const sentMsg = w.postMessage.mock.calls[0]?.[0] as { id: string };
    w.emitMessage({
      id: sentMsg.id,
      type: "progress",
      progress: { phase: "download", ratio: 0.42, label: "Downloading…" },
    });
    expect(onProgress).toHaveBeenCalledWith({
      phase: "download",
      ratio: 0.42,
      label: "Downloading…",
    });

    w.emitMessage({
      id: sentMsg.id,
      type: "result",
      resultKind: "segment",
      bitmap: { close: () => undefined } as unknown as ImageBitmap,
      width: 10,
      height: 10,
      device: "webgpu",
    });
    const result = await promise;
    expect(result.device).toBe("webgpu");
  });

  it("rejects on `error` frame for the matching id without terminating the worker", async () => {
    const { first, w } = await startReadyWorker();
    const sentMsg = w.postMessage.mock.calls[0]?.[0] as { id: string };
    w.emitMessage({
      id: sentMsg.id,
      type: "error",
      message: "shader compile failed on WebGPU",
      fatal: false,
    });
    await expect(first).rejects.toThrow(/shader compile/);
    expect(w.terminate).not.toHaveBeenCalled();
  });

  it("aborted signal mid-flight terminates worker AND rejects with AiAbortError", async () => {
    const { runAi } = await loadRuntime();
    const types = await import("./types");
    const ctrl = new AbortController();
    const promise = runAi(
      { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
      { transfer: [], signal: ctrl.signal },
    );
    const w = workerInstances[0]!;
    w.emitMessage({ type: "ready" });
    await new Promise((r) => setTimeout(r, 0));

    ctrl.abort();
    await expect(promise).rejects.toBeInstanceOf(types.AiAbortError);
    expect(w.terminate).toHaveBeenCalled();
  });

  it("AbortSignal already aborted before dispatch → rejects without spawning", async () => {
    const { runAi } = await loadRuntime();
    const types = await import("./types");
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      runAi(
        { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
        { transfer: [], signal: ctrl.signal },
      ),
    ).rejects.toBeInstanceOf(types.AiAbortError);
    expect(workerInstances).toHaveLength(0);
  });
});

describe("runtime — shutdownAiWorker", () => {
  it("rejects every in-flight call AND terminates the worker", async () => {
    const { runAi, shutdownAiWorker } = await loadRuntime();
    const types = await import("./types");
    const promise = runAi(
      { kind: "segment", bitmap: withFakeBitmap(), model: "x", dtype: "fp16", device: "auto" },
      { transfer: [] },
    );
    const w = workerInstances[0]!;
    w.emitMessage({ type: "ready" });
    await new Promise((r) => setTimeout(r, 0));

    shutdownAiWorker();
    await expect(promise).rejects.toBeInstanceOf(types.AiAbortError);
    expect(w.terminate).toHaveBeenCalled();
  });
});
