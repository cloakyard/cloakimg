// useKeyboardShortcuts.ts — Global keyboard map for the editor.
//
// Tool keys: V/M/C/A/F/R/T/H/B/D/W/I/P/S (one per rail entry)
// `[` / `]` adjust brush size · `{` / `}` adjust feather
// `0` fit-zoom · `1` 100% zoom
// `Esc` clears layer selection
// `Delete` / `Backspace` remove the selected Fabric object(s)
//
// Skips when the user is typing into an input/textarea so caption /
// hex / numeric fields keep working unimpeded.

import type { ActiveSelection, Canvas as FabricCanvas } from "fabric";
import { useEffect } from "react";
import type { ToolId } from "./tools";
import type { ToolState } from "./toolState";

const TOOL_KEY_MAP: Record<string, ToolId> = {
  v: "move",
  m: "move",
  c: "crop",
  a: "adjust",
  f: "filter",
  r: "redact",
  t: "text",
  h: "spot",
  b: "bgrm",
  d: "draw",
  n: "pen",
  w: "mark",
  u: "shapes",
  k: "sticker",
  i: "color",
  e: "frame",
  s: "resize",
};

interface Args {
  setActiveTool: (id: ToolId) => void;
  patchTool: <K extends keyof ToolState>(key: K, value: ToolState[K]) => void;
  resetZoom: (mode: "fit" | "100") => void;
  toolState: ToolState;
  getFabricCanvas: () => FabricCanvas | null;
  commit: (label: string) => void;
}

export function useKeyboardShortcuts({
  setActiveTool,
  patchTool,
  resetZoom,
  toolState,
  getFabricCanvas,
  commit,
}: Args) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Delete / Backspace removes the selected Fabric object(s).
      // Runs before the input-focus guard so it works when the canvas
      // wrapper has focus, but still skips when an IText is in editing
      // mode (Fabric's IText handles backspace as text editing).
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isEditing(e.target)) return;
        const fc = getFabricCanvas();
        if (!fc) return;
        const active = fc.getActiveObject();
        if (!active) return;
        if (isObjectEditing(active)) return;
        if ((active as { cloakKind?: string }).cloakKind === "cloak:cropOverlay") return;
        e.preventDefault();
        const targets =
          active.type === "activeSelection"
            ? [...(active as ActiveSelection).getObjects()]
            : [active];
        fc.discardActiveObject();
        for (const obj of targets) fc.remove(obj);
        fc.requestRenderAll();
        commit("Delete layer");
        return;
      }

      if (isEditing(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Tool shortcuts
      const tool = TOOL_KEY_MAP[key];
      if (tool) {
        e.preventDefault();
        setActiveTool(tool);
        return;
      }

      // Brush size
      if (key === "[" || key === "]") {
        e.preventDefault();
        const delta = key === "[" ? -0.05 : 0.05;
        patchTool("brushSize", clamp01(toolState.brushSize + delta));
        return;
      }

      // Feather
      if (key === "{" || key === "}") {
        e.preventDefault();
        const delta = key === "{" ? -0.05 : 0.05;
        patchTool("feather", clamp01(toolState.feather + delta));
        return;
      }

      // Zoom
      if (key === "0") {
        e.preventDefault();
        resetZoom("fit");
        return;
      }
      if (key === "1") {
        e.preventDefault();
        resetZoom("100");
        return;
      }

      // Esc clears any selected layer
      if (e.key === "Escape" && toolState.selectedLayerId) {
        e.preventDefault();
        patchTool("selectedLayerId", null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    commit,
    getFabricCanvas,
    patchTool,
    resetZoom,
    setActiveTool,
    toolState.brushSize,
    toolState.feather,
    toolState.selectedLayerId,
  ]);
}

function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "INPUT") return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

function isObjectEditing(obj: unknown): boolean {
  // Fabric IText / Textbox set isEditing while the caret is active.
  return (obj as { isEditing?: boolean })?.isEditing === true;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
