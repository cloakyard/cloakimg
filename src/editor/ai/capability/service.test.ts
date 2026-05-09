// service.test.ts — Exercises the generic CapabilityService state
// machine. Every transition the segmentation flow relies on is pinned
// here so a future capability that uses these primitives inherits the
// same battle-tested behaviour:
//
//   • idle → needs-consent → loading → ready (consent flow)
//   • idle → loading → ready (already-cached fast path)
//   • idle → needs-consent → idle (deny latch)
//   • idle → loading → error (validator rejection, runner throw)
//   • Concurrent dedup (same source → one promise)
//   • Cache: dim drift invalidates
//   • Cache: source identity swap invalidates
//   • Generation counter: in-flight superseded by invalidate
//   • Stall watchdog fires after configured timeout
//   • waitForResolution resolves on ready, rejects on deny
//   • onResultDropped called for evicted / superseded results
//
// The runner is a stub — capabilities provide their own; the service
// doesn't care what the inference does, only that it returns a result
// and respects the abort signal + onProgress callback.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityAbortError, CapabilityConsentError, CapabilityService } from "./service";
import type { CapabilityFamily, CapabilityState, CapabilityTier } from "./types";

interface StubResult {
  marker: string;
  width: number;
  height: number;
}

const TIER_SMALL: CapabilityTier<{ stub: true }> = {
  id: "small",
  index: 0,
  label: "Fast",
  mb: 1,
  bytes: 1024 * 1024,
  strength: "Quickest.",
  tradeoff: "Lowest fidelity.",
  runtimeRef: { stub: true },
};

const TIER_MEDIUM: CapabilityTier<{ stub: true }> = {
  id: "medium",
  index: 1,
  label: "Better",
  mb: 2,
  bytes: 2 * 1024 * 1024,
  strength: "Sharper.",
  tradeoff: "Bigger.",
  runtimeRef: { stub: true },
};

const STUB_FAMILY: CapabilityFamily = {
  id: "stub",
  kind: "segment",
  label: "Stub",
  inferenceLongEdge: 1024,
  tiers: [TIER_SMALL, TIER_MEDIUM],
  consent: {
    title: "Download stub",
    switchTitle: "Switch stub",
    body: "Stub body.",
    switchBody: "Switch body.",
    privacy: ["Stays on device.", "Cached after first use."],
    downloadVerb: "Download",
    useVerb: "Use",
  },
  status: {
    inProgressLabel: "Stubbing…",
    connectingLabel: "Connecting…",
    readyMessage: "Ready.",
    pausedMessage: "Paused.",
  },
};

/** Make a fresh canvas. We never actually paint pixels — the service
 *  only reads `width` and `height` for cache-validity checks. */
function makeCanvas(width = 100, height = 100): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Build a service with a configurable runner. Returns the service
 *  plus convenience helpers (state snapshots, runner control, settle
 *  helper). */
function buildService(
  opts: {
    isCached?: () => Promise<boolean>;
    validate?: (r: StubResult) => { ok: true; value: StubResult } | { ok: false; error: string };
    stallTimeoutMs?: number;
    onResultDropped?: (r: StubResult) => void;
  } = {},
) {
  const { isCached = async () => false, validate, stallTimeoutMs, onResultDropped } = opts;
  const service = new CapabilityService<StubResult>({
    family: STUB_FAMILY,
    isTierCached: isCached,
    ...(validate !== undefined ? { validate } : {}),
    ...(onResultDropped !== undefined ? { onResultDropped } : {}),
    ...(stallTimeoutMs !== undefined ? { stall: { timeoutMs: stallTimeoutMs } } : {}),
  });
  const observed: CapabilityState<StubResult>[] = [];
  service.subscribe((s) => observed.push(s));
  return { service, observed };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CapabilityService — consent flow", () => {
  it("idle → needs-consent → throws on first run with no on-disk cache", async () => {
    const { service } = buildService();
    const source = makeCanvas();

    const promise = service.run(source, TIER_SMALL, async () => ({
      marker: "x",
      width: 1,
      height: 1,
    }));
    await expect(promise).rejects.toBeInstanceOf(CapabilityConsentError);
    expect(service.getState().status).toBe("needs-consent");
    expect(service.getState().pendingTierId).toBe("small");
  });

  it("after grantConsent, run() proceeds to ready", async () => {
    const { service } = buildService();
    const source = makeCanvas();

    // First call surfaces the consent gate.
    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 1, height: 1 })),
    ).rejects.toBeInstanceOf(CapabilityConsentError);

    service.grantConsent();
    const result = await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    expect(result.marker).toBe("y");
    expect(service.getState().status).toBe("ready");
    expect(service.getState().warm).toBe(true);
  });

  it("denyConsent latches state.userDenied so re-runs stay quiet", async () => {
    const { service } = buildService();
    const source = makeCanvas();

    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 1, height: 1 })),
    ).rejects.toBeInstanceOf(CapabilityConsentError);

    service.denyConsent();
    expect(service.getState().userDenied).toBe(true);

    // Subsequent run() must still throw consent error but NOT re-flip
    // status — that re-pop loop is exactly what the deny latch
    // prevents.
    const versionBefore = service.getState().version;
    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 1, height: 1 })),
    ).rejects.toBeInstanceOf(CapabilityConsentError);
    // version should be unchanged because the deny-latched branch
    // throws without touching state.
    expect(service.getState().version).toBe(versionBefore);
  });

  it("clearDeny() re-enables future runs to surface the consent dialog", async () => {
    const { service } = buildService();
    const source = makeCanvas();

    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 1, height: 1 })),
    ).rejects.toBeInstanceOf(CapabilityConsentError);
    service.denyConsent();
    service.clearDeny();
    expect(service.getState().userDenied).toBe(false);

    // Now the next run() should re-flip status to needs-consent.
    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 1, height: 1 })),
    ).rejects.toBeInstanceOf(CapabilityConsentError);
    expect(service.getState().status).toBe("needs-consent");
  });

  it("cached-on-disk tier counts as implicit consent — no dialog", async () => {
    const { service } = buildService({ isCached: async () => true });
    const source = makeCanvas();

    const result = await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 1,
      height: 1,
    }));
    expect(result.marker).toBe("y");
    expect(service.getState().status).toBe("ready");
    // We never flipped to needs-consent — the disk hit counted as
    // implicit consent.
    // The hasConsent() flag is internal but `state.modelCached` is
    // surfaced; verify it reflects truth.
    expect(service.getState().modelCached).toBe(true);
  });

  it("requestTierPicker forces needs-consent even when already granted", async () => {
    const { service } = buildService();
    service.grantConsent();
    service.requestTierPicker("medium");
    expect(service.getState().status).toBe("needs-consent");
    expect(service.getState().pendingTierId).toBe("medium");
  });
});

describe("CapabilityService — cache identity", () => {
  it("peek returns the cached result on identity hit", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();
    const result = await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    expect(service.peek(source)).toBe(result);
  });

  it("dimension drift invalidates the cache in place", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas(100, 100);
    await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    expect(service.peek(source)).not.toBeNull();

    // Simulate an in-place crop that mutates the canvas dimensions.
    source.width = 50;
    source.height = 50;
    expect(service.peek(source)).toBeNull();
    // The status should have flipped to idle so subscribed UI clears.
    expect(service.getState().status).toBe("idle");
  });

  it("a different source canvas instance bypasses the cache", async () => {
    const { service } = buildService();
    service.grantConsent();
    const sourceA = makeCanvas();
    const sourceB = makeCanvas();
    await service.run(sourceA, TIER_SMALL, async () => ({
      marker: "a",
      width: 100,
      height: 100,
    }));
    expect(service.peek(sourceB)).toBeNull();
    // Cache for A should still be intact.
    expect(service.peek(sourceA)).not.toBeNull();
  });

  it("invalidate drops cache + bumps generation but keeps consent", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();
    await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    expect(service.peek(source)).not.toBeNull();
    service.invalidate();
    expect(service.peek(source)).toBeNull();
    expect(service.getState().status).toBe("idle");
    // hasConsent stays true — the user shouldn't have to re-consent
    // just because the doc was reset.
    expect(service.hasConsent()).toBe(true);
  });

  it("peekExtra/setExtra round-trip on the cached entry only", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();
    await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    service.setExtra(source, { downsamples: new Map([[256, "stub"]]) });
    const extra = service.peekExtra<{ downsamples: Map<number, string> }>(source);
    expect(extra?.downsamples.get(256)).toBe("stub");

    // Different source → no extra.
    const other = makeCanvas();
    expect(service.peekExtra(other)).toBeNull();
  });
});

describe("CapabilityService — concurrent dedup", () => {
  it("two run() calls for the same source share one in-flight promise", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();

    let runs = 0;
    const runner = async (): Promise<StubResult> => {
      runs += 1;
      // Yield once so the two run() callers both await before the
      // runner resolves.
      await new Promise((r) => setTimeout(r, 0));
      return { marker: "y", width: 100, height: 100 };
    };

    const p1 = service.run(source, TIER_SMALL, runner);
    const p2 = service.run(source, TIER_SMALL, runner);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(runs).toBe(1);
  });

  it("run() for a different source while one is in-flight supersedes the first", async () => {
    // Documented contract (carried over from subjectMask.ts): a
    // detection on a *different* source while one is in-flight bumps
    // the generation counter, which causes the first detection's
    // eventual result to be dropped as "superseded". The runner
    // itself still runs to completion (we don't abort the worker —
    // those bytes are already paid for) but the result never lands
    // in the cache. Only the second detection's result is cached.
    const { service } = buildService();
    service.grantConsent();
    const sourceA = makeCanvas(50, 50);
    const sourceB = makeCanvas(60, 60);

    let runsA = 0;
    let runsB = 0;
    const runnerA = async (): Promise<StubResult> => {
      runsA += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { marker: "a", width: 50, height: 50 };
    };
    const runnerB = async (): Promise<StubResult> => {
      runsB += 1;
      return { marker: "b", width: 60, height: 60 };
    };

    const pA = service.run(sourceA, TIER_SMALL, runnerA);
    const pB = service.run(sourceB, TIER_SMALL, runnerB);
    // Attach a quiet catch on pA so the supersession rejection
    // doesn't surface as an unhandled-rejection in the runner.
    pA.catch(() => undefined);

    await expect(pA).rejects.toThrow(/superseded/);
    const rB = await pB;
    expect(rB.marker).toBe("b");
    expect(runsA).toBe(1);
    expect(runsB).toBe(1);
    // Cache should reflect B only.
    expect(service.peek(sourceA)).toBeNull();
    expect(service.peek(sourceB)).not.toBeNull();
  });
});

describe("CapabilityService — generation counter", () => {
  it("invalidate() during inflight discards the result on completion", async () => {
    const onDropped = vi.fn();
    const { service } = buildService({ onResultDropped: onDropped });
    service.grantConsent();
    const source = makeCanvas();

    let resolveRunner!: (v: StubResult) => void;
    const runner = (): Promise<StubResult> =>
      new Promise<StubResult>((resolve) => {
        resolveRunner = resolve;
      });

    const promise = service.run(source, TIER_SMALL, runner);
    // Mid-flight: doc swap.
    service.invalidate();
    // Now the runner finally lands.
    resolveRunner({ marker: "stale", width: 100, height: 100 });

    await expect(promise).rejects.toThrow(/superseded/);
    // Stale result should have been dropped.
    expect(onDropped).toHaveBeenCalledTimes(1);
    // Cache should be empty.
    expect(service.peek(source)).toBeNull();
  });
});

describe("CapabilityService — error paths", () => {
  it("runner rejection lands as state.error", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();

    const err = new Error("model fetch failed");
    await expect(
      service.run(source, TIER_SMALL, async () => {
        throw err;
      }),
    ).rejects.toThrow(/model fetch failed/);
    expect(service.getState().status).toBe("error");
    expect(service.getState().error).toBe("model fetch failed");
  });

  it("validator rejection sets a friendly error and drops the result", async () => {
    const onDropped = vi.fn();
    const { service } = buildService({
      validate: () => ({ ok: false, error: "No subject detected." }),
      onResultDropped: onDropped,
    });
    service.grantConsent();
    const source = makeCanvas();
    await expect(
      service.run(source, TIER_SMALL, async () => ({ marker: "x", width: 100, height: 100 })),
    ).rejects.toThrow(/No subject detected/);
    expect(service.getState().status).toBe("error");
    expect(service.getState().error).toBe("No subject detected.");
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("AiAbortError-named throw propagates as user cancel — no error state", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();
    await expect(
      service.run(source, TIER_SMALL, async () => {
        throw new CapabilityAbortError();
      }),
    ).rejects.toThrow(/aborted/);
    // Aborted intentionally does NOT flip state to "error" — the cancel
    // path is the user's choice, not a failure.
    expect(service.getState().status).not.toBe("error");
  });
});

describe("CapabilityService — cancel + watchdog", () => {
  // We capture the signal / progress-callback the service hands the
  // runner via mutable container objects rather than naked `let`
  // bindings — TS 6's closure-capture flow analysis narrows reassigned
  // `let`s to their init type and then to never at use sites, even
  // though the runtime mutation does land. The `{ current }` pattern
  // is structurally inert from TS's POV and types correctly.

  it("cancel() during inflight aborts the runner's signal and resets status", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();

    const sig: { current: AbortSignal | null } = { current: null };
    const runner = (args: { signal: AbortSignal }): Promise<StubResult> => {
      sig.current = args.signal;
      return new Promise<StubResult>((_, reject) => {
        args.signal.addEventListener("abort", () => reject(new CapabilityAbortError()));
      });
    };

    const promise = service.run(source, TIER_SMALL, runner);
    expect(service.getState().status).toBe("loading");
    service.cancel();
    await expect(promise).rejects.toThrow(/aborted/);
    expect(sig.current?.aborted).toBe(true);
    expect(service.getState().status).toBe("idle");
  });

  it("stall watchdog fires after timeout with no progress", async () => {
    vi.useFakeTimers();
    const { service } = buildService({ stallTimeoutMs: 100 });
    service.grantConsent();
    const source = makeCanvas();

    const sig: { current: AbortSignal | null } = { current: null };
    const runner = (args: { signal: AbortSignal }): Promise<StubResult> => {
      sig.current = args.signal;
      return new Promise<StubResult>((_, reject) => {
        args.signal.addEventListener("abort", () => reject(new CapabilityAbortError()));
      });
    };

    const promise = service.run(source, TIER_SMALL, runner);
    promise.catch(() => undefined);
    expect(service.getState().status).toBe("loading");

    await vi.advanceTimersByTimeAsync(150);

    expect(service.getState().status).toBe("error");
    expect(service.getState().error).toMatch(/stalled/i);
    expect(sig.current?.aborted).toBe(true);
    await expect(promise).rejects.toBeTruthy();
  });

  it("stall watchdog re-arms on every progress event (slow-but-progressing download)", async () => {
    vi.useFakeTimers();
    const { service } = buildService({ stallTimeoutMs: 100 });
    service.grantConsent();
    const source = makeCanvas();

    type ProgressCb = (p: { phase: "download"; ratio: number; label: string }) => void;
    const cb: { current: ProgressCb | null } = { current: null };
    let resolveRunner!: (v: StubResult) => void;
    const runner = (args: { onProgress: ProgressCb }): Promise<StubResult> => {
      cb.current = args.onProgress;
      return new Promise<StubResult>((resolve) => {
        resolveRunner = resolve;
      });
    };

    const promise = service.run(source, TIER_SMALL, runner);
    promise.catch(() => undefined);

    // Advance partway, tick progress, advance again — the watchdog
    // should NOT fire because progress arrived in time.
    await vi.advanceTimersByTimeAsync(80);
    cb.current?.({ phase: "download", ratio: 0.4, label: "..." });
    await vi.advanceTimersByTimeAsync(80);

    expect(service.getState().status).toBe("loading"); // not "error"
    resolveRunner({ marker: "y", width: 100, height: 100 });
    await promise;
    expect(service.getState().status).toBe("ready");
  });
});

describe("CapabilityService — waitForResolution", () => {
  // waitForResolution is the smart-action helper: a click that needs
  // a result waits across the consent dialog + download + inference.
  // It MUST be called only AFTER an operation is in flight — calling
  // it on idle state is interpreted as "the operation has settled
  // without producing a result for this source" and rejects
  // immediately. Tests below set up the operation first.

  it("resolves with the result once status flips to ready", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();

    // Synchronous portion of run() flips state to "loading" because
    // consent is already granted (skipping the await on isTierCached).
    const run = service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    const wait = service.waitForResolution(source, "small");
    await run;
    const resolved = await wait;
    expect(resolved.marker).toBe("y");
  });

  it("rejects with CapabilityConsentError when the user dismisses", async () => {
    const { service } = buildService();
    const source = makeCanvas();

    // Kick off the run. The consent gate awaits isTierCached(), so we
    // need to flush a macrotask before state reaches "needs-consent".
    const run = service
      .run(source, TIER_SMALL, async () => ({
        marker: "x",
        width: 1,
        height: 1,
      }))
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(service.getState().status).toBe("needs-consent");

    const wait = service.waitForResolution(source, "small");
    service.denyConsent();
    await expect(wait).rejects.toBeInstanceOf(CapabilityConsentError);
    await run;
  });

  it("rejects when the operation lands in error state", async () => {
    const { service } = buildService();
    service.grantConsent();
    const source = makeCanvas();

    const run = service
      .run(source, TIER_SMALL, async () => {
        throw new Error("boom");
      })
      .catch(() => undefined);
    const wait = service.waitForResolution(source, "small");
    await run;
    await expect(wait).rejects.toThrow(/boom|Detection failed/);
  });
});

describe("CapabilityService — onResultDropped lifecycle hook", () => {
  it("called when a fresh result evicts the previous cached entry", async () => {
    const onDropped = vi.fn();
    const { service } = buildService({ onResultDropped: onDropped });
    service.grantConsent();

    const sourceA = makeCanvas(50, 50);
    await service.run(sourceA, TIER_SMALL, async () => ({
      marker: "a",
      width: 50,
      height: 50,
    }));

    // A fresh detection on a different source replaces the cache.
    const sourceB = makeCanvas(60, 60);
    await service.run(sourceB, TIER_SMALL, async () => ({
      marker: "b",
      width: 60,
      height: 60,
    }));
    expect(onDropped).toHaveBeenCalledWith(expect.objectContaining({ marker: "a" }));
  });

  it("called when invalidate() drops the cache", async () => {
    const onDropped = vi.fn();
    const { service } = buildService({ onResultDropped: onDropped });
    service.grantConsent();
    const source = makeCanvas();
    await service.run(source, TIER_SMALL, async () => ({
      marker: "y",
      width: 100,
      height: 100,
    }));
    service.invalidate();
    expect(onDropped).toHaveBeenCalledWith(expect.objectContaining({ marker: "y" }));
  });
});
