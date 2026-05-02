// DrawTool.tsx — Phase F2-B-4. Fabric `PencilBrush`-driven freehand
// drawing.
//
//   • Pen mode: each stroke is committed as a Fabric `Path` tagged
//     `cloak:drawStroke`. Fabric's brush smoothing replaces our naive
//     sub-pixel drop, and free transform / drag is available the moment
//     Phase F3's Move tool flips selection on.
//   • Eraser mode: a transient stroke is drawn, then its bounding rect
//     is intersected against existing draw strokes; any whose bbox
//     overlaps gets removed. The eraser stroke itself is dropped on
//     commit so it doesn't accumulate as a layer. Cmd-Z reverses the
//     full erase.
//
// `fabricInteractive` is on so Fabric's brush captures pointer events.
// Pinch-zoom + Space-pan still bubble through the wrapper.

import { type FabricObject, type Path, PencilBrush } from "fabric";
import { useEffect } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";

/** Fabric `cloakKind` tag for free-form pen strokes. */
export const DRAW_TAG = "cloak:drawStroke";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

interface PathCreatedEvent {
  path: Path;
}

export function DrawTool() {
  const { getFabricCanvas, toolState, commit } = useEditor();
  const isEraser = toolState.drawMode === 1;

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;

    fc.isDrawingMode = true;
    const brush = new PencilBrush(fc);
    brush.color = isEraser ? "rgba(255,255,255,0.6)" : toolState.drawColor;
    brush.width = toolState.drawSize;
    fc.freeDrawingBrush = brush;

    const onPathCreated = (opt: PathCreatedEvent) => {
      const path = opt.path;
      if (isEraser) {
        const eraserBox = path.getBoundingRect();
        for (const obj of fc.getObjects()) {
          if ((obj as TaggedFabricObject).cloakKind !== DRAW_TAG) continue;
          if (rectsIntersect(eraserBox, obj.getBoundingRect())) {
            fc.remove(obj);
          }
        }
        // Drop the visible eraser stroke itself — it was just a visual.
        fc.remove(path);
        fc.requestRenderAll();
        commit("Erase");
        return;
      }
      (path as TaggedFabricObject).cloakKind = DRAW_TAG;
      commit("Draw stroke");
    };
    fc.on("path:created", onPathCreated);

    return () => {
      fc.isDrawingMode = false;
      fc.off("path:created", onPathCreated);
    };
  }, [commit, getFabricCanvas, isEraser, toolState.drawColor, toolState.drawSize]);

  useStageProps({ fabricInteractive: true, cursor: isEraser ? "cell" : "crosshair" });
  return null;
}

interface BoundingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectsIntersect(a: BoundingRect, b: BoundingRect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}
