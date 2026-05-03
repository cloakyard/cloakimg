// PenTool.tsx — Pen tool with two modes:
//
//   Create: empty-canvas click drops anchor points, drag from the
//   click extrudes symmetric bezier control handles. Enter /
//   double-click closes the path; Esc cancels in-progress.
//
//   Edit: click an existing pen path — anchor handles render on top
//   of it, drag a handle to reshape the path. Persisted anchors live
//   on `cloakAnchors` so they survive undo / redo and the Fabric
//   scene hand-off across tool swaps.
//
// In-progress work path is tagged `cloak:penWork`. Committed paths
// are tagged `cloak:shape` so the Layers panel + Delete-key handler
// pick them up alongside other Shapes. Anchor handles themselves are
// tagged `cloak:penAnchor` and filtered out of the Fabric hand-off
// snapshot in the same place we drop the Crop overlay.

import { Circle, type FabricObject, Path, type TPointerEventInfo } from "fabric";
import { useEffect, useRef } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { buildPenD, type PenAnchor } from "./penPath";

const WORK_TAG = "cloak:penWork";
const COMMIT_TAG = "cloak:shape";
const ANCHOR_TAG = "cloak:penAnchor";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
  cloakAnchors?: PenAnchor[];
  /** Index of this anchor handle in its parent path's anchor list.
   *  Only set on `cloak:penAnchor` Circles. */
  cloakAnchorIndex?: number;
  /** Back-pointer from an anchor handle to its parent Path. */
  cloakAnchorParent?: FabricObject;
}

export function PenTool() {
  const { getFabricCanvas, doc, toolState, commit } = useEditor();
  const anchorsRef = useRef<PenAnchor[]>([]);
  const draggingRef = useRef(false);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const pathRef = useRef<Path | null>(null);

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    const isPenPath = (obj: FabricObject | null | undefined): obj is FabricObject => {
      if (!obj) return false;
      const o = obj as TaggedFabricObject;
      return o.cloakKind === COMMIT_TAG && Array.isArray(o.cloakAnchors);
    };

    const removeAnchorHandles = () => {
      const handles = fc
        .getObjects()
        .filter((o) => (o as TaggedFabricObject).cloakKind === ANCHOR_TAG);
      if (handles.length === 0) return;
      fc.remove(...handles);
    };

    const renderAnchorHandles = (target: FabricObject) => {
      removeAnchorHandles();
      const anchors = (target as TaggedFabricObject).cloakAnchors ?? [];
      const radius = 5;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (!a) continue;
        const c = new Circle({
          left: a.x,
          top: a.y,
          radius,
          fill: "#ffffff",
          stroke: "#f5613a",
          strokeWidth: 1.5,
          originX: "center",
          originY: "center",
          hasControls: false,
          hasBorders: false,
          selectable: true,
          evented: true,
          objectCaching: false,
        });
        const tagged = c as TaggedFabricObject;
        tagged.cloakKind = ANCHOR_TAG;
        tagged.cloakAnchorIndex = i;
        tagged.cloakAnchorParent = target;
        fc.add(c);
        fc.bringObjectToFront(c);
      }
      fc.requestRenderAll();
    };

    const rebuildPathFromAnchors = (parent: FabricObject) => {
      const tagged = parent as TaggedFabricObject;
      const anchors = tagged.cloakAnchors ?? [];
      const d = buildPenD(anchors);
      if (!d) return;
      // Construct a fresh Path from the new d; copying style + tags +
      // anchors over. Replacing the object is more reliable than
      // mutating `path` / `pathOffset` in place — Fabric caches
      // bounding boxes and stroke decoration.
      const fresh = new Path(d, {
        fill: parent.fill ?? "",
        stroke: parent.stroke ?? "#1e1a16",
        strokeWidth: parent.strokeWidth ?? 2,
        strokeUniform: true,
        opacity: parent.opacity ?? 1,
        selectable: true,
        hasControls: true,
        hasBorders: true,
      });
      const freshTagged = fresh as TaggedFabricObject;
      freshTagged.cloakKind = COMMIT_TAG;
      freshTagged.cloakAnchors = anchors.map((a) => ({ ...a }));
      const idx = fc.getObjects().indexOf(parent);
      fc.remove(parent);
      fc.insertAt(idx >= 0 ? idx : fc.getObjects().length, fresh);
      fc.setActiveObject(fresh);
      // Re-render handles against the fresh parent so anchor
      // back-pointers point at the live object.
      renderAnchorHandles(fresh);
    };

    const buildD = (anchors: PenAnchor[], hover: { x: number; y: number } | null) => {
      let d = buildPenD(anchors);
      // Rubber-band preview from last anchor → cursor while not dragging.
      if (d && hover && !draggingRef.current) {
        const last = anchors[anchors.length - 1];
        if (last) {
          if (last.cOut) {
            d += ` C ${last.cOut.x},${last.cOut.y} ${hover.x},${hover.y} ${hover.x},${hover.y}`;
          } else {
            d += ` L ${hover.x},${hover.y}`;
          }
        }
      }
      return d || null;
    };

    const rebuild = () => {
      const d = buildD(anchorsRef.current, hoverRef.current);
      if (!d) {
        if (pathRef.current) {
          fc.remove(pathRef.current);
          pathRef.current = null;
        }
        fc.requestRenderAll();
        return;
      }
      // Mutate the existing path in place when we have one — fabric's
      // `_setPath` re-parses the d string and updates the path data +
      // bbox without the cost of a remove + new Path + add cycle. This
      // is the per-mousemove hot path; the previous version churned a
      // fresh Path on every tick.
      if (pathRef.current) {
        const p = pathRef.current as Path & {
          _setPath: (data: string, adjustPosition?: boolean) => void;
        };
        p._setPath(d, true);
        // Style can change mid-sketch from the panel.
        p.set({
          fill: toolState.penFill === "transparent" ? "" : toolState.penFill,
          stroke: toolState.penStroke,
          strokeWidth: toolState.penStrokeWidth,
        });
        p.dirty = true;
        fc.requestRenderAll();
        return;
      }
      const p = new Path(d, {
        fill: toolState.penFill === "transparent" ? "" : toolState.penFill,
        stroke: toolState.penStroke,
        strokeWidth: toolState.penStrokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      const tagged = p as TaggedFabricObject;
      tagged.cloakKind = WORK_TAG;
      fc.add(p);
      pathRef.current = p;
      fc.requestRenderAll();
    };

    const finishCommit = () => {
      hoverRef.current = null;
      const d = buildPenD(anchorsRef.current);
      const anchors = anchorsRef.current.map((a) => ({ ...a }));
      if (pathRef.current) {
        fc.remove(pathRef.current);
        pathRef.current = null;
      }
      anchorsRef.current = [];
      draggingRef.current = false;
      if (!d) return;
      const p = new Path(d, {
        fill: toolState.penFill === "transparent" ? "" : toolState.penFill,
        stroke: toolState.penStroke,
        strokeWidth: toolState.penStrokeWidth,
        strokeUniform: true,
        selectable: true,
        hasControls: true,
        hasBorders: true,
      });
      const tagged = p as TaggedFabricObject;
      tagged.cloakKind = COMMIT_TAG;
      tagged.cloakAnchors = anchors;
      fc.add(p);
      fc.setActiveObject(p);
      fc.requestRenderAll();
      commit("Pen path");
      // Show editing handles on the just-committed path so the user
      // can immediately fine-tune.
      renderAnchorHandles(p);
    };

    const cancel = () => {
      hoverRef.current = null;
      if (pathRef.current) {
        fc.remove(pathRef.current);
        pathRef.current = null;
      }
      anchorsRef.current = [];
      draggingRef.current = false;
      fc.requestRenderAll();
    };

    const onMouseDown = (opt: TPointerEventInfo) => {
      // Click on an existing pen path → enter edit mode for it.
      const target = opt.target as TaggedFabricObject | null;
      if (target && target.cloakKind === ANCHOR_TAG) {
        // Anchor handles handle their own drag via Fabric; ignore.
        return;
      }
      if (target && isPenPath(target)) {
        cancel();
        fc.setActiveObject(target);
        renderAnchorHandles(target);
        fc.requestRenderAll();
        return;
      }
      if (target) {
        // Some other object was clicked — exit any edit-mode handles
        // and let Fabric handle selection.
        removeAnchorHandles();
        return;
      }

      const p = fc.getScenePoint(opt.e);
      if (p.x < 0 || p.y < 0 || p.x > doc.width || p.y > doc.height) return;
      // Click within ~6 px of first anchor closes the path.
      const first = anchorsRef.current[0];
      if (first && anchorsRef.current.length >= 2) {
        const dx = p.x - first.x;
        const dy = p.y - first.y;
        if (dx * dx + dy * dy < 36) {
          anchorsRef.current.push({ x: first.x, y: first.y, cIn: first.cIn });
          finishCommit();
          return;
        }
      }
      // Empty click while editing an existing path → exit edit mode.
      if (fc.getObjects().some((o) => (o as TaggedFabricObject).cloakKind === ANCHOR_TAG)) {
        removeAnchorHandles();
        fc.discardActiveObject();
        fc.requestRenderAll();
        return;
      }
      anchorsRef.current.push({ x: p.x, y: p.y });
      draggingRef.current = true;
      rebuild();
    };

    const onMouseMove = (opt: TPointerEventInfo) => {
      const p = fc.getScenePoint(opt.e);
      hoverRef.current = { x: p.x, y: p.y };
      if (draggingRef.current) {
        const a = anchorsRef.current[anchorsRef.current.length - 1];
        if (!a) return;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        if (dx * dx + dy * dy > 4) {
          a.cOut = { x: p.x, y: p.y };
          a.cIn = { x: a.x - dx, y: a.y - dy };
        }
      }
      // While creating, refresh the rubber-band; while in edit mode
      // there's no in-progress path so skip the rebuild for performance.
      if (anchorsRef.current.length > 0) rebuild();
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      if (anchorsRef.current.length > 0) rebuild();
    };

    // Handle drag → update anchor coords + rebuild the parent path.
    const onObjectMoving = (opt: { target?: FabricObject }) => {
      const obj = opt.target;
      if (!obj) return;
      const tagged = obj as TaggedFabricObject;
      if (tagged.cloakKind !== ANCHOR_TAG) return;
      const parent = tagged.cloakAnchorParent;
      const idx = tagged.cloakAnchorIndex ?? -1;
      if (!parent || idx < 0) return;
      const anchors = (parent as TaggedFabricObject).cloakAnchors;
      if (!anchors) return;
      const next = anchors.slice();
      const a = next[idx];
      if (!a) return;
      // Keep the bezier handles offset by the same delta as the
      // anchor itself so the curve travels with the moved point.
      const dx = (obj.left ?? a.x) - a.x;
      const dy = (obj.top ?? a.y) - a.y;
      next[idx] = {
        x: obj.left ?? a.x,
        y: obj.top ?? a.y,
        cIn: a.cIn ? { x: a.cIn.x + dx, y: a.cIn.y + dy } : undefined,
        cOut: a.cOut ? { x: a.cOut.x + dx, y: a.cOut.y + dy } : undefined,
      };
      (parent as TaggedFabricObject).cloakAnchors = next;
      // Repaint without rebuilding (cheaper while dragging).
      const d = buildPenD(next);
      if (d) {
        // Mutate path string directly — fabric reparses on next render.
        (parent as Path).set({ path: (parent as Path).path });
        // For a true reshape we need a new Path object; do that on
        // mouse:up to avoid thrashing during drag. Keep the visible
        // marker move on the handle itself; user sees the live shape
        // refresh on release.
      }
    };

    const onObjectModified = (opt: { target?: FabricObject }) => {
      const obj = opt.target;
      if (!obj) return;
      const tagged = obj as TaggedFabricObject;
      if (tagged.cloakKind !== ANCHOR_TAG) return;
      const parent = tagged.cloakAnchorParent;
      if (!parent) return;
      rebuildPathFromAnchors(parent);
      commit("Edit pen path");
    };

    const onSelectionCleared = () => {
      removeAnchorHandles();
    };

    const onKey = (e: KeyboardEvent) => {
      if (anchorsRef.current.length === 0) {
        if (e.key === "Escape") removeAnchorHandles();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        finishCommit();
      }
    };

    const onDouble = () => {
      if (anchorsRef.current.length >= 2) finishCommit();
    };

    fc.on("mouse:down", onMouseDown);
    fc.on("mouse:move", onMouseMove);
    fc.on("mouse:up", onMouseUp);
    fc.on("mouse:dblclick", onDouble);
    fc.on("object:moving", onObjectMoving);
    fc.on("object:modified", onObjectModified);
    fc.on("selection:cleared", onSelectionCleared);
    window.addEventListener("keydown", onKey);

    // If the active selection is already a pen path on tool mount,
    // drop straight into edit mode for it.
    const active = fc.getActiveObject();
    if (active && isPenPath(active)) renderAnchorHandles(active);

    return () => {
      fc.off("mouse:down", onMouseDown);
      fc.off("mouse:move", onMouseMove);
      fc.off("mouse:up", onMouseUp);
      fc.off("mouse:dblclick", onDouble);
      fc.off("object:moving", onObjectMoving);
      fc.off("object:modified", onObjectModified);
      fc.off("selection:cleared", onSelectionCleared);
      window.removeEventListener("keydown", onKey);
      // Tear-down: drop in-progress work + anchor handles.
      if (pathRef.current) {
        fc.remove(pathRef.current);
        pathRef.current = null;
      }
      removeAnchorHandles();
      anchorsRef.current = [];
      draggingRef.current = false;
      hoverRef.current = null;
      fc.requestRenderAll();
    };
  }, [commit, doc, getFabricCanvas, toolState]);

  useStageProps({ fabricInteractive: true, cursor: "crosshair" });
  return null;
}
