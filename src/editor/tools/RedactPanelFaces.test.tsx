// RedactPanelFaces.test.tsx — Integration tests for the Smart
// Anonymize "Faces" button. Covers the wiring between the panel,
// the detect-face service facade, and applyRedaction:
//
//   • The Faces button is rendered (3-up alongside Person / Scene).
//   • Clicking it triggers ensureFaceDetections via requestExplicit.
//   • A successful detection commits a history entry whose label
//     reflects the count.
//   • A no-faces detection surfaces a friendly inline error rather
//     than committing an empty bake.
//   • The button respects busy state (disabled while another smart
//     action is running).
//
// We mock the main-thread MediaPipe runner (runFaceDetect) so the
// test never touches the real Tasks Web SDK / WASM. The panel +
// service + RedactPanel state machine all run for real.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolState } from "../toolState";
import { DEFAULT_TOOL_STATE } from "../toolState";

const harness = vi.hoisted(() => {
  const placeholder = { width: 1, height: 1, working: undefined as unknown as HTMLCanvasElement };
  // beforeEach assigns a real ToolState shape — vi.hoisted runs
  // before module imports resolve, so we can't reference
  // DEFAULT_TOOL_STATE here. The placeholder cast keeps TS happy
  // until the real value lands.
  return {
    doc: placeholder,
    toolState: {} as ToolState,
    patchTool: vi.fn(),
    commit: vi.fn(),
    runFaceDetect: vi.fn(),
    /** What the panel will see when it calls peekLastCommitLabel.
     *  Set per test to simulate the prior bake state. */
    lastCommitLabel: null as string | null,
    undo: vi.fn(),
  };
});

vi.mock("../EditorContext", () => ({
  useEditor: () => ({
    doc: harness.doc,
    toolState: harness.toolState,
    patchTool: harness.patchTool,
    commit: harness.commit,
    layout: "desktop",
    peekLastCommitLabel: () => harness.lastCommitLabel,
    undo: harness.undo,
  }),
  useEditorReadOnly: () => ({
    doc: harness.doc,
    layout: "desktop",
    loading: false,
    busyLabel: null,
    error: null,
  }),
  useEditorActions: () => ({
    patchTool: harness.patchTool,
  }),
  useToolState: () => harness.toolState,
}));

vi.mock("../ai/capabilities/detect-face/runner", () => ({
  runFaceDetect: (...args: unknown[]) => harness.runFaceDetect(...args),
}));

// useSubjectMask runs subjectMask state-machine queries against
// modules we don't need for these tests. Stub it out to a fixed
// "no mask cached" shape so the panel renders without a real mask.
vi.mock("../ai/useSubjectMask", () => ({
  useSubjectMask: () => ({
    state: {
      status: "idle",
      progress: null,
      error: null,
      version: 0,
      warm: false,
      modelCached: false,
      pendingQuality: null,
      userDenied: false,
    },
    quality: "small",
    peek: () => null,
    peekDownsample: () => null,
    request: async () => {
      throw new Error("unused in faces tests");
    },
    requestExplicit: async () => {
      throw new Error("unused in faces tests");
    },
    grantConsent: () => undefined,
    denyConsent: () => undefined,
    resumeAfterDeny: async () => undefined,
    invalidate: () => undefined,
  }),
}));

function makeDoc(w = 200, h = 200) {
  const working = document.createElement("canvas");
  working.width = w;
  working.height = h;
  const ctx = working.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, w, h);
  }
  return { width: w, height: h, working };
}

beforeEach(async () => {
  vi.resetModules();
  harness.doc = makeDoc();
  harness.toolState = { ...DEFAULT_TOOL_STATE };
  harness.patchTool.mockReset();
  harness.commit.mockReset();
  harness.runFaceDetect.mockReset();
  harness.lastCommitLabel = null;
  harness.undo.mockReset();
  harness.undo.mockResolvedValue(undefined);
  // Pre-grant consent for tests that don't exercise the dialog —
  // the consent-gate tests in service.test.ts cover that path.
  try {
    localStorage.setItem("cloakimg:detect-face:consented", "1");
  } catch {
    // Ignore — jsdom restrictions in some configurations.
  }
  // requestAnimationFrame in jsdom: ensure callbacks run on the
  // next tick rather than queuing forever.
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
    (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
  );
});

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Best-effort.
  }
  vi.restoreAllMocks();
});

describe("RedactPanel — Faces smart action", () => {
  it("renders the Person and Faces toggle pair (Scene was removed)", async () => {
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);
    expect(screen.getByRole("button", { name: /Person/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Faces/i })).toBeInTheDocument();
    // Scene was removed in the mutually-exclusive picker refactor.
    // The manual Brush mode handles the inverted-scope case now.
    expect(screen.queryByRole("button", { name: /^Scene$/i })).not.toBeInTheDocument();
  });

  it("does NOT undo when there is no prior smart-anonymize bake to replace", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [{ x: 10, y: 10, width: 40, height: 40, score: 0.95 }],
      device: "wasm",
    });
    harness.lastCommitLabel = "Open"; // typical baseline label
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });
    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalledWith("Anonymize 1 face");
    });
    // No prior smart bake → undo MUST NOT fire (would clobber the user's
    // unrelated edit, e.g. a manual brush stroke they made earlier).
    expect(harness.undo).not.toHaveBeenCalled();
  });

  it("clicking Faces UNDOES a prior Person bake before applying (mutually exclusive)", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [{ x: 10, y: 10, width: 40, height: 40, score: 0.95 }],
      device: "wasm",
    });
    harness.lastCommitLabel = "Anonymize subject"; // prior Person bake
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });
    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalledWith("Anonymize 1 face");
    });
    // The prior Person bake gets undone first so Faces replaces (not stacks).
    expect(harness.undo).toHaveBeenCalledTimes(1);
  });

  it("clicking Person UNDOES a prior Faces bake before applying", async () => {
    harness.lastCommitLabel = "Anonymize 3 faces"; // prior Faces bake
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Person/i }));
    });
    // Person uses subjectMask (which we stub to throw via requestExplicit
    // in the panel mock). We don't need it to succeed — we only need to
    // assert the undo() ran BEFORE the consent flow gated us.
    await waitFor(() => {
      expect(harness.undo).toHaveBeenCalledTimes(1);
    });
  });

  it("clicking Faces while a Faces bake is already current does NOT undo (no-op switch)", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [{ x: 5, y: 5, width: 10, height: 10, score: 0.9 }],
      device: "wasm",
    });
    harness.lastCommitLabel = "Anonymize 2 faces"; // same kind already current
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });
    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalled();
    });
    // Re-running the same kind shouldn't undo — the user is just
    // re-applying with (possibly) different style settings.
    expect(harness.undo).not.toHaveBeenCalled();
  });

  it("clicking Faces invokes the MediaPipe runner and commits the redaction", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [
        { x: 10, y: 10, width: 40, height: 40, score: 0.95 },
        { x: 80, y: 60, width: 30, height: 30, score: 0.88 },
      ],
      device: "wasm",
    });
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });

    await waitFor(() => {
      expect(harness.runFaceDetect).toHaveBeenCalledTimes(1);
    });
    const args = harness.runFaceDetect.mock.calls[0]?.[0] as {
      modelUrl: string;
      wasmBaseUrl: string;
    };
    expect(args.modelUrl).toBe("/models/face/blaze_face_full_range.tflite");
    expect(args.wasmBaseUrl).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@[\d.]+\/wasm$/,
    );

    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalledWith("Anonymize 2 faces");
    });
  });

  it("commits the singular label for a single detected face", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [{ x: 10, y: 10, width: 40, height: 40, score: 0.95 }],
      device: "wasm",
    });
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });

    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalledWith("Anonymize 1 face");
    });
  });

  it("surfaces a friendly inline error and skips commit when no faces are detected", async () => {
    harness.runFaceDetect.mockResolvedValueOnce({ faces: [], device: "wasm" });
    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/no faces detected/i)).toBeInTheDocument();
    });
    expect(harness.commit).not.toHaveBeenCalled();
  });

  it("first-time consent: clicking Faces → Download in dialog runs detection in one flow", async () => {
    // Regression test for the bug where grantConsent transitioned
    // status to "idle", which caused waitForFaceResolution to reject
    // BEFORE the consent host's follow-up request could land
    // "loading". Symptom: dialog appeared, user clicked Download,
    // button cleared, but detection never ran. Caught in production
    // by scripts/probe-face-detect.mjs.
    //
    // Setup: clear the pre-granted consent flag this suite's
    // beforeEach normally sets, so we exercise the actual cold-path
    // consent flow.
    try {
      localStorage.removeItem("cloakimg:detect-face:consented");
    } catch {
      // Best-effort.
    }

    harness.runFaceDetect.mockResolvedValueOnce({
      faces: [{ x: 10, y: 10, width: 40, height: 40, score: 0.95 }],
      device: "wasm",
    });

    // We need both the host (which renders the consent dialog) and
    // the panel (which has the Faces button). They share the
    // module-level face-detect service, so one render tree can
    // contain both.
    const { RedactPanel } = await import("./RedactPanel");
    const { DetectFaceConsentHost } = await import("../ai/capabilities/detect-face/ConsentHost");
    render(
      <>
        <RedactPanel />
        <DetectFaceConsentHost />
      </>,
    );

    // Click Faces — should surface the consent dialog (no pre-grant).
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });
    // Wait for the consent dialog's Download primary button to render.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Download \d+ MB/i })).toBeInTheDocument();
    });

    // Click Download in the consent dialog — same UX path the user
    // hits in the browser. After this, detection MUST run (runner
    // invoked, commit fires).
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Download \d+ MB/i }));
    });

    await waitFor(() => {
      expect(harness.runFaceDetect).toHaveBeenCalledTimes(1);
    });
    const args = harness.runFaceDetect.mock.calls[0]?.[0] as { modelUrl: string };
    expect(args.modelUrl).toBe("/models/face/blaze_face_full_range.tflite");

    await waitFor(() => {
      expect(harness.commit).toHaveBeenCalledWith("Anonymize 1 face");
    });
  });

  it("Person button is disabled while Faces is running (mutually-exclusive busy gate)", async () => {
    // Make the runner never resolve so the busy state sticks for the
    // duration of the test. We're not waiting for completion here —
    // just observing the disabled state during the in-flight call.
    let resolveRun: ((v: unknown) => void) | undefined;
    harness.runFaceDetect.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const { RedactPanel } = await import("./RedactPanel");
    render(<RedactPanel />);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Faces/i }));
    });

    // The clicked Faces button shows "Working…" and is disabled. The
    // sibling Person button is also disabled so the user can't start
    // a switch mid-flight (which would race the undo/replace logic).
    await waitFor(() => {
      const facesBtn = screen.getByRole("button", { name: /Working/i });
      expect(facesBtn).toBeDisabled();
    });
    const personBtn = screen.getByRole("button", { name: /Person/i });
    expect(personBtn).toBeDisabled();

    // Resolve the in-flight call so the test cleanly tears down.
    resolveRun?.({ faces: [], device: "wasm" });
  });
});
