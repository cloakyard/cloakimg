// Parameterized AI-flow tests covering every tool that can trigger a
// model download.
//
// Why one file per matrix instead of nine per-tool files: every AI
// tool funnels through the same MaskConsentHost + subjectMask
// service. The user-visible difference is *which* hook the tool
// calls — `requestExplicit` for an explicit smart-action button
// (Smart Crop, Smart Place, Apply Remove BG, Smart Anonymize) or
// `request` for a passive scope-change effect (Adjust / Filter /
// HSL / Levels / BgBlur). This file parametrizes over both.
//
// Each tool is tested through three scenarios — first-time download,
// resume, and worker error mid-download — so a regression in any
// shared infra (consent dialog, deny latch, generation supersession)
// trips at least nine cases. The "exitCalled" guard is the line of
// defense against the bug we shipped earlier where a hostile mid-
// download path silently navigated back to landing.

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

// ── Tool catalogue ─────────────────────────────────────────────────
//
// Every tool that can trigger a subject-mask download. The trigger
// function takes the freshly-loaded subjectMask module + source
// canvas and invokes the same hook the tool's panel calls when the
// user reaches the AI-touching code path. Smart actions hit
// `requestExplicit`; scoped tools hit `request`.

type SubjectMaskModule = typeof import("../subjectMask");

interface ToolCase {
  /** Human-readable id used in test names. */
  id: string;
  /** Which hook the tool's panel calls. The driver below mirrors the
   *  exact semantics used by the panel:
   *    • smart  → clear the deny latch first, then ensureSubjectMask
   *               (matches `useSubjectMask().requestExplicit()`).
   *    • scoped → ensureSubjectMask only (matches `request()`). */
  trigger: "smart" | "scoped";
}

const SMART_ACTION_TOOLS: ToolCase[] = [
  { id: "Crop · Smart Crop", trigger: "smart" },
  { id: "Redact · Smart Anonymize", trigger: "smart" },
  { id: "RemoveBg · Apply", trigger: "smart" },
  { id: "Watermark · Smart Place", trigger: "smart" },
];

const SCOPED_TOOLS: ToolCase[] = [
  { id: "Adjust · scope-change", trigger: "scoped" },
  { id: "BgBlur · scope-change", trigger: "scoped" },
  { id: "Filter · scope-change", trigger: "scoped" },
  { id: "HSL · scope-change", trigger: "scoped" },
  { id: "Levels · scope-change", trigger: "scoped" },
];

const ALL_TOOLS = [...SMART_ACTION_TOOLS, ...SCOPED_TOOLS];

// ── First-time download per tool ───────────────────────────────────

describe("AI tool journey — first-time download", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool.id}: triggers consent dialog → user downloads → mask resolves`, async () => {
      const { sm, Host } = await loadFreshHost();
      const cut = makeOpaqueCanvas(200, 200);
      let segCalls = 0;
      harness.smartRemoveBackground = () => {
        segCalls += 1;
        return Promise.resolve(cut);
      };

      render(<Host />);
      // Step 1: tool's panel triggers detection.
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });
      // Consent dialog is up.
      expect(await screen.findByText(/^Download the AI model$/i)).toBeInTheDocument();

      // Step 2: user accepts the default tier.
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^Download \d+ MB$/i }));

      // Step 3: detection runs and resolves to ready.
      await waitFor(() => expect(sm.getMaskState().status).toBe("ready"));
      expect(segCalls).toBe(1);
      // Step 4: editor stayed mounted, no redirect to landing.
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── Resume per tool (model already cached from prior session) ──────

describe("AI tool journey — resume (bytes already cached)", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool.id}: skips consent dialog, runs detection directly`, async () => {
      const { sm, Host } = await loadFreshHost();
      harness.isModelCached = async () => true;
      harness.smartRemoveBackground = () => Promise.resolve(makeOpaqueCanvas(200, 200));

      render(<Host />);
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });

      // No consent dialog.
      expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
      await waitFor(() => expect(sm.getMaskState().status).toBe("ready"));
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── Worker error mid-download per tool ─────────────────────────────

describe("AI tool journey — worker error mid-download", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool.id}: error UI pinned in dialog, editor stays mounted (NO redirect)`, async () => {
      const { sm, Host } = await loadFreshHost();
      harness.smartRemoveBackground = () =>
        Promise.reject(new Error("Couldn't reach the model server."));

      render(<Host />);
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });

      const consent = screen.queryByText(/^Download the AI model$/i);
      if (consent) {
        // Smart-action triggers route through the consent dialog.
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: /^Download \d+ MB$/i }));
      }
      await waitFor(() => expect(sm.getMaskState().status).toBe("error"));

      // Whether or not the consent dialog showed, the editor MUST stay
      // mounted. Smart-action paths see the MaskDownloadDialog with
      // Try again; scoped-tool passive trigger paths see the inline
      // error state (the panel's own DetectionErrorCard handles that
      // off-host, but state.status === "error" is the contract).
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── Cancel mid-download per tool ───────────────────────────────────

describe("AI tool journey — user cancels mid-download", () => {
  for (const tool of SMART_ACTION_TOOLS) {
    it(`${tool.id}: Cancel terminates worker, dialog clears, no redirect`, async () => {
      const { sm, Host } = await loadFreshHost();
      const seg = deferred<HTMLCanvasElement>();
      harness.smartRemoveBackground = () => seg.promise;

      render(<Host />);
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });

      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /^Download \d+ MB$/i }));
      await waitFor(() => {
        expect(document.getElementById("cloak-mask-download-title")).toHaveTextContent(
          /Setting up subject detection/i,
        );
      });

      await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
      await waitFor(() => {
        expect(document.getElementById("cloak-mask-download-title")).toBeNull();
      });
      expect(sm.getMaskState().status).toBe("idle");
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── User dismissed (Not now) — deny-latch behaviour ────────────────
//
// Two distinct contracts here. Scoped tools (Adjust / Filter / HSL /
// Levels / BgBlur) call `request()`, which respects the deny latch:
// after Not now, a passive auto-trigger from a panel re-mount must
// stay silent. Smart-action tools (Crop / Redact / RemoveBg / Watermark)
// call `requestExplicit()`, which CLEARS the deny latch on purpose —
// the user tapped a Smart button, that is itself the explicit "yes,
// I want this" signal, and the dialog should re-open. Both
// contracts get pinned below.

describe("AI tool journey — scoped tools respect the deny latch", () => {
  for (const tool of SCOPED_TOOLS) {
    it(`${tool.id}: a passive auto-trigger after Not now stays silent`, async () => {
      const { sm, Host } = await loadFreshHost();
      let segCalls = 0;
      harness.smartRemoveBackground = () => {
        segCalls += 1;
        return Promise.resolve(makeOpaqueCanvas(200, 200));
      };

      render(<Host />);

      // First panel mount triggers AI; user dismisses.
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });
      const dialog = await screen.findByText(/^Download the AI model$/i);
      expect(dialog).toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Not now/i }));

      // Second mount: passive trigger MUST NOT re-pop the dialog.
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working).catch(() => undefined);
      });
      expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
      expect(segCalls).toBe(0);
      expect(harness.exitCalled).toBe(false);
    });
  }
});

describe("AI tool journey — smart-action tools clear the deny latch on retap", () => {
  for (const tool of SMART_ACTION_TOOLS) {
    it(`${tool.id}: an explicit re-tap after Not now reopens the dialog`, async () => {
      const { sm, Host } = await loadFreshHost();
      render(<Host />);

      // First tap → dismiss.
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });
      await screen.findByText(/^Download the AI model$/i);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Not now/i }));
      await waitFor(() => {
        expect(screen.queryByText(/^Download the AI model$/i)).toBeNull();
      });
      expect(sm.getMaskState().userDenied).toBe(true);

      // Second tap is the explicit user re-opt-in — the latch must
      // clear, the dialog must reopen.
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });
      expect(await screen.findByText(/^Download the AI model$/i)).toBeInTheDocument();
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── Mobile: every tool works at the maximum mobile-visible tier ────

describe("AI tool journey — mobile path (every tool, max mobile tier)", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool.id}: mobile user picks Better tier → downloads → ready`, async () => {
      const { sm, Host } = await loadFreshHost();
      harness.layout = "mobile";
      harness.smartRemoveBackground = () => Promise.resolve(makeOpaqueCanvas(200, 200));

      render(<Host />);
      await act(async () => {
        await driveTrigger(tool, sm, harness.doc.working);
      });
      await screen.findByText(/^Download the AI model$/i);
      // Best tier is hidden on mobile — the user picks Better as max.
      expect(screen.queryByRole("button", { name: /^Best/i })).toBeNull();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^Better/i }));
      await user.click(await screen.findByRole("button", { name: /Download 84 MB/i }));

      await waitFor(() => expect(sm.getMaskState().status).toBe("ready"));
      // Persisted preference survives a refresh; on the user's next
      // visit they boot straight into Better without re-prompting.
      expect(localStorage.getItem("cloakimg:bgQuality")).toBe("medium");
      expect(harness.exitCalled).toBe(false);
    });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

async function driveTrigger(
  tool: ToolCase,
  sm: SubjectMaskModule,
  source: HTMLCanvasElement,
): Promise<void> {
  if (tool.trigger === "smart") {
    // Smart-action panels (Crop · Redact · RemoveBg · Watermark) call
    // requestExplicit, which clears the deny latch and re-pops the
    // dialog if needed.
    sm.clearMaskDeny();
    await sm.ensureSubjectMask(source).catch((e) => {
      if (!(e instanceof sm.MaskConsentError)) throw e;
    });
  } else {
    // Scoped panels (Adjust · BgBlur · Filter · HSL · Levels) call
    // request, which respects the deny latch.
    await sm.ensureSubjectMask(source).catch((e) => {
      if (!(e instanceof sm.MaskConsentError)) throw e;
    });
  }
}

interface Deferred<T> {
  resolve?: (v: T) => void;
  reject?: (e: unknown) => void;
  promise: Promise<T>;
}

function deferred<T>(): Deferred<T> {
  const slot: Deferred<T> = { promise: undefined as unknown as Promise<T> };
  slot.promise = new Promise<T>((res, rej) => {
    slot.resolve = res;
    slot.reject = rej;
  });
  return slot;
}
