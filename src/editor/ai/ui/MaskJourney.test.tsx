// End-to-end user-journey tests for the AI download flow.
//
// The tests below extend MaskConsentHost.test.tsx by following the
// user past the consent dialog into the download / progress / error
// screens. Each test simulates one full path the user can take —
// happy path, every error category, every dismiss button — and
// asserts the editor never silently navigates back to landing.
//
// Why these matter: a recent bug report described "the editor
// vanished to home with no console logs" mid-download. Without
// tests pinning every error path to an in-place UI surface, that
// failure mode is invisible to regressions.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layout } from "../../types";
import type { ToolState } from "../../toolState";
import { DEFAULT_TOOL_STATE } from "../../toolState";

const harness = vi.hoisted(() => {
  const placeholder = { width: 1, height: 1, working: undefined as unknown as HTMLCanvasElement };
  return {
    layout: "desktop" as "desktop" | "tablet" | "mobile",
    doc: placeholder,
    toolState: { bgQuality: 0 } as { bgQuality: number; [k: string]: unknown },
    patchTool: ((..._args: unknown[]) => undefined) as (key: string, value: unknown) => void,
    smartRemoveBackground: (() => Promise.reject(new Error("not stubbed"))) as (
      ...args: unknown[]
    ) => Promise<HTMLCanvasElement>,
    isModelCached: (async () => false) as (q: string) => Promise<boolean>,
    /** True if onExit was called during a test. The journey tests
     *  read this to assert the editor never accidentally navigated
     *  back to landing during a failed download. */
    exitCalled: false,
  };
});

vi.mock("../../EditorContext", () => ({
  useEditorReadOnly: () => ({
    doc: harness.doc,
    layout: harness.layout as Layout,
    loading: false,
    busyLabel: null,
    error: null,
    view: { zoom: 1, panX: 0, panY: 0 },
    layers: [],
    mode: "single",
    canUndo: false,
    canRedo: false,
    canReset: false,
    exportOpen: false,
    batchFiles: [],
    recipe: [],
    batchRunning: false,
    compareActive: false,
    historyVersion: 0,
  }),
  useEditorActions: () => ({
    patchTool: (k: string, v: unknown) => harness.patchTool(k, v),
    exit: () => {
      harness.exitCalled = true;
    },
  }),
  useToolState: () => harness.toolState as unknown as ToolState,
  useEditor: () => ({
    doc: harness.doc,
    layout: harness.layout as Layout,
    toolState: harness.toolState as unknown as ToolState,
    patchTool: (k: string, v: unknown) => harness.patchTool(k, v),
    exit: () => {
      harness.exitCalled = true;
    },
  }),
}));

vi.mock("../runtime/segment", async () => {
  const actual = await vi.importActual<typeof import("../runtime/segment")>("../runtime/segment");
  return {
    ...actual,
    smartRemoveBackground: (...args: unknown[]) => harness.smartRemoveBackground(...args),
    isModelCached: (q: string) => harness.isModelCached(q),
  };
});

import { invalidateSubjectMask } from "../subjectMask";

function makeDoc(w = 200, h = 200) {
  const working = document.createElement("canvas");
  working.width = w;
  working.height = h;
  return { width: w, height: h, working };
}

function makeOpaqueCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Resettable promise pair. Tests that need to drive a download in
 *  steps (started → progress → resolved/rejected) hold the resolver
 *  + rejecter rather than dealing with timing. */
function makeDeferred<T>() {
  type Resolver = (v: T) => void;
  type Rejecter = (e: unknown) => void;
  const slot: { resolve?: Resolver; reject?: Rejecter; promise: Promise<T> } = {
    promise: undefined as unknown as Promise<T>,
  };
  slot.promise = new Promise<T>((res, rej) => {
    slot.resolve = res;
    slot.reject = rej;
  });
  return slot;
}

async function loadFreshHost() {
  vi.resetModules();
  vi.doMock("../../EditorContext", () => ({
    useEditorReadOnly: () => ({
      doc: harness.doc,
      layout: harness.layout as Layout,
      loading: false,
      busyLabel: null,
      error: null,
      view: { zoom: 1, panX: 0, panY: 0 },
      layers: [],
      mode: "single",
      canUndo: false,
      canRedo: false,
      canReset: false,
      exportOpen: false,
      batchFiles: [],
      recipe: [],
      batchRunning: false,
      compareActive: false,
      historyVersion: 0,
    }),
    useEditorActions: () => ({
      patchTool: (k: string, v: unknown) => harness.patchTool(k, v),
      exit: () => {
        harness.exitCalled = true;
      },
    }),
    useToolState: () => harness.toolState as unknown as ToolState,
    useEditor: () => ({
      doc: harness.doc,
      layout: harness.layout as Layout,
      toolState: harness.toolState as unknown as ToolState,
      patchTool: (k: string, v: unknown) => harness.patchTool(k, v),
      exit: () => {
        harness.exitCalled = true;
      },
    }),
  }));
  vi.doMock("../runtime/segment", async () => {
    const actual = await vi.importActual<typeof import("../runtime/segment")>("../runtime/segment");
    return {
      ...actual,
      smartRemoveBackground: (...args: unknown[]) => harness.smartRemoveBackground(...args),
      isModelCached: (q: string) => harness.isModelCached(q),
    };
  });
  const sm = await import("../subjectMask");
  const HostMod = await import("./MaskConsentHost");
  return { sm, Host: HostMod.MaskConsentHost };
}

beforeEach(() => {
  harness.layout = "desktop";
  harness.doc = makeDoc(200, 200);
  harness.toolState = { ...DEFAULT_TOOL_STATE };
  harness.patchTool = (k: string, v: unknown) => {
    harness.toolState = { ...harness.toolState, [k]: v };
  };
  harness.smartRemoveBackground = () => Promise.resolve(makeOpaqueCanvas(200, 200));
  harness.isModelCached = async () => false;
  harness.exitCalled = false;
  localStorage.clear();
  invalidateSubjectMask();
});

afterEach(() => {
  vi.doUnmock("../../EditorContext");
  vi.doUnmock("../runtime/segment");
});

// ── Happy path: full Smart Crop journey on the host ─────────────────

describe("AI journey — full happy path (consent → download → ready)", () => {
  it("user taps AI tool → downloads model → mask resolves, no redirect home", async () => {
    const { sm, Host } = await loadFreshHost();
    const seg = makeDeferred<HTMLCanvasElement>();
    harness.smartRemoveBackground = (...args: unknown[]) => {
      const opts = args[1] as { onProgress?: (p: unknown) => void } | undefined;
      // Emit a download tick + an inference tick before resolving.
      setTimeout(() => {
        opts?.onProgress?.({
          phase: "download",
          ratio: 0.42,
          label: "Downloading model…",
          bytesDownloaded: 35_000_000,
          bytesTotal: 84_000_000,
        });
      }, 0);
      return seg.promise;
    };

    render(<Host />);

    // Step 1: a panel triggers detection.
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "medium").catch(() => undefined);
    });
    expect(await screen.findByText(/^Download the AI model$/i)).toBeInTheDocument();

    // Step 2: user accepts the default tier.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Download \d+ MB$/i }));

    // Step 3: download dialog appears with progress copy. The title
    // sits at id="cloak-mask-download-title".
    await waitFor(() => {
      expect(document.getElementById("cloak-mask-download-title")).toHaveTextContent(
        /Setting up subject detection/i,
      );
    });
    // No premature error UI.
    expect(screen.queryByText(/Try again/i)).toBeNull();

    // Step 4: detection settles.
    seg.resolve?.(makeOpaqueCanvas(200, 200));
    await waitFor(() => {
      expect(sm.getMaskState().status).toBe("ready");
    });

    // Step 5: download dialog auto-clears, host renders nothing.
    await waitFor(() => {
      expect(screen.queryByText(/Setting up subject detection/i)).toBeNull();
    });
    expect(harness.exitCalled).toBe(false);
  });
});

// ── Error categories — each must keep the editor mounted ────────────

describe("AI journey — error categories pin error UI in place (no redirect)", () => {
  for (const [kind, message, expectedTitle] of [
    [
      "network",
      "Couldn't reach the model server. Check your connection and try again.",
      /Couldn't reach the model server/i,
    ],
    [
      "memory",
      "This device ran out of memory loading the model. Try the Fast (~42 MB) tier.",
      /Not enough memory/i,
    ],
    [
      "quota",
      "Browser storage is full — the model bytes can't be cached.",
      /Browser storage is full/i,
    ],
    ["wasm", "The on-device runtime didn't compile in this browser.", /AI runtime didn't start/i],
    ["interrupted", "Download was interrupted by the browser.", /Download was interrupted/i],
  ] as const) {
    it(`${kind}: failure pins MaskDownloadDialog with error copy + Try again`, async () => {
      const { sm, Host } = await loadFreshHost();
      let calls = 0;
      harness.smartRemoveBackground = () => {
        calls += 1;
        return Promise.reject(new Error(message));
      };

      render(<Host />);
      await act(async () => {
        await sm.ensureSubjectMask(harness.doc.working, "medium").catch(() => undefined);
      });
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));

      // Wait for the rejection to land + dialog to swap into error state.
      await waitFor(() => {
        expect(sm.getMaskState().status).toBe("error");
      });

      // The host must keep the dialog visible, NOT auto-clear it.
      const tryAgain = await screen.findByRole("button", { name: /Try again/i });
      expect(tryAgain).toBeInTheDocument();
      // Title sits at id="cloak-mask-download-title". Scoping the
      // assertion there sidesteps the duplicate-text issue when the
      // friendly title pattern also appears inside the body copy.
      expect(document.getElementById("cloak-mask-download-title")).toHaveTextContent(expectedTitle);
      // Error body should include the raw friendly message in the
      // <span> next to the Triangle icon (alert role).
      expect(screen.getByRole("alert")).toHaveTextContent(message);

      // Critical: editor stayed mounted, no fallback to landing.
      expect(harness.exitCalled).toBe(false);

      // Try again restarts detection at the same tier (no consent re-prompt).
      const before = calls;
      await user.click(tryAgain);
      await waitFor(() => expect(calls).toBeGreaterThan(before));
    });
  }
});

// ── Cancel / Continue-in-background / Close ─────────────────────────

describe("AI journey — download dialog dismiss buttons", () => {
  it("Cancel during active download → terminates worker, dialog clears, no redirect", async () => {
    const { sm, Host } = await loadFreshHost();
    const seg = makeDeferred<HTMLCanvasElement>();
    harness.smartRemoveBackground = () => seg.promise;

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
    await waitFor(() => {
      expect(document.getElementById("cloak-mask-download-title")).toHaveTextContent(
        /Setting up subject detection/i,
      );
    });

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));

    // Dialog gone, mask state back to idle (cancelMaskDetection clears it).
    await waitFor(() => {
      expect(document.getElementById("cloak-mask-download-title")).toBeNull();
    });
    expect(sm.getMaskState().status).toBe("idle");
    expect(harness.exitCalled).toBe(false);
  });

  it("Continue in background → dialog hides, detection finishes silently", async () => {
    const { sm, Host } = await loadFreshHost();
    const seg = makeDeferred<HTMLCanvasElement>();
    harness.smartRemoveBackground = () => seg.promise;

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
    await waitFor(() => {
      expect(document.getElementById("cloak-mask-download-title")).toHaveTextContent(
        /Setting up subject detection/i,
      );
    });

    await user.click(screen.getByRole("button", { name: /Continue in background/i }));
    await waitFor(() => {
      expect(document.getElementById("cloak-mask-download-title")).toBeNull();
    });
    // State is still "loading" — detection didn't get cancelled.
    expect(sm.getMaskState().status).toBe("loading");

    // Resolving completes the in-progress detection.
    seg.resolve?.(makeOpaqueCanvas(200, 200));
    await waitFor(() => expect(sm.getMaskState().status).toBe("ready"));
    expect(harness.exitCalled).toBe(false);
  });

  it("Close button on error dialog → terminates + clears, NO redirect home", async () => {
    const { sm, Host } = await loadFreshHost();
    harness.smartRemoveBackground = () =>
      Promise.reject(new Error("Couldn't reach the model server."));

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
    await screen.findByRole("button", { name: /Try again/i });

    // Footer "Close" is the visible text-only button — distinct from
    // the modal X which uses aria-label="Close" with no text content.
    const closeBtn = screen
      .getAllByRole("button", { name: /^Close$/i })
      .find((b) => b.textContent?.trim() === "Close");
    if (!closeBtn) throw new Error("Footer Close button not found");
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
    });
    expect(harness.exitCalled).toBe(false);
  });
});

// ── Concurrent triggers + rapid dismissal ───────────────────────────

describe("AI journey — concurrent panel triggers", () => {
  it("two panels triggering detection in quick succession → only one consent prompt", async () => {
    const { sm, Host } = await loadFreshHost();
    const seg = makeDeferred<HTMLCanvasElement>();
    harness.smartRemoveBackground = () => seg.promise;

    render(<Host />);
    await act(async () => {
      const a = sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
      const b = sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
      await Promise.all([a, b]);
    });

    // Only one consent dialog despite two concurrent requests.
    expect(screen.getAllByText(/^Download the AI model$/i)).toHaveLength(1);
    seg.resolve?.(makeOpaqueCanvas(200, 200));
  });

  it("user dismisses dialog → second auto-trigger does NOT re-pop the dialog", async () => {
    const { sm, Host } = await loadFreshHost();
    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Not now/i }));
    await waitFor(() => {
      expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
    });

    // Auto-trigger from a panel useEffect mount.
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    // Dialog stays closed because of the deny latch.
    expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
    expect(harness.exitCalled).toBe(false);
  });
});

// ── Redirect-to-landing safety net ──────────────────────────────────

describe("AI journey — editor never silently redirects to landing", () => {
  // Replays every failure mode once and asserts onExit was never
  // called. If a future code change accidentally wires an error path
  // to onExit (e.g. by throwing inside a render where the boundary
  // chooses "Back to start"), this test fails.
  const failureModes = [
    new Error("Couldn't reach the model server."),
    new Error("This device ran out of memory loading the model."),
    new Error("Browser storage is full — the model bytes can't be cached."),
    new Error("AI module didn't finish loading."),
    new Error("AI inference aborted"),
  ];

  for (const err of failureModes) {
    it(`${err.message.slice(0, 30)}…: editor.exit() is never called`, async () => {
      const { sm, Host } = await loadFreshHost();
      harness.smartRemoveBackground = () => Promise.reject(err);

      render(<Host />);
      await act(async () => {
        await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
      });
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
      await waitFor(() => expect(sm.getMaskState().status).toBe("error"));

      expect(harness.exitCalled).toBe(false);
    });
  }

  it("worker that resolves a transparent (empty) mask → friendly 'no subject' error in dialog, not redirect", async () => {
    const { sm, Host } = await loadFreshHost();
    // jsdom's getContext returns null, so hasOpaqueContent's defensive
    // fallback is `true` (assume valid). Simulate the empty-mask path
    // by rejecting with the canonical message instead.
    harness.smartRemoveBackground = () =>
      Promise.reject(new Error("No subject detected. Try a photo with a clearer foreground."));

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
    await waitFor(() => expect(sm.getMaskState().status).toBe("error"));

    expect(screen.getByRole("alert")).toHaveTextContent(/no subject/i);
    expect(harness.exitCalled).toBe(false);
  });
});

// ── Mobile-specific journey ─────────────────────────────────────────

describe("AI journey — mobile path", () => {
  it("mobile user picks Better tier (max for mobile) → downloads → detection ready", async () => {
    const { sm, Host } = await loadFreshHost();
    harness.layout = "mobile";
    harness.smartRemoveBackground = () => Promise.resolve(makeOpaqueCanvas(200, 200));

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    // The Best tier is hidden on mobile. Better is the highest visible.
    expect(screen.queryByRole("button", { name: /^Best/i })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Better/i }));
    await user.click(await screen.findByRole("button", { name: /Download 84 MB/i }));

    await waitFor(() => expect(sm.getMaskState().status).toBe("ready"));
    expect(harness.exitCalled).toBe(false);
    // Quality preference persisted for next session resume.
    expect(localStorage.getItem("cloakimg:bgQuality")).toBe("medium");
  });

  it("mobile user starts download → mid-flight worker error → error UI, NOT redirect to landing", async () => {
    const { sm, Host } = await loadFreshHost();
    harness.layout = "mobile";
    const seg = makeDeferred<HTMLCanvasElement>();
    harness.smartRemoveBackground = () => seg.promise;

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "medium").catch(() => undefined);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
    await screen.findByText(/Setting up subject detection/i);

    // Simulate a worker crash mid-download (the hostile mobile path).
    seg.reject?.(new Error("AI worker failed mid-download"));
    await waitFor(() => expect(sm.getMaskState().status).toBe("error"));

    // CRITICAL: editor stayed mounted, the user can recover in place.
    expect(await screen.findByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(harness.exitCalled).toBe(false);
  });
});
