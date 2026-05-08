// UI flow tests for the AI consent + download orchestration.
//
// These simulate the actual user path: a panel triggers `request()` →
// MaskConsentHost surfaces MaskConsentDialog → user picks tier + taps
// Download (or Not now) → MaskDownloadDialog appears → state settles
// to ready (or stays pinned on error).
//
// We mock the heavy bits (smartRemoveBackground, isModelCached, the
// EditorContext hooks) so the tests run in jsdom in well under a second
// while exercising the real components, real subjectMask state machine,
// and real consent dialog DOM.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layout } from "../../types";
import type { ToolState } from "../../toolState";
import { DEFAULT_TOOL_STATE } from "../../toolState";

// ── Mocks ───────────────────────────────────────────────────────────
// vi.mock is hoisted, so the factories cannot reference closures
// declared above. We expose mutable refs through `vi.hoisted` instead
// — every test resets them in beforeEach.

const harness = vi.hoisted(() => {
  // Tests always reset `doc` in beforeEach to a fresh fake so consumers
  // don't have to null-check at every call site. The placeholder canvas
  // satisfies TS until beforeEach overwrites it.
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
  }),
  useToolState: () => harness.toolState as unknown as ToolState,
}));

vi.mock("../runtime/segment", async () => {
  const actual = await vi.importActual<typeof import("../runtime/segment")>("../runtime/segment");
  return {
    ...actual,
    smartRemoveBackground: (...args: unknown[]) => harness.smartRemoveBackground(...args),
    isModelCached: (q: string) => harness.isModelCached(q),
  };
});

import { savePreferredQuality } from "../runtime/preferredQuality";
import { invalidateSubjectMask } from "../subjectMask";

// ── Helpers ─────────────────────────────────────────────────────────

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

/** Reset the subjectMask singleton between tests by re-importing it
 *  via vi.resetModules — without this, the consentGranted / userDenied
 *  / cache slots leak across cases. */
async function loadFreshSubjectMask() {
  vi.resetModules();
  // Re-establish the per-test mocks because resetModules clears them.
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
    }),
    useToolState: () => harness.toolState as unknown as ToolState,
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

const KEY = "cloakimg:bgQuality";

beforeEach(() => {
  harness.layout = "desktop";
  harness.doc = makeDoc(200, 200);
  harness.toolState = { ...DEFAULT_TOOL_STATE };
  harness.patchTool = (k: string, v: unknown) => {
    harness.toolState = { ...harness.toolState, [k]: v };
  };
  harness.smartRemoveBackground = () => Promise.resolve(makeOpaqueCanvas(200, 200));
  harness.isModelCached = async () => false;
  localStorage.clear();
  invalidateSubjectMask();
});

afterEach(() => {
  vi.doUnmock("../../EditorContext");
  vi.doUnmock("../runtime/segment");
});

// ── 1st-time download flow ─────────────────────────────────────────

describe("MaskConsentHost — first-time AI tool tap (cold cache)", () => {
  it("shows the consent dialog when an AI tool requests detection without consent", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    render(<Host />);
    expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();

    // A panel invokes ensureSubjectMask. The promise rejects with
    // MaskConsentError; the host detects the state flip and pops the
    // dialog.
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch((e) => {
        if (!(e instanceof sm.MaskConsentError)) throw e;
      });
    });

    expect(await screen.findByText(/^Download the AI model$/i)).toBeInTheDocument();
    // First-time copy is the "do you want this?" framing, not the
    // switch picker copy.
    expect(screen.getByText(/Subject-aware tools/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Not now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Download \d+ MB$/i })).toBeInTheDocument();
  });

  it("user accepts default tier → savePreferredQuality persists + detection runs at chosen tier", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    const calls: { quality: string }[] = [];
    harness.smartRemoveBackground = (...args: unknown[]) => {
      const opts = args[1] as { quality?: string } | undefined;
      calls.push({ quality: opts?.quality ?? "?" });
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Download \d+ MB$/i }));

    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(calls[0]?.quality).toBe("small");
    expect(localStorage.getItem(KEY)).toBe("small");
    expect(harness.toolState.bgQuality).toBe(0);
  });

  it("user picks Better tier before downloading → detection runs at medium, preference persists", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    const calls: string[] = [];
    harness.smartRemoveBackground = (...args: unknown[]) => {
      const opts = args[1] as { quality?: string } | undefined;
      calls.push(opts?.quality ?? "?");
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    const user = userEvent.setup();
    // Pick "Better" — same tier-row pattern the dialog uses.
    await user.click(screen.getByRole("button", { name: /Better/i, pressed: false }));
    // The Download button label updates to reflect the picked tier's MB.
    const downloadBtn = await screen.findByRole("button", { name: /Download 84 MB/i });
    await user.click(downloadBtn);

    await waitFor(() => expect(calls).toContain("medium"));
    expect(localStorage.getItem(KEY)).toBe("medium");
    expect(harness.toolState.bgQuality).toBe(1);
  });

  it("user clicks Not now → no download starts, dialog closes, deny latch suppresses re-pop", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    render(<Host />);
    let calls = 0;
    harness.smartRemoveBackground = () => {
      calls += 1;
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Not now/i }));

    await waitFor(() => {
      expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
    });
    expect(calls).toBe(0);
    expect(localStorage.getItem(KEY)).toBeNull();

    // A second auto-trigger must NOT re-pop the dialog — the deny latch
    // makes ensureSubjectMask reject silently.
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
    expect(calls).toBe(0);
  });
});

// ── Resume — bytes already on disk ─────────────────────────────────

describe("MaskConsentHost — resume (model already on disk from prior session)", () => {
  it("a previously-cached model skips the dialog and runs detection directly", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    harness.isModelCached = async () => true;
    let calls = 0;
    harness.smartRemoveBackground = () => {
      calls += 1;
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "medium").catch(() => undefined);
    });

    // Dialog should never have appeared.
    expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
    await waitFor(() => expect(calls).toBeGreaterThan(0));
  });

  it("dialog opened in switch mode shows 'Already downloaded' badge for cached tiers", async () => {
    const { Host } = await loadFreshSubjectMask();
    // Prior session: user chose "medium" and the bytes are on disk.
    harness.isModelCached = async (q: string) => q === "medium";
    savePreferredQuality("medium");
    // Simulate the "Change model size" flow opening the picker via
    // requestModelPicker — which is the explicit-switch entry point.
    const { requestModelPicker, grantMaskConsent } = await import("../subjectMask");
    grantMaskConsent();
    render(<Host />);

    act(() => {
      requestModelPicker("medium");
    });

    await screen.findByText(/^Choose a model size$/i);
    // Wait for the cache probe to run inside the dialog effect.
    await waitFor(() => {
      expect(screen.getAllByText(/Already downloaded/i).length).toBeGreaterThan(0);
    });
    // The Download button reads "Use {N} MB" rather than "Download {N} MB"
    // when the picked tier is on disk — confirms switch-mode copy lands.
    expect(screen.getByRole("button", { name: /Use 84 MB model/i })).toBeInTheDocument();
  });
});

// ── Model deleted between sessions ─────────────────────────────────

describe("MaskConsentHost — bytes evicted between sessions", () => {
  it("user previously chose medium; cache cleared → next AI tap re-prompts the consent dialog", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    // The localStorage preference still says "medium" (from a prior
    // session) but the browser cleared CacheStorage between visits.
    savePreferredQuality("medium");
    harness.isModelCached = async () => false;
    let calls = 0;
    harness.smartRemoveBackground = () => {
      calls += 1;
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "medium").catch(() => undefined);
    });

    // No bytes on disk + no prior consent in this fresh session →
    // dialog must come up. The user gets a chance to re-confirm.
    await screen.findByText(/^Download the AI model$/i);
    expect(calls).toBe(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Download \d+ MB$/i }));
    await waitFor(() => expect(calls).toBeGreaterThan(0));
  });

  it("user can re-download a different tier than they originally chose", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    savePreferredQuality("large");
    harness.isModelCached = async () => false;
    const calls: string[] = [];
    harness.smartRemoveBackground = (...args: unknown[]) => {
      const opts = args[1] as { quality?: string } | undefined;
      calls.push(opts?.quality ?? "?");
      return Promise.resolve(makeOpaqueCanvas(200, 200));
    };

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "large").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    const user = userEvent.setup();
    // Downgrade to Fast on a re-download — common when the original
    // download stalled and the user wants something smaller.
    await user.click(screen.getByRole("button", { name: /Fast/i, pressed: false }));
    await user.click(await screen.findByRole("button", { name: /Download 42 MB/i }));

    await waitFor(() => expect(calls).toContain("small"));
    expect(localStorage.getItem(KEY)).toBe("small");
  });
});

// ── Layout-aware tier visibility ───────────────────────────────────

describe("MaskConsentHost — mobile layout hides the Best tier", () => {
  it("mobile users only see Fast + Better, not Best (~168 MB hidden)", async () => {
    const { sm, Host } = await loadFreshSubjectMask();
    harness.layout = "mobile";

    render(<Host />);
    await act(async () => {
      await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
    });
    await screen.findByText(/^Download the AI model$/i);

    expect(screen.getByRole("button", { name: /^Fast/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Better/i })).toBeInTheDocument();
    // "Best" tier is desktopAndTabletOnly — must not render on mobile.
    expect(screen.queryByRole("button", { name: /^Best/i })).toBeNull();
  });

  it("tablet / desktop layouts render every tier", async () => {
    for (const layout of ["tablet", "desktop"] as const) {
      const { sm, Host } = await loadFreshSubjectMask();
      harness.layout = layout;
      const { unmount } = render(<Host />);
      await act(async () => {
        await sm.ensureSubjectMask(harness.doc.working, "small").catch(() => undefined);
      });
      await screen.findByText(/^Download the AI model$/i);
      // All three tiers visible — names anchor on `^TierLabel` so the
      // tradeoff strings ("best on a fast connection") don't false-
      // match the Best tier query.
      expect(screen.getByRole("button", { name: /^Fast/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Better/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Best/i })).toBeInTheDocument();
      unmount();
    }
  });
});

// ── Switch tier from already-consented state ───────────────────────

describe("MaskConsentHost — already-consented user opening the switch picker", () => {
  it("dialog uses switch-mode copy (Choose a model size, Cancel)", async () => {
    const { Host } = await loadFreshSubjectMask();
    const { grantMaskConsent, requestModelPicker } = await import("../subjectMask");
    grantMaskConsent();
    harness.isModelCached = async () => true;

    render(<Host />);
    act(() => {
      requestModelPicker("small");
    });

    expect(await screen.findByText(/^Choose a model size$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("Cancel from switch picker closes without flipping consent off", async () => {
    const { Host } = await loadFreshSubjectMask();
    const { grantMaskConsent, requestModelPicker, hasMaskConsent } = await import("../subjectMask");
    grantMaskConsent();
    expect(hasMaskConsent()).toBe(true);

    render(<Host />);
    act(() => {
      requestModelPicker("small");
    });
    await screen.findByText(/^Choose a model size$/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText(/^Choose a model size$/i)).toBeNull();
    });
    // Consent stays granted after cancel — the user already opted in;
    // they just chose not to swap tiers.
    expect(hasMaskConsent()).toBe(true);
  });
});
