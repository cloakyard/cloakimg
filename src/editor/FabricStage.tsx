// FabricStage.tsx — Fabric.js v6 canvas wrapper. Phase F1 scaffolding:
// the component is fully wired (mount, resize, doc.working as
// background, viewport-transform mirroring) but is not yet consumed by
// any tool. Phase F2 swaps it into ImageCanvas to take over layer
// rendering; Phases F3+ evolve it into the Crop overlay and the
// Select/Transform tool surface.
//
// Coordinate model
// ----------------
// We mirror the editor's `view` state (zoom + pan, doc-relative) into
// Fabric's `viewportTransform`. After this, Fabric's coordinate space
// matches the destructive-tool overlays exactly:
//
//     screen-space = image-space × scale + offset
//
// where `scale = fit * view.zoom` and `offset = center + view.pan`.

import { Canvas, FabricImage } from "fabric";
import { FABRIC_CANVAS_SELECTION } from "./fabricDefaults";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor } from "./EditorContext";

interface Props {
  /** Optional CSS overrides on the wrapping div. */
  style?: CSSProperties;
  /** Receives the live Fabric Canvas instance once mounted. Tools that
   *  add objects (text/draw/watermark/shapes) wire up here. */
  onReady?: (canvas: Canvas) => void;
}

/** ResizeObserver-driven, DPR-aware Fabric canvas mounted in a flex
 *  container. Renders `doc.working` as a non-selectable background and
 *  keeps the viewport in sync with the editor's zoom + pan. */
export function FabricStage({ style, onReady }: Props) {
  const { doc, view } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Track container size.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Create / dispose the Fabric canvas once per mount.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const fc = new Canvas(el, {
      width: 1,
      height: 1,
      preserveObjectStacking: true,
      // Selection is gated on the active tool — Phase F3's Move-tool
      // upgrade flips this on; everywhere else Fabric stays
      // non-interactive so tool overlays handle pointer events.
      selection: false,
      enableRetinaScaling: true,
      renderOnAddRemove: true,
      ...FABRIC_CANVAS_SELECTION,
      // Restore v6 click semantics: v7 fires mouse:* on right/middle
      // clicks by default, which we don't want for tool handlers.
      fireMiddleClick: false,
      fireRightClick: false,
      stopContextMenu: false,
    });
    fabricRef.current = fc;
    onReady?.(fc);
    return () => {
      fabricRef.current = null;
      void fc.dispose();
    };
    // onReady identity changes shouldn't recreate the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Match Fabric backing-store size to the container.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || size.w === 0 || size.h === 0) return;
    fc.setDimensions({ width: size.w, height: size.h });
    fc.requestRenderAll();
  }, [size.h, size.w]);

  // Set / refresh the background image when the doc's working canvas
  // identity changes (open, undo, replaceWithFile).
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !doc) return;
    let cancelled = false;
    // FabricImage v6 accepts an HTMLCanvasElement directly — no
    // dataURL round-trip needed.
    const bg = new FabricImage(doc.working, {
      selectable: false,
      evented: false,
      left: 0,
      top: 0,
      // Image is positioned in image-space; the viewport-transform
      // handles screen-space placement.
      originX: "left",
      originY: "top",
    });
    if (!cancelled) {
      fc.backgroundImage = bg;
      fc.requestRenderAll();
    }
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Mirror view (zoom + pan) into Fabric's viewportTransform.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !doc || size.w === 0 || size.h === 0) return;
    const margin = 24;
    const fit = Math.min((size.w - margin * 2) / doc.width, (size.h - margin * 2) / doc.height);
    const scale = fit * view.zoom;
    const offsetX = (size.w - doc.width * scale) / 2 + view.panX;
    const offsetY = (size.h - doc.height * scale) / 2 + view.panY;
    fc.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY]);
  }, [doc, size.h, size.w, view.panX, view.panY, view.zoom]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: "relative",
        background: "var(--canvas-bg)",
        overflow: "hidden",
        minHeight: 0,
        ...style,
      }}
    >
      <canvas ref={elRef} style={{ display: "block" }} />
    </div>
  );
}
