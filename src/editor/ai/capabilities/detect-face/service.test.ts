// service.test.ts — Face-detect service facade. The state-machine
// itself is exercised in capability/service.test.ts; this file pins
// what's *unique* to face detection:
//
//   • The localStorage consent marker (`cloakimg:detect-face:consented`)
//     is the only face-specific persistence we have. Same-origin model
//     bytes don't have a useful CacheStorage probe, so the marker
//     stands in for "user has consented in any prior session".
//   • The runner forwards the right shape (modelUrl, wasmBaseUrl,
//     device hint) to the main-thread MediaPipe runner.
//   • markFaceConsented fires after a successful inference (so the
//     dialog won't re-pop the next session even if the user accepted
//     "implicitly" via clicking Faces rather than the consent button).
//
// Face detection runs on the main thread (MediaPipe Tasks Web doesn't
// work in module workers — see runner.ts). The service hands the
// CapabilityService primitive a runner that calls runFaceDetect
// directly; we mock runFaceDetect at the module boundary so no actual
// MediaPipe SDK / WASM init / network fetch fires.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runFaceDetectMock = vi.hoisted(() => vi.fn());
vi.mock("./runner", () => ({
  runFaceDetect: runFaceDetectMock,
}));

beforeEach(() => {
  // Each test gets a clean module graph + a clean localStorage so
  // the singleton CapabilityService inside service.ts starts from
  // zero state and the persistent consent flag doesn't leak across.
  vi.resetModules();
  runFaceDetectMock.mockReset();
  try {
    localStorage.clear();
  } catch {
    // jsdom occasionally rejects clear() in cross-site iframe sims;
    // the resetModules + re-import below is enough for isolation.
  }
});

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Best-effort cleanup.
  }
});

function makeCanvas(width = 100, height = 100): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

describe("detect-face service — consent persistence", () => {
  it("hasFaceConsent is false on a clean session", async () => {
    const svc = await import("./service");
    expect(svc.hasFaceConsent()).toBe(false);
  });

  it("grantFaceConsent marks the localStorage flag", async () => {
    const svc = await import("./service");
    svc.grantFaceConsent();
    expect(localStorage.getItem("cloakimg:detect-face:consented")).toBe("1");
    expect(svc.hasFaceConsent()).toBe(true);
  });

  it("clearFaceConsent removes the flag", async () => {
    const svc = await import("./service");
    svc.grantFaceConsent();
    svc.clearFaceConsent();
    expect(localStorage.getItem("cloakimg:detect-face:consented")).toBeNull();
  });

  it("a prior-session consent flag is honoured on fresh module load", async () => {
    // Simulate a returning user — the flag was set last session,
    // localStorage persists, today's first hasFaceConsent() must
    // return true without an explicit grant.
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    const svc = await import("./service");
    expect(svc.hasFaceConsent()).toBe(true);
  });

  it("probeFaceConsent reflects the flag and updates state.modelCached", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    const svc = await import("./service");
    const cached = await svc.probeFaceConsent();
    expect(cached).toBe(true);
    expect(svc.getFaceState().modelCached).toBe(true);
  });
});

describe("detect-face service — runner forwards the right request shape", () => {
  it("ensureFaceDetections invokes runFaceDetect with the BlazeFace model + WASM base URLs", async () => {
    // Pre-grant consent so the run() call goes straight to inference
    // rather than gating on the consent dialog.
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    const expectedFaces = [{ x: 10, y: 10, width: 30, height: 30, score: 0.95 }];
    runFaceDetectMock.mockResolvedValueOnce({ faces: expectedFaces, device: "wasm" });

    const svc = await import("./service");
    const source = makeCanvas();
    const result = await svc.ensureFaceDetections(source);

    expect(result).toEqual(expectedFaces);
    expect(runFaceDetectMock).toHaveBeenCalledTimes(1);
    const args = runFaceDetectMock.mock.calls[0]?.[0] as {
      source: HTMLCanvasElement;
      modelUrl: string;
      wasmBaseUrl: string;
      device: string;
    };
    // BlazeFace model is bundled same-origin under public/models/face/.
    expect(args.modelUrl).toBe("/models/face/blaze_face_full_range.tflite");
    // FilesetResolver pulls the MediaPipe Tasks WASM bundle from a
    // version-pinned jsdelivr URL (no user pixels cross this boundary).
    expect(args.wasmBaseUrl).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@[\d.]+\/wasm$/,
    );
    expect(args.device).toBe("auto");
    expect(args.source).toBe(source);
  });

  it("propagates a runner error so the service flips to the error state", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    runFaceDetectMock.mockRejectedValueOnce(new Error("MediaPipe init crashed"));
    const svc = await import("./service");
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toThrow(/MediaPipe init crashed/);
    expect(svc.getFaceState().status).toBe("error");
  });

  it("a successful detection writes the consent flag (idempotent re-mark)", async () => {
    // Pin that the runner calls markFaceConsented on every success
    // path — defensive against a user who cleared site data
    // mid-session. We spy on localStorage.setItem to observe the
    // mark independently of whether the flag was already set.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    runFaceDetectMock.mockResolvedValueOnce({ faces: [], device: "wasm" });

    const svc = await import("./service");
    const source = makeCanvas();
    setItemSpy.mockClear();
    await svc.ensureFaceDetections(source);
    expect(setItemSpy).toHaveBeenCalledWith("cloakimg:detect-face:consented", "1");
    setItemSpy.mockRestore();
  });
});

describe("detect-face service — peek + invalidate + cancel forward to the underlying service", () => {
  it("peek returns null on a fresh service before any detection", async () => {
    const svc = await import("./service");
    expect(svc.peekFaceDetections(makeCanvas())).toBeNull();
  });

  it("peek returns the cached face list after a successful detection", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    const faces = [{ x: 5, y: 5, width: 20, height: 20, score: 0.9 }];
    runFaceDetectMock.mockResolvedValueOnce({ faces, device: "wasm" });

    const svc = await import("./service");
    const source = makeCanvas();
    await svc.ensureFaceDetections(source);
    expect(svc.peekFaceDetections(source)).toEqual(faces);
    // Different canvas → cache miss.
    expect(svc.peekFaceDetections(makeCanvas())).toBeNull();
  });

  it("invalidateFaceDetection drops the cache + flips state to idle", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    runFaceDetectMock.mockResolvedValueOnce({
      faces: [{ x: 1, y: 1, width: 5, height: 5, score: 0.7 }],
      device: "wasm",
    });

    const svc = await import("./service");
    const source = makeCanvas();
    await svc.ensureFaceDetections(source);
    expect(svc.peekFaceDetections(source)).not.toBeNull();
    svc.invalidateFaceDetection();
    expect(svc.peekFaceDetections(source)).toBeNull();
    expect(svc.getFaceState().status).toBe("idle");
  });

  it("subscribeFaceState fires for every state transition", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    runFaceDetectMock.mockResolvedValueOnce({ faces: [], device: "wasm" });

    const svc = await import("./service");
    const observed: string[] = [];
    const unsub = svc.subscribeFaceState((s) => observed.push(s.status));
    await svc.ensureFaceDetections(makeCanvas());
    unsub();
    // We must have seen at least loading → ready.
    expect(observed).toContain("loading");
    expect(observed).toContain("ready");
  });
});

describe("detect-face service — consent gate", () => {
  it("first call without a prior consent flag throws CapabilityConsentError + flips status", async () => {
    const svc = await import("./service");
    const { CapabilityConsentError } = await import("../../capability/service");
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toBeInstanceOf(
      CapabilityConsentError,
    );
    expect(svc.getFaceState().status).toBe("needs-consent");
  });

  it("denyFaceConsent latches userDenied so re-runs stay quiet", async () => {
    const svc = await import("./service");
    const { CapabilityConsentError } = await import("../../capability/service");
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toBeInstanceOf(
      CapabilityConsentError,
    );
    svc.denyFaceConsent();
    expect(svc.getFaceState().userDenied).toBe(true);
    // Subsequent ensure call still rejects but the latch keeps the
    // dialog from re-popping (status stays at the latched state).
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toBeInstanceOf(
      CapabilityConsentError,
    );
  });

  it("clearFaceDeny resets the latch so the next call re-opens the dialog", async () => {
    const svc = await import("./service");
    const { CapabilityConsentError } = await import("../../capability/service");
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toBeInstanceOf(
      CapabilityConsentError,
    );
    svc.denyFaceConsent();
    svc.clearFaceDeny();
    expect(svc.getFaceState().userDenied).toBe(false);
    await expect(svc.ensureFaceDetections(makeCanvas())).rejects.toBeInstanceOf(
      CapabilityConsentError,
    );
    expect(svc.getFaceState().status).toBe("needs-consent");
  });

  it("requestFaceTierPicker forces needs-consent even when already granted", async () => {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
    const svc = await import("./service");
    expect(svc.hasFaceConsent()).toBe(true);
    svc.requestFaceTierPicker();
    expect(svc.getFaceState().status).toBe("needs-consent");
    expect(svc.getFaceState().pendingTierId).toBe("standard");
  });
});
