// EditorContext.commit.test.tsx — Regression test for the contract:
//
//   commit() MUST bump doc identity so consumers re-derive from the
//   now-mutated `doc.working`.
//
// The bug this guards against: smart actions (Smart Anonymize Person /
// Scene / Faces, batch-bake hooks, anything that mutates doc.working
// in place) write pixels into doc.working and call commit. If commit
// only bumps history version (and not doc identity), ImageCanvas's
// bg-image effect (deps: [doc, …]) doesn't re-fire — Fabric keeps
// rendering the cached background and the visible canvas stays on the
// PRE-bake frame ("preview not updating" reported by the user).
//
// The fix is one line in commit: `setDoc((prev) => prev ? {...prev} : prev)`.
// This test pins it: a regression that drops the spread would fail the
// "doc identity changes after commit" assertion.

import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { EditorDoc } from "./doc";

// createDoc constructs an EditorDoc from a StartChoice. The real path
// touches file APIs and the canvas pool; we mock it so the test focuses
// on the commit contract, not document construction.
function makeFakeDoc(): EditorDoc {
  const working = document.createElement("canvas");
  working.width = 16;
  working.height = 16;
  return {
    width: 16,
    height: 16,
    source: null,
    sourceBytes: null,
    sourceIsJpeg: false,
    working,
    exif: null,
    fileName: "test.png",
    layers: [],
    backgroundTreatment: "original",
  };
}

vi.mock("./doc", async () => {
  const actual = await vi.importActual<typeof import("./doc")>("./doc");
  return {
    ...actual,
    createDoc: vi.fn(() => Promise.resolve(makeFakeDoc())),
  };
});

// AI worker shutdown happens on EditorProvider unmount. Stub it so the
// test doesn't try to terminate a worker we never spawned.
vi.mock("./ai/runtime/runtime", () => ({
  shutdownAiWorker: () => undefined,
  runAi: () => Promise.reject(new Error("not used")),
}));

// Subject-mask + face-detect invalidation runs on doc swap. Stub.
vi.mock("./ai/subjectMask", () => ({
  invalidateSubjectMask: () => undefined,
}));
vi.mock("./ai/capabilities/detect-face/service", () => ({
  invalidateFaceDetection: () => undefined,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditorContext.commit contract", () => {
  it("bumps doc identity so ImageCanvas's bg-image effect re-fires after a smart-action / batch-bake", async () => {
    // Lazy-import after mocks land so the provider sees them.
    const { EditorProvider, useEditor } = await import("./EditorContext");

    // Probe records every doc reference the provider hands its
    // children. A new identity per commit shows up as a new entry.
    const seenDocs: (EditorDoc | null)[] = [];
    let triggerCommit: (() => void) | null = null;

    function Probe() {
      const { doc, commit } = useEditor();
      seenDocs.push(doc);
      triggerCommit = () => commit("test bake");
      return null;
    }

    await act(async () => {
      render(
        <EditorProvider
          initialDoc={{ kind: "blank", w: 16, h: 16, background: null }}
          onExit={() => undefined}
        >
          <Probe />
        </EditorProvider>,
      );
      // Let the createDoc promise resolve so doc transitions from
      // null → fake doc.
      await Promise.resolve();
      await Promise.resolve();
    });

    const beforeCommit = seenDocs[seenDocs.length - 1];
    expect(beforeCommit).not.toBeNull();
    const beforeIdentity = beforeCommit;

    await act(async () => {
      triggerCommit?.();
      await Promise.resolve();
    });

    const afterCommit = seenDocs[seenDocs.length - 1];
    expect(afterCommit).not.toBeNull();
    // The contract: commit() bumps doc identity. Without this,
    // ImageCanvas's bg-image effect doesn't re-fire after a smart
    // action mutates doc.working in place, and the user sees a
    // stale pre-bake preview. The width/height/fileName/etc.
    // SHOULDN'T change for an in-place bake — only the wrapper
    // object identity should.
    expect(afterCommit).not.toBe(beforeIdentity);
    expect(afterCommit?.working).toBe(beforeIdentity?.working);
    expect(afterCommit?.width).toBe(beforeIdentity?.width);
    expect(afterCommit?.height).toBe(beforeIdentity?.height);
  });
  it("cancels pending values across tool re-entry without applying or resetting the session on reselection", async () => {
    const { EditorProvider, useEditor } = await import("./EditorContext");
    let editor!: ReturnType<typeof useEditor>;
    function Probe() {
      editor = useEditor();
      return null;
    }
    await act(async () => {
      render(
        <EditorProvider
          initialDoc={{ kind: "blank", w: 16, h: 16, background: null }}
          onExit={() => undefined}
        >
          <Probe />
        </EditorProvider>,
      );
    });
    await act(async () => {
      await editor.setActiveTool("adjust");
    });
    const initial = editor.toolState.adjust;
    const apply = vi.fn();
    await act(async () => {
      editor.patchTool(
        "adjust",
        initial.map(() => 0.8),
      );
      editor.patchTool("curveRGB", [
        { x: 0, y: 20 },
        { x: 255, y: 255 },
      ]);
      editor.registerPendingApply(apply);
    });
    await act(async () => {
      await editor.setActiveTool("adjust");
    });
    expect(apply).not.toHaveBeenCalled();
    expect(editor.toolState.adjust[0]).toBe(0.8);
    await act(async () => {
      await editor.cancelCurrentTool();
    });
    expect(apply).not.toHaveBeenCalled();
    expect(editor.toolState.activeTool).toBe("move");
    await act(async () => {
      await editor.setActiveTool("adjust");
    });
    expect(editor.toolState.adjust).toEqual(initial);
    expect(editor.toolState.curveRGB).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(editor.canCancelCurrentTool).toBe(false);
  });
});
