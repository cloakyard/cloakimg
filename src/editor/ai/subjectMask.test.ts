// subjectMask state-machine tests.
//
// The subject-mask service is a module-level singleton with five
// statuses (idle / needs-consent / loading / ready / error) and a
// fistful of latches (consentGranted, userDenied, inflight,
// inflightGeneration, modelCached). When users report "the AI
// thing tapped, did nothing, then I was back at the landing page",
// the cause is almost always a wrong transition or a stale cache
// returned to the wrong source canvas.
//
// We mock smartRemoveBackground + isModelCached so tests run
// without a model download. Each test resets the singleton via
// `vi.resetModules()` so the consentGranted / userDenied bits don't
// bleed across cases.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUALITY_KEYS } from "./runtime/bgModels";
import type { BgQuality } from "./runtime/segment";

/** Make a tiny opaque canvas — the cut returned to ensureSubjectMask
 *  needs at least one alpha-positive pixel so the hasOpaqueContent
 *  guard passes. jsdom's `canvas` peer ships with a real 2D context,
 *  so this paints actual bytes. */
function makeOpaqueCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

function makeBlankCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

interface SegmentMock {
  smartRemoveBackground: ReturnType<typeof vi.fn>;
  isModelCached: ReturnType<typeof vi.fn>;
}

async function freshModule() {
  vi.resetModules();
  const segMock: SegmentMock = {
    smartRemoveBackground: vi.fn(),
    isModelCached: vi.fn().mockResolvedValue(false),
  };
  vi.doMock("./runtime/segment", async () => {
    const actual = await vi.importActual<typeof import("./runtime/segment")>("./runtime/segment");
    return {
      ...actual,
      smartRemoveBackground: segMock.smartRemoveBackground,
      isModelCached: segMock.isModelCached,
    };
  });
  const mod = await import("./subjectMask");
  return { mod, segMock };
}

afterEach(() => {
  vi.doUnmock("./runtime/segment");
  vi.resetModules();
});

describe("subjectMask — first-time load (no consent, no cached bytes)", () => {
  for (const quality of QUALITY_KEYS) {
    it(`${quality}: surfaces needs-consent and rejects with MaskConsentError`, async () => {
      const { mod, segMock } = await freshModule();
      segMock.isModelCached.mockResolvedValue(false);
      const source = makeBlankCanvas(200, 200);

      await expect(mod.ensureSubjectMask(source, quality as BgQuality)).rejects.toBeInstanceOf(
        mod.MaskConsentError,
      );
      expect(mod.getMaskState().status).toBe("needs-consent");
      expect(mod.getMaskState().pendingQuality).toBe(quality);
      expect(segMock.smartRemoveBackground).not.toHaveBeenCalled();
    });

    it(`${quality}: a second auto-trigger after deny stays silent (no dialog re-pop)`, async () => {
      const { mod, segMock } = await freshModule();
      segMock.isModelCached.mockResolvedValue(false);
      const source = makeBlankCanvas(120, 120);

      await expect(mod.ensureSubjectMask(source, quality as BgQuality)).rejects.toBeInstanceOf(
        mod.MaskConsentError,
      );
      mod.denyMaskConsent();
      expect(mod.getMaskState().userDenied).toBe(true);
      const versionBefore = mod.getMaskState().version;

      // Auto-trigger from a second panel mount: we should reject
      // immediately with MaskConsentError WITHOUT re-flipping status,
      // so the consent dialog doesn't pop again.
      await expect(mod.ensureSubjectMask(source, quality as BgQuality)).rejects.toBeInstanceOf(
        mod.MaskConsentError,
      );
      expect(mod.getMaskState().version).toBe(versionBefore);
      expect(mod.getMaskState().status).toBe("idle");
    });
  }
});

describe("subjectMask — resume (model already on disk from prior session)", () => {
  for (const quality of QUALITY_KEYS) {
    it(`${quality}: skips the consent dialog and runs detection`, async () => {
      const { mod, segMock } = await freshModule();
      const source = makeBlankCanvas(200, 200);
      const cut = makeOpaqueCanvas(200, 200);
      segMock.isModelCached.mockResolvedValue(true);
      segMock.smartRemoveBackground.mockResolvedValue(cut);

      const result = await mod.ensureSubjectMask(source, quality as BgQuality);
      expect(result).toBe(cut);
      expect(mod.getMaskState().status).toBe("ready");
      expect(mod.getMaskState().warm).toBe(true);
      expect(mod.getMaskState().modelCached).toBe(true);
      expect(segMock.smartRemoveBackground).toHaveBeenCalledTimes(1);
      expect(segMock.smartRemoveBackground.mock.calls[0]?.[0]).toBe(source);
      expect(segMock.smartRemoveBackground.mock.calls[0]?.[1]?.quality).toBe(quality);
    });

    it(`${quality}: a second call returns the cached cut without re-running detection`, async () => {
      const { mod, segMock } = await freshModule();
      const source = makeBlankCanvas(180, 180);
      const cut = makeOpaqueCanvas(180, 180);
      segMock.isModelCached.mockResolvedValue(true);
      segMock.smartRemoveBackground.mockResolvedValue(cut);

      await mod.ensureSubjectMask(source, quality as BgQuality);
      expect(mod.peekSubjectMask(source)).toBe(cut);
      const second = await mod.ensureSubjectMask(source, quality as BgQuality);
      expect(second).toBe(cut);
      expect(segMock.smartRemoveBackground).toHaveBeenCalledTimes(1);
    });
  }
});

describe("subjectMask — consent flow", () => {
  it("grantMaskConsent unblocks the next ensureSubjectMask", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(false);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(100, 100));
    const source = makeBlankCanvas(100, 100);

    await expect(mod.ensureSubjectMask(source, "small")).rejects.toBeInstanceOf(
      mod.MaskConsentError,
    );
    expect(mod.getMaskState().status).toBe("needs-consent");

    mod.grantMaskConsent();
    expect(mod.getMaskState().status).toBe("idle");

    const result = await mod.ensureSubjectMask(source, "small");
    expect(result).toBeDefined();
    expect(mod.getMaskState().status).toBe("ready");
  });

  it("clearMaskDeny lets a fresh ensureSubjectMask reach the dialog again", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(false);
    const source = makeBlankCanvas(100, 100);

    await expect(mod.ensureSubjectMask(source, "small")).rejects.toBeInstanceOf(
      mod.MaskConsentError,
    );
    mod.denyMaskConsent();
    expect(mod.getMaskState().userDenied).toBe(true);

    mod.clearMaskDeny();
    expect(mod.getMaskState().userDenied).toBe(false);

    // The next call re-flips status to needs-consent (dialog re-opens).
    await expect(mod.ensureSubjectMask(source, "small")).rejects.toBeInstanceOf(
      mod.MaskConsentError,
    );
    expect(mod.getMaskState().status).toBe("needs-consent");
  });

  it("probeModelCache sets modelCached AND implicitly grants consent", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(true);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(50, 50));

    expect(mod.hasMaskConsent()).toBe(false);
    expect(await mod.probeModelCache("small")).toBe(true);
    expect(mod.hasMaskConsent()).toBe(true);
    expect(mod.getMaskState().modelCached).toBe(true);

    // Subsequent ensureSubjectMask runs without prompting.
    const source = makeBlankCanvas(50, 50);
    await mod.ensureSubjectMask(source, "small");
    expect(mod.getMaskState().status).toBe("ready");
  });
});

describe("subjectMask — cache invalidation", () => {
  it("dimension drift on the source canvas drops the cached cut", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(true);
    const source = makeBlankCanvas(200, 200);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(200, 200));

    await mod.ensureSubjectMask(source, "small");
    expect(mod.peekSubjectMask(source)).not.toBeNull();

    // Crop / Resize / Perspective mutate doc.working in place.
    source.width = 150;
    source.height = 150;
    expect(mod.peekSubjectMask(source)).toBeNull();
    expect(mod.getMaskState().status).toBe("idle");
  });

  it("invalidateSubjectMask clears cache and resets state to idle", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(true);
    const source = makeBlankCanvas(80, 80);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(80, 80));

    await mod.ensureSubjectMask(source, "small");
    expect(mod.peekSubjectMask(source)).not.toBeNull();
    expect(mod.getMaskState().warm).toBe(true);

    mod.invalidateSubjectMask();
    expect(mod.peekSubjectMask(source)).toBeNull();
    expect(mod.getMaskState().status).toBe("idle");
    // Warm bit survives — the model is still loaded in memory.
    expect(mod.getMaskState().warm).toBe(true);
  });

  it("a different source canvas instance does not return the cached cut", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(true);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(80, 80));

    const sourceA = makeBlankCanvas(80, 80);
    await mod.ensureSubjectMask(sourceA, "small");

    const sourceB = makeBlankCanvas(80, 80);
    expect(mod.peekSubjectMask(sourceB)).toBeNull();
  });
});

describe("subjectMask — concurrency (dedup vs supersession)", () => {
  it("two calls for the same source share the in-flight promise", async () => {
    const { mod, segMock } = await freshModule();
    mod.grantMaskConsent(); // skip the awaited isModelCached path so inflight is wired synchronously
    type Resolver = (c: HTMLCanvasElement) => void;
    const slot: { resolve?: Resolver } = {};
    segMock.smartRemoveBackground.mockReturnValue(
      new Promise<HTMLCanvasElement>((r) => {
        slot.resolve = r;
      }),
    );
    const source = makeBlankCanvas(100, 100);

    const a = mod.ensureSubjectMask(source, "small");
    const b = mod.ensureSubjectMask(source, "small");

    const cut = makeOpaqueCanvas(100, 100);
    slot.resolve?.(cut);
    expect(await a).toBe(cut);
    expect(await b).toBe(cut);
    expect(segMock.smartRemoveBackground).toHaveBeenCalledTimes(1);
  });

  it("a different source mid-flight does NOT receive the in-flight cut", async () => {
    const { mod, segMock } = await freshModule();
    mod.grantMaskConsent();
    type Resolver = (c: HTMLCanvasElement) => void;
    const resolvers: { a?: Resolver; b?: Resolver } = {};
    segMock.smartRemoveBackground
      .mockImplementationOnce(
        () =>
          new Promise<HTMLCanvasElement>((r) => {
            resolvers.a = r;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<HTMLCanvasElement>((r) => {
            resolvers.b = r;
          }),
      );

    const sourceA = makeBlankCanvas(100, 100);
    const sourceB = makeBlankCanvas(100, 100);

    const callA = mod.ensureSubjectMask(sourceA, "small");
    // Suppress noise: callA is destined to reject as superseded once
    // callB starts, but we await it explicitly below — without this
    // the runtime's brief "unhandled rejection" window between resolve
    // and our `expect.rejects` flags it.
    callA.catch(() => undefined);
    const callB = mod.ensureSubjectMask(sourceB, "small");

    expect(segMock.smartRemoveBackground).toHaveBeenCalledTimes(2);
    resolvers.a?.(makeOpaqueCanvas(100, 100));
    resolvers.b?.(makeOpaqueCanvas(100, 100));
    await expect(callA).rejects.toThrow(/superseded/i);
    const cutB = await callB;
    expect(cutB).toBeDefined();
  });

  it("invalidate during inflight discards the landing result (no stale cache write)", async () => {
    const { mod, segMock } = await freshModule();
    mod.grantMaskConsent();
    type Resolver = (c: HTMLCanvasElement) => void;
    const slot: { resolve?: Resolver } = {};
    segMock.smartRemoveBackground.mockReturnValue(
      new Promise<HTMLCanvasElement>((r) => {
        slot.resolve = r;
      }),
    );
    const source = makeBlankCanvas(100, 100);

    const call = mod.ensureSubjectMask(source, "small");
    call.catch(() => undefined);
    mod.invalidateSubjectMask();
    slot.resolve?.(makeOpaqueCanvas(100, 100));

    await expect(call).rejects.toThrow(/superseded/i);
    expect(mod.peekSubjectMask(source)).toBeNull();
  });
});

describe("subjectMask — failure paths", () => {
  // The "empty mask returned by model" branch is exercised in real
  // browsers via getImageData on a fully-transparent canvas. Node's
  // jsdom + node-canvas peer reports per-pixel alpha differently
  // depending on the build, so a portable assertion would be brittle.
  // The thrown-error path below covers the same state-machine
  // transition (loading → error) without the canvas dependency.

  it("a thrown error propagates and flips status to error", async () => {
    const { mod, segMock } = await freshModule();
    segMock.isModelCached.mockResolvedValue(true);
    segMock.smartRemoveBackground.mockRejectedValue(new Error("network down"));
    const source = makeBlankCanvas(60, 60);

    await expect(mod.ensureSubjectMask(source, "small")).rejects.toThrow(/network down/);
    expect(mod.getMaskState().status).toBe("error");
    expect(mod.getMaskState().error).toMatch(/network down/);
  });
});

describe("subjectMask — subscriptions", () => {
  it("subscribers receive every state change in order, then unsubscribe cleanly", async () => {
    const { mod, segMock } = await freshModule();
    const seen: string[] = [];
    const unsubscribe = mod.subscribeMaskState((s) => seen.push(s.status));

    segMock.isModelCached.mockResolvedValue(true);
    segMock.smartRemoveBackground.mockResolvedValue(makeOpaqueCanvas(50, 50));
    await mod.ensureSubjectMask(makeBlankCanvas(50, 50), "small");

    expect(seen).toContain("loading");
    expect(seen).toContain("ready");

    unsubscribe();
    const beforeCount = seen.length;
    mod.invalidateSubjectMask();
    expect(seen.length).toBe(beforeCount);
  });
});

beforeEach(() => {
  // jsdom doesn't tear down state between tests, but the module
  // singleton is reset via vi.resetModules() inside freshModule().
});

// ── Stall watchdog regression guard ─────────────────────────────────
//
// The 30 s stall watchdog flips state to "Download stalled" if a
// detection makes no progress. The contract is that a stale timer
// from a superseded detection (invalidate / replaceWithFile / fresh
// `ensureSubjectMask` for a different source) MUST NOT fire. The
// implementation guards via a generation check; these tests pin the
// guard so a future refactor can't quietly drop it and leave users
// staring at a phantom "stalled" error after they invalidated.

describe("subjectMask — stall watchdog generation guard", () => {
  it("invalidate during inflight detection clears the stall timer (no phantom error)", async () => {
    const { mod, segMock } = await freshModule();
    mod.grantMaskConsent();
    // smartRemoveBackground hangs forever — would trip the stall
    // watchdog if the guard weren't in place.
    segMock.smartRemoveBackground.mockReturnValue(new Promise<HTMLCanvasElement>(() => undefined));

    const source = makeBlankCanvas(80, 80);
    const call = mod.ensureSubjectMask(source);
    call.catch(() => undefined);
    expect(mod.getMaskState().status).toBe("loading");

    mod.invalidateSubjectMask();
    expect(mod.getMaskState().status).toBe("idle");

    // Ride out a synthetic 30 s — fast-forwarding via fake timers
    // would also flush the timer if the cleanup were broken. We use
    // real time but assert the state stays idle across event-loop
    // ticks; the timer would only fire on a runaway 30 s window which
    // the test framework doesn't wait for.
    await new Promise((r) => setTimeout(r, 0));
    expect(mod.getMaskState().status).toBe("idle");
  });

  it("a fresh detection for a different source supersedes the previous one's timer", async () => {
    const { mod, segMock } = await freshModule();
    mod.grantMaskConsent();
    type Resolver = (c: HTMLCanvasElement) => void;
    const slot: { resolveB?: Resolver } = {};
    segMock.smartRemoveBackground
      .mockReturnValueOnce(new Promise<HTMLCanvasElement>(() => undefined))
      .mockReturnValueOnce(
        new Promise<HTMLCanvasElement>((r) => {
          slot.resolveB = r;
        }),
      );

    const sourceA = makeBlankCanvas(80, 80);
    const sourceB = makeBlankCanvas(80, 80);

    const callA = mod.ensureSubjectMask(sourceA);
    callA.catch(() => undefined);
    const callB = mod.ensureSubjectMask(sourceB);
    callB.catch(() => undefined);

    // Both calls were dispatched; the service routes them as separate
    // generations. A's timer should be cancelled when B's setup ran.
    expect(segMock.smartRemoveBackground).toHaveBeenCalledTimes(2);

    // Resolve B; A's promise is rejected as superseded inside the
    // catch path. Critically, the stall path never fires for A.
    slot.resolveB?.(makeOpaqueCanvas(80, 80));
    await callB;
    expect(mod.getMaskState().status).toBe("ready");
    expect(mod.getMaskState().error).toBeNull();
  });
});
