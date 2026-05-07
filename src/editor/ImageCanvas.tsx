// ImageCanvas.tsx — Fabric.js-backed canvas wrapper. Phase F2-A.
//
// History
// -------
// Pre-Fabric, this component owned a single 2D canvas, manually drew
// `doc.working` + every layer + every tool overlay, and translated
// React pointer events into image-space coords for tools.
//
// As of Phase F2-A, a Fabric.js `Canvas` owns the actual rendering
// surface:
//
//   • `doc.working` (or the compare/preview source) is set as a Fabric
//     `backgroundImage`. Fabric handles the bitmap blit.
//   • The editor's pan + zoom mirror into Fabric's `viewportTransform`,
//     so a single coordinate model serves both Fabric objects and the
//     legacy 2D drawing path.
//   • Layer rendering (`drawLayers`) and per-tool overlays
//     (`paintOverlay`) live in an `after:render` hook that paints onto
//     Fabric's lower-canvas 2D context. Output is identical to
//     pre-Fabric, but the surface is now Fabric-managed.
//   • React pointer / wheel handlers stay on the wrapper div; Fabric
//     is configured non-interactive (`selection: false`) so events
//     bubble through unobstructed. Pinch-zoom keeps working.
//
// Phase F2-B will migrate Text / Watermark / WatermarkImage / Draw
// layer types onto Fabric objects one at a time, removing them from
// `drawLayers` as each lands. Phase F3 enables Fabric's selection /
// transform handles when the Move tool is active.

import { Canvas, type FabricObject, FabricImage, Point } from "fabric";
import { get2DContext } from "./colorSpace";
import { FABRIC_CANVAS_SELECTION } from "./fabricDefaults";
import { snapshotPersistentObjects } from "./tools/penPath";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEditor } from "./EditorContext";
import type { ToolState } from "./toolState";

interface Props {
  /** Tool-specific overlay painter. Receives the visible canvas's 2D
   *  context, the image-to-screen transform, and current tool state. */
  paintOverlay?: (
    ctx: CanvasRenderingContext2D,
    transform: Transform,
    toolState: ToolState,
  ) => void;
  /** Tool-specific pointer handlers in image-space coords. */
  onImagePointerDown?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  onImagePointerMove?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  onImagePointerUp?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Optional cursor override. */
  cursor?: CSSProperties["cursor"];
  /** Hide the floating zoom + Space-to-pan hints (e.g. during drag). */
  hideHints?: boolean;
  /** Live CSS filter preview applied to the canvas display (Adjust /
   *  Filter tools). Doesn't touch the underlying buffer. */
  cssFilter?: string;
  /** Optional non-destructive preview source. When provided, the canvas
   *  draws this instead of `doc.working`. */
  previewCanvas?: HTMLCanvasElement | null;
  /** Bumps on every successful preview bake. The bake's output canvas
   *  comes from a small LIFO pool, so consecutive bakes can hand back
   *  the same element with different pixels — without a version, our
   *  `previewCanvas`-keyed effect would shallow-bail and Fabric would
   *  keep showing the cached rasterisation of the previous frame.
   *  This counter forces the effect to refire even when the canvas
   *  reference aliases the previous one. */
  previewVersion?: number;
  /** Set to true while a tool wants Fabric to handle pointer events
   *  natively (selection / IText editing / free transform). Flips
   *  Fabric's `selection` flag on and lets the host div forward
   *  pointer events to Fabric's upper canvas. Other tools keep this
   *  off so React's tool-specific pointer handlers run instead. */
  fabricInteractive?: boolean;
}

/** Image → screen transform plus image-space dimensions. */
export interface Transform {
  /** Image-space origin in screen-space pixels (top-left of image). */
  ox: number;
  oy: number;
  /** Image-space → screen-space scale. */
  scale: number;
  /** Visible canvas dimensions. */
  cw: number;
  ch: number;
  /** Image dimensions in image-space pixels. */
  iw: number;
  ih: number;
}

export interface ImagePoint {
  x: number;
  y: number;
  inside: boolean;
}

export function ImageCanvas({
  paintOverlay,
  onImagePointerDown,
  onImagePointerMove,
  onImagePointerUp,
  cursor,
  hideHints,
  cssFilter,
  previewCanvas,
  previewVersion,
  fabricInteractive,
}: Props) {
  const {
    doc,
    view,
    setView,
    toolState,
    layers,
    compareActive,
    baseCanvas,
    setFabricCanvas,
    captureFabricSnapshot,
    peekFabricSnapshot,
    commit,
    undo,
  } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  // Fabric inserts a wrapper div + two canvases, then disposes the
  // whole structure on unmount. We mount it inside a host div we own
  // via React, but never let React touch the canvas itself — that
  // avoids the well-known "Failed to execute 'removeChild'" crash
  // when React tries to unmount a node Fabric has already removed.
  const fabricHostRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const panRef = useRef<{
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);
  // Track concurrent pointers for pinch-zoom + two-finger pan on touch
  // devices. The pinch ref captures the starting distance + zoom +
  // midpoint + pan, so the move handler can drive both gestures from
  // the same two-pointer session.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  // Two-finger-tap → undo. The gesture starts when a second pointer
  // joins; if both pointers come up within ~280 ms with negligible
  // movement (< ~10 px from the start midpoint and minimal pinch
  // change) we treat the lift as a tap and fire undo. Any meaningful
  // pinch / pan invalidates the tap.
  //
  // To avoid firing after a single-finger tool tap (Spot Heal, Color
  // Picker, Redact-rect drag-start) where a second finger brushed
  // against the screen mid-gesture, we also require the second pointer
  // to arrive within `TWO_FINGER_GAP_MS` of the first. A genuine
  // two-finger tap lands both fingers within ~50 ms; a one-finger
  // gesture followed by an accidental brush usually has a much
  // longer gap.
  const firstPointerDownTimeRef = useRef<number | null>(null);
  const twoFingerTapRef = useRef<{
    startTime: number;
    startMidX: number;
    startMidY: number;
    startDist: number;
    valid: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startMidX: number;
    startMidY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // Resize observer — keep the canvas filling the container.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Force a re-paint when an off-document watermark image finishes loading.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const onLoad = () => {
      forceTick((n) => n + 1);
      fabricRef.current?.requestRenderAll();
    };
    window.addEventListener("cloakimg:watermark-image-loaded", onLoad);
    return () => window.removeEventListener("cloakimg:watermark-image-loaded", onLoad);
  }, []);

  // Track Space for pan-on-drag.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const t = e.target as HTMLElement | null;
        const editing =
          t?.tagName === "INPUT" ||
          t?.tagName === "TEXTAREA" ||
          (t as HTMLElement | null)?.isContentEditable;
        if (editing) return;
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Compute image → screen transform; mirrors into Fabric's viewport.
  const transform: Transform = useMemo(
    () => computeTransform(doc?.width ?? 0, doc?.height ?? 0, size, view),
    [doc?.width, doc?.height, size, view],
  );

  // Active alignment guides, populated by the `object:moving` handler
  // and consumed by the `after:render` hook to paint snap lines.
  const guidesRef = useRef<Array<{ axis: "v" | "h"; pos: number }>>([]);

  // Stable refs for the after:render hook, which is registered once on
  // the Fabric instance but needs the latest layers + overlay + tool
  // state on every render pass.
  const renderStateRef = useRef({
    layers,
    paintOverlay,
    toolState,
    transform,
  });
  renderStateRef.current = { layers, paintOverlay, toolState, transform };

  // Create / dispose the Fabric canvas once per mount. We allocate the
  // raw <canvas> ourselves and append it to a React-owned host div;
  // Fabric then wraps it (inserting its own wrapper + upper canvas).
  // On cleanup we dispose Fabric *first*, which removes the entire
  // wrapper, before React unmounts the host div — this avoids the
  // common "Failed to execute removeChild on Node" crash.
  useEffect(() => {
    const host = fabricHostRef.current;
    if (!host) return;
    const el = document.createElement("canvas");
    host.appendChild(el);
    // Pre-bind the canvas to display-p3 (where supported) before Fabric
    // takes ownership — Fabric's internal getContext("2d") will then
    // return the already-bound wide-gamut context.
    get2DContext(el);
    const fc = new Canvas(el, {
      width: 1,
      height: 1,
      preserveObjectStacking: true,
      selection: false,
      enableRetinaScaling: true,
      backgroundColor: "transparent",
      ...FABRIC_CANVAS_SELECTION,
      // Restore v6 click semantics: only left-click fires mouse:* events.
      // Without this, v7 surfaces right/middle clicks to tool handlers,
      // which would drop stickers / shapes / text on context-menu clicks.
      fireMiddleClick: false,
      fireRightClick: false,
      stopContextMenu: false,
      // Fabric still attaches some listeners even with selection: false;
      // tool pointer events work because we keep React handlers on the
      // outer wrapper div, which sees events bubbling through Fabric's
      // canvas children.
    });
    fabricRef.current = fc;
    setFabricCanvas(fc);

    // Restore the Fabric scene from the previous tool's ImageCanvas
    // (or, on first mount, do nothing — the snapshot ref is null until
    // an unmount captures one). Without this, every tool switch would
    // dispose the IText / shapes / placed images / stickers the user
    // built up under the previous tool.
    const carry = peekFabricSnapshot();
    if (carry) {
      void fc
        .loadFromJSON(carry)
        .then(() => fc.requestRenderAll())
        .catch(() => undefined);
    }

    // Legacy layer + overlay rendering happens here, on top of whatever
    // Fabric just drew. We use the lower-canvas 2D context (where
    // Fabric also draws) so per-tool overlays paint last (on top of
    // both backgroundImage and Fabric objects). Layer types are now
    // all Fabric objects (Phases F2-B-1/2/3/4) so we no longer call
    // a custom drawLayers here.
    const onAfter = () => {
      const ctx = fc.lowerCanvasEl.getContext("2d");
      if (!ctx) return;
      const { paintOverlay: po, toolState: ts, transform: tx } = renderStateRef.current;
      ctx.save();
      po?.(ctx, tx, ts);
      ctx.restore();
      // Alignment guides — drawn in screen space across the whole
      // canvas, so they read as full-canvas affordances (matches the
      // way Figma / Sketch / Pixelmator render snap-lines).
      const guides = guidesRef.current;
      if (guides.length > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(245, 97, 58, 0.95)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const g of guides) {
          ctx.beginPath();
          if (g.axis === "v") {
            const sx = tx.ox + g.pos * tx.scale;
            ctx.moveTo(sx + 0.5, 0);
            ctx.lineTo(sx + 0.5, ctx.canvas.height);
          } else {
            const sy = tx.oy + g.pos * tx.scale;
            ctx.moveTo(0, sy + 0.5);
            ctx.lineTo(ctx.canvas.width, sy + 0.5);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    fc.on("after:render", onAfter);

    return () => {
      // Snapshot the user-added objects only (no canvas-level state)
      // before disposing so the next tool's ImageCanvas can restore
      // IText / shapes / stickers / placed images / draw paths /
      // watermark / pen paths on remount. The helper drops the
      // transient overlays (Crop rect, Pen in-progress, Pen anchor
      // handles) so they don't ghost-survive the tool swap. We
      // intentionally exclude the canvas's backgroundImage and
      // viewportTransform: ImageCanvas owns those via separate
      // effects, and a serialized bg loses its live `doc.working`
      // canvas link.
      try {
        captureFabricSnapshot(snapshotPersistentObjects(fc));
      } catch {
        captureFabricSnapshot(null);
      }
      fc.off("after:render", onAfter);
      fabricRef.current = null;
      setFabricCanvas(null);
      void fc.dispose();
    };
  }, [captureFabricSnapshot, peekFabricSnapshot, setFabricCanvas]);

  // Match Fabric backing-store size to the container.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || size.w === 0 || size.h === 0) return;
    fc.setDimensions({ width: size.w, height: size.h });
    fc.requestRenderAll();
  }, [size.h, size.w]);

  // Flip Fabric selection on/off as the active tool requests.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.selection = !!fabricInteractive;
    if (!fabricInteractive) {
      fc.discardActiveObject();
    }
    fc.requestRenderAll();
  }, [fabricInteractive]);

  // Commit any Fabric transform (drag / scale / rotate) to history.
  // Tool-level commits (TextTool's edits, Crop's bake, etc.) still fire
  // their own labels — this catches Move-tool transforms and any other
  // free-form Fabric mutation.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    const onMod = () => commit("Edit layer");
    fc.on("object:modified", onMod);
    return () => {
      fc.off("object:modified", onMod);
    };
  }, [commit]);

  // Alignment guides — for each moving object, find the nearest
  // doc-edge / doc-center / sibling-edge / sibling-center within
  // `SNAP_PX` (image-space) on each axis, snap to it, and remember
  // it so the after:render hook can paint a snap line. Phase F4.5
  // upgrade of the F4 center-axis-only snap.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !doc) return;
    const SNAP_PX = 6;

    const onMoving = (opt: { target?: FabricObject }) => {
      const obj = opt.target;
      if (!obj) return;
      const cloakKind = (obj as { cloakKind?: string }).cloakKind;
      if (cloakKind === "cloak:cropOverlay") return;

      const bbox = obj.getBoundingRect();
      const myEdges = {
        v: [bbox.left, bbox.left + bbox.width / 2, bbox.left + bbox.width],
        h: [bbox.top, bbox.top + bbox.height / 2, bbox.top + bbox.height],
      };

      // Candidate snap targets: doc edges + center, and every other
      // object's edges + center.
      const targetsV: number[] = [0, doc.width / 2, doc.width];
      const targetsH: number[] = [0, doc.height / 2, doc.height];
      for (const o of fc.getObjects()) {
        if (o === obj) continue;
        const k = (o as { cloakKind?: string }).cloakKind;
        if (k === "cloak:cropOverlay") continue;
        const r = o.getBoundingRect();
        targetsV.push(r.left, r.left + r.width / 2, r.left + r.width);
        targetsH.push(r.top, r.top + r.height / 2, r.top + r.height);
      }

      let bestV: { delta: number; target: number } | null = null;
      let bestH: { delta: number; target: number } | null = null;
      for (const my of myEdges.v) {
        for (const t of targetsV) {
          const d = t - my;
          if (Math.abs(d) < SNAP_PX && (!bestV || Math.abs(d) < Math.abs(bestV.delta))) {
            bestV = { delta: d, target: t };
          }
        }
      }
      for (const my of myEdges.h) {
        for (const t of targetsH) {
          const d = t - my;
          if (Math.abs(d) < SNAP_PX && (!bestH || Math.abs(d) < Math.abs(bestH.delta))) {
            bestH = { delta: d, target: t };
          }
        }
      }

      const center = obj.getCenterPoint();
      let nx = center.x;
      let ny = center.y;
      if (bestV) nx = center.x + bestV.delta;
      if (bestH) ny = center.y + bestH.delta;
      if (bestV || bestH) {
        obj.setPositionByOrigin(new Point(nx, ny), "center", "center");
      }

      const next: Array<{ axis: "v" | "h"; pos: number }> = [];
      if (bestV) next.push({ axis: "v", pos: bestV.target });
      if (bestH) next.push({ axis: "h", pos: bestH.target });
      guidesRef.current = next;
    };

    const clear = () => {
      if (guidesRef.current.length === 0) return;
      guidesRef.current = [];
      fc.requestRenderAll();
    };

    fc.on("object:moving", onMoving);
    fc.on("mouse:up", clear);
    fc.on("selection:cleared", clear);
    return () => {
      fc.off("object:moving", onMoving);
      fc.off("mouse:up", clear);
      fc.off("selection:cleared", clear);
    };
  }, [doc]);

  // Mirror view (zoom + pan) into Fabric's viewportTransform.
  // Fabric will apply this to the backgroundImage and any objects.
  // Tool overlays in `after:render` run in identity space, so they
  // continue to use the `transform` directly.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || size.w === 0 || size.h === 0) return;
    fc.setViewportTransform([transform.scale, 0, 0, transform.scale, transform.ox, transform.oy]);
    fc.requestRenderAll();
  }, [size.h, size.w, transform.ox, transform.oy, transform.scale]);

  // Set / refresh the backgroundImage when the source canvas swaps
  // (open, undo, replaceWithFile, compare toggle, preview canvas).
  //
  // We reuse a single FabricImage and just swap its element + scale on
  // each refresh. The previous version constructed a new FabricImage
  // every time `previewCanvas` changed — and `useAdjustPreview`
  // produces a fresh canvas every rAF during a slider drag, so the
  // editor was allocating Fabric objects (and recomputing bbox state)
  // ~60×/sec. Reusing the bg cuts that to a single setElement call.
  const bgImageRef = useRef<FabricImage | null>(null);
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !doc) return;
    const sourceCanvas = compareActive
      ? (baseCanvas() ?? doc.working)
      : (previewCanvas ?? doc.working);
    // Adjust/Filter previews are downsampled (see useAdjustPreview), so
    // their pixel dimensions are smaller than the doc's image-space.
    // Stretch the FabricImage so it covers the full doc rect — otherwise
    // the bg renders tiny in the corner.
    const scaleX = doc.width / sourceCanvas.width;
    const scaleY = doc.height / sourceCanvas.height;
    let bg = bgImageRef.current;
    // Treat a Fabric-disposed bg (no canvas reference) as missing so
    // canvas teardown + remount doesn't leave us pointing at a dead
    // object across StageHost re-mounts.
    if (!bg || (bg as { canvas?: unknown }).canvas === null) {
      bg = new FabricImage(sourceCanvas, {
        selectable: false,
        evented: false,
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        scaleX,
        scaleY,
      });
      bgImageRef.current = bg;
    } else {
      bg.setElement(sourceCanvas);
      // Always re-set the intrinsic width/height alongside scale —
      // when the underlying preview canvas changes size (e.g. a Crop
      // shrinks the doc, or the user moves between full-res and a
      // downsampled live-preview canvas) Fabric won't resize the
      // FabricImage on its own and the bg renders at the previous
      // dimensions, scaled to the new doc rect — i.e. the wrong
      // pixels mapped onto the same screen rectangle.
      bg.set({
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        scaleX,
        scaleY,
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
      });
      // Fabric.js caches each object's rasterised output. `setElement`
      // updates the source canvas reference but doesn't reliably
      // invalidate the cache pattern — without this explicit `dirty`
      // flag, swapping the bg to a fresh per-frame Adjust/Filter
      // preview canvas would paint the OLD pixels until something
      // else marked the object dirty (e.g. a dimension change). The
      // explicit flag is the belt-and-suspenders fix: even if Fabric
      // already marked dirty for a scale change, we don't trust that
      // for the element swap.
      bg.dirty = true;
    }
    fc.backgroundImage = bg;
    // Bilinear filtering on upscale (preview is ~720px long edge); without
    // this the upscaled preview looks grainy on hi-DPI screens.
    const ctx = fc.lowerCanvasEl.getContext("2d");
    if (ctx) ctx.imageSmoothingQuality = "high";
    fc.requestRenderAll();
    // `previewVersion` is read here purely so the linter sees it as
    // used — its real job is to force this effect to re-fire when
    // the preview hook bumps it. Pool reuse can hand the same canvas
    // reference back to two consecutive bakes; without the version
    // dep, this effect would shallow-bail and Fabric would paint the
    // cached rasterisation of the *previous* bake's pixels, which
    // read as "preview frozen after a few changes".
    void previewVersion;
  }, [doc, compareActive, previewCanvas, previewVersion, baseCanvas]);

  // Drop the cached bg when this ImageCanvas mount is torn down
  // (StageHost remount on layout changes, doc replace, etc.). The next
  // mount reconstructs it against the fresh Fabric canvas.
  useEffect(() => {
    return () => {
      bgImageRef.current = null;
    };
  }, []);

  // Re-render when layers / overlay / toolState change so the
  // after:render hook picks up the new values via renderStateRef.
  // The deps are intentional triggers, not direct reads.
  useEffect(() => {
    void layers;
    void paintOverlay;
    void toolState;
    fabricRef.current?.requestRenderAll();
  }, [layers, paintOverlay, toolState]);

  // Wheel zoom (ctrl/cmd + scroll, or trackpad pinch). React registers
  // wheel handlers as passive by default, which makes preventDefault a
  // no-op — so the browser's page-level Cmd+wheel zoom would fire on
  // top of ours. Attach a non-passive native listener instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((prev) => {
        const next = Math.min(8, Math.max(0.05, prev.zoom * (1 - e.deltaY * 0.0015)));
        return { ...prev, zoom: next };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setView]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!doc) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const wasEmpty = pointersRef.current.size === 0;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (wasEmpty) firstPointerDownTimeRef.current = performance.now();
      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const a = pts[0];
        const b = pts[1];
        if (a && b) {
          const startDist = Math.hypot(a.x - b.x, a.y - b.y);
          const startMidX = (a.x + b.x) / 2;
          const startMidY = (a.y + b.y) / 2;
          pinchRef.current = {
            startDist,
            startZoom: view.zoom,
            startMidX,
            startMidY,
            startPanX: view.panX,
            startPanY: view.panY,
          };
          // Only arm the tap session if the second finger landed soon
          // after the first. A single-finger tool gesture that picked
          // up a brush from a second finger 200 ms later doesn't get
          // turned into an undo — the user already committed.
          const TWO_FINGER_GAP_MS = 80;
          const firstDown = firstPointerDownTimeRef.current ?? 0;
          if (performance.now() - firstDown <= TWO_FINGER_GAP_MS) {
            twoFingerTapRef.current = {
              startTime: performance.now(),
              startMidX,
              startMidY,
              startDist,
              valid: true,
            };
          } else {
            twoFingerTapRef.current = null;
          }
          panRef.current = null;
        }
        return;
      }
      // Any single-pointer down with another already in flight kills
      // the pending two-finger tap — the user is doing something else.
      twoFingerTapRef.current = null;
      const panning = spaceDown || e.button === 1;
      if (panning) {
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          ox: view.panX,
          oy: view.panY,
        };
        return;
      }
      const pt = toImagePoint(e, transform, doc.width, doc.height);
      onImagePointerDown?.(pt, e);
    },
    [doc, onImagePointerDown, spaceDown, transform, view.panX, view.panY, view.zoom],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinchRef.current && pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const a = pts[0];
        const b = pts[1];
        if (a && b) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const ratio = dist / Math.max(1, pinchRef.current.startDist);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const { startZoom, startMidX, startMidY, startPanX, startPanY } = pinchRef.current;
          // Invalidate the pending two-finger-tap if either fingers moved
          // far enough to suggest a pinch-zoom or two-finger-pan.
          const tap = twoFingerTapRef.current;
          if (tap) {
            const movedMid = Math.hypot(midX - tap.startMidX, midY - tap.startMidY);
            const distDelta = Math.abs(dist - tap.startDist);
            if (movedMid > 10 || distDelta > 10) tap.valid = false;
          }
          // Drive zoom + pan together: pinch ratio scales the zoom,
          // midpoint translation pans the canvas. Two-finger pan is
          // the touch equivalent of Space-drag on desktop, useful
          // when a tool (Shapes / Crop / Redact-rect) consumes
          // single-finger drags for create / draw.
          setView((prev) => ({
            ...prev,
            zoom: Math.min(8, Math.max(0.05, startZoom * ratio)),
            panX: startPanX + (midX - startMidX),
            panY: startPanY + (midY - startMidY),
          }));
        }
        return;
      }
      if (panRef.current) {
        const { startX, startY, ox, oy } = panRef.current;
        setView((prev) => ({
          ...prev,
          panX: ox + (e.clientX - startX),
          panY: oy + (e.clientY - startY),
        }));
        return;
      }
      if (!doc) return;
      const pt = toImagePoint(e, transform, doc.width, doc.height);
      onImagePointerMove?.(pt, e);
    },
    [doc, onImagePointerMove, setView, transform],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId);
      if (pinchRef.current && pointersRef.current.size < 2) {
        pinchRef.current = null;
        // If the second finger lifts within the tap window with neither
        // finger having strayed far, treat the lift as a two-finger tap
        // and undo the most recent commit. The first finger lifting
        // alone (size === 1 here) starts the window; the *second* lift
        // (size === 0) closes it.
        const tap = twoFingerTapRef.current;
        if (tap?.valid && pointersRef.current.size === 0) {
          const elapsed = performance.now() - tap.startTime;
          if (elapsed < 280) void undo();
        }
        if (pointersRef.current.size === 0) {
          twoFingerTapRef.current = null;
          firstPointerDownTimeRef.current = null;
        }
        return;
      }
      if (panRef.current) {
        panRef.current = null;
        return;
      }
      if (pointersRef.current.size === 0) firstPointerDownTimeRef.current = null;
      if (!doc) return;
      const pt = toImagePoint(e, transform, doc.width, doc.height);
      onImagePointerUp?.(pt, e);
    },
    [doc, onImagePointerUp, transform, undo],
  );

  // iOS Safari fires `pointercancel` instead of `pointerup` whenever a
  // system gesture (edge swipe, banner pull-down, multi-touch
  // re-arbitration) interrupts a touch. Without this handler the
  // pointer stays in `pointersRef` forever, and the *next* single tap
  // is treated as the second finger of a pinch — falling into the
  // two-finger branch of onPointerDown and silently swallowing
  // `onImagePointerDown`. Symptom: tap-to-sample tools (Color picker,
  // Spot heal) appear dead until the page reloads.
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      panRef.current = null;
      firstPointerDownTimeRef.current = null;
    }
    // System gestures cancel any pending two-finger-tap — we'd rather
    // skip the undo than fire it for an interrupted touch.
    twoFingerTapRef.current = null;
  }, []);

  const isMobile = size.w > 0 && size.w < 760;
  const cursorStyle = cursor ?? (spaceDown ? (panRef.current ? "grabbing" : "grab") : "crosshair");

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      style={{
        flex: 1,
        position: "relative",
        background: "var(--canvas-bg)",
        overflow: "hidden",
        minHeight: 0,
        cursor: cursorStyle,
        touchAction: "none",
        filter: cssFilter ?? undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }}
      />
      {doc && (
        <div
          aria-hidden
          className="checker"
          style={{
            position: "absolute",
            left: transform.ox,
            top: transform.oy,
            width: doc.width * transform.scale,
            height: doc.height * transform.scale,
            backgroundSize: "32px 32px",
            backgroundPosition: "0 0, 0 16px, 16px -16px, -16px 0",
            pointerEvents: "none",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
          }}
        />
      )}
      <div
        ref={fabricHostRef}
        style={{
          position: "absolute",
          inset: 0,
          // When a tool wants Fabric to handle pointer events natively
          // (Text inline editing, future Move/Select tool), let events
          // through to the upper canvas. Other tools keep this off so
          // React's tool-specific handlers above run instead.
          pointerEvents: fabricInteractive ? "auto" : "none",
        }}
      />
      {!hideHints && size.w > 0 && (
        <CanvasHints
          isMobile={isMobile}
          zoom={view.zoom}
          fitScale={transform.scale / Math.max(view.zoom, 0.0001)}
          onZoomChange={(next) =>
            setView((prev) => ({
              ...prev,
              zoom: next,
              // Snap pan back to centre when the user picks Fit, so a
              // previously panned canvas re-centres rather than
              // zooming around an off-screen pivot. Other zoom paths
              // keep the existing pan.
              ...(next === 1 ? { panX: 0, panY: 0 } : {}),
            }))
          }
        />
      )}
    </div>
  );
}

function CanvasHints({
  isMobile,
  zoom,
  fitScale,
  onZoomChange,
}: {
  isMobile: boolean;
  zoom: number;
  fitScale: number;
  onZoomChange: (next: number) => void;
}) {
  const displayZoom = Math.round(zoom * fitScale * 100);
  return (
    <>
      {isMobile && <MobileZoomControl displayZoom={displayZoom} onZoomChange={onZoomChange} />}
      {!isMobile && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            pointerEvents: "none",
          }}
        >
          <span
            className="kbd"
            style={{
              background: "rgba(255,255,255,0.10)",
              borderColor: "rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Space
          </span>
          to pan · Cmd+scroll to zoom
        </div>
      )}
    </>
  );
}

/** Tappable zoom pill for mobile. Tap opens a compact popover with
 *  −/+ steppers, the live percentage, and a "Fit" preset that
 *  re-centres. Replaces the previous read-only `t-mono` badge — the
 *  user gets a real zoom control without us having to add another
 *  fixed UI affordance. */
function MobileZoomControl({
  displayZoom,
  onZoomChange,
}: {
  displayZoom: number;
  onZoomChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss on outside tap. We listen on `pointerdown` rather
  // than click because the canvas swallows pointer events for
  // pan/pinch and would otherwise prevent the popover from closing
  // when the user goes back to editing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const stepOut = () => onZoomChange(Math.max(0.05, (displayZoom / 100) * (1 / 1.25)));
  const stepIn = () => onZoomChange(Math.min(8, (displayZoom / 100) * 1.25));
  const fit = () => {
    onZoomChange(1);
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}
      className="t-mono"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Zoom ${displayZoom}% · tap for controls`}
        aria-expanded={open}
        className="cursor-pointer rounded-full border-none px-3 py-1 text-[11px] font-semibold text-white active:scale-[0.96]"
        style={{
          background: open ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          transition: "background 150ms",
        }}
      >
        {displayZoom}%
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Zoom controls"
          className="absolute right-0 mt-1.5 flex items-center gap-0.5 rounded-full border border-white/10 p-0.5"
          style={{
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            animation: "ci-fab-in 160ms ease-out both",
          }}
        >
          <button
            type="button"
            onClick={stepOut}
            aria-label="Zoom out"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-white active:bg-white/15"
          >
            −
          </button>
          <button
            type="button"
            onClick={fit}
            aria-label="Fit to screen"
            className="cursor-pointer rounded-full border-none bg-transparent px-2 py-0.5 text-[11px] font-semibold text-white active:bg-white/15"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={stepIn}
            aria-label="Zoom in"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-white active:bg-white/15"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function computeTransform(
  imgW: number,
  imgH: number,
  size: { w: number; h: number },
  view: { zoom: number; panX: number; panY: number },
): Transform {
  const margin = 24;
  if (!imgW || !imgH || !size.w || !size.h) {
    return {
      ox: 0,
      oy: 0,
      scale: 1,
      cw: size.w,
      ch: size.h,
      iw: imgW,
      ih: imgH,
    };
  }
  const fit = Math.min((size.w - margin * 2) / imgW, (size.h - margin * 2) / imgH);
  const scale = fit * view.zoom;
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const ox = (size.w - dispW) / 2 + view.panX;
  const oy = (size.h - dispH) / 2 + view.panY;
  return { ox, oy, scale, cw: size.w, ch: size.h, iw: imgW, ih: imgH };
}

function toImagePoint(
  e: ReactPointerEvent<HTMLDivElement>,
  t: Transform,
  imgW: number,
  imgH: number,
): ImagePoint {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const x = (sx - t.ox) / t.scale;
  const y = (sy - t.oy) / t.scale;
  const inside = x >= 0 && y >= 0 && x <= imgW && y <= imgH;
  return { x, y, inside };
}
