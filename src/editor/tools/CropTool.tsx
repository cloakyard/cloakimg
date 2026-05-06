// CropTool.tsx — Phase F3. Fabric `Rect`-based crop overlay.
//
// While the Crop tool is active, a single Fabric `Rect` (tagged
// `cloak:cropOverlay`) sits on top of the image. Fabric's built-in
// transform handles replace the custom 8-handle drag system the legacy
// implementation carried, which fixes the "handles slightly off at
// high zoom" gap noted in STATUS.md. Movement and scaling are clamped
// to image bounds via `object:moving` / `object:scaling` listeners.
//
// Rotation and flip live on the panel — they apply to the BAKE, not
// to the crop rect itself (so the rect stays axis-aligned and the
// user can re-aspect cleanly).

import { type FabricObject, Rect as FabricRect } from "fabric";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../../components/icons";
import { PropRow, Segment, Slider } from "../atoms";
import { copyInto, createCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { getSubjectBBox } from "../subjectMask";
import type { ToolState } from "../toolState";
import { useSubjectMask } from "../useSubjectMask";
import { ASPECT_OPTIONS, initialRect, type Rect } from "./cropMath";

const CROP_TAG = "cloak:cropOverlay";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

/** Pull the crop rect's image-space bbox from its current Fabric
 *  transform (left/top + width*scale on each axis). Rotation is
 *  intentionally ignored — the rect is locked to axis-aligned. */
function readCropBox(rect: FabricObject): Rect {
  return {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    w: (rect.width ?? 0) * (rect.scaleX ?? 1),
    h: (rect.height ?? 0) * (rect.scaleY ?? 1),
  };
}

function findCropRect(
  fc: ReturnType<typeof useEditor>["getFabricCanvas"] extends () => infer T ? T : never,
): FabricObject | null {
  if (!fc) return null;
  for (const obj of fc.getObjects()) {
    if ((obj as TaggedFabricObject).cloakKind === CROP_TAG) return obj;
  }
  return null;
}

export function CropTool() {
  const { getFabricCanvas, doc, toolState } = useEditor();
  const aspect = ASPECT_OPTIONS[toolState.cropAspect]?.ratio ?? null;
  // Cache the crop rect across render frames so paintOverlay doesn't
  // walk the whole Fabric scene on every after:render tick (this fires
  // many times per second during a drag).
  const cropRectRef = useRef<FabricObject | null>(null);

  // Dim the area outside the live crop rect so the kept region reads
  // clearly, AND render a live rotation/flip preview over the doc area
  // when the panel's rotation/flip controls are non-default. We draw on
  // the lower canvas via paintOverlay; Fabric's selection handles live
  // on the upper canvas and stay crisp.
  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, ts: ToolState) => {
      const rect = cropRectRef.current;
      if (!rect || !doc) return;
      const left = rect.left ?? 0;
      const top = rect.top ?? 0;
      const w = (rect.width ?? 0) * (rect.scaleX ?? 1);
      const h = (rect.height ?? 0) * (rect.scaleY ?? 1);
      const sx = t.ox + left * t.scale;
      const sy = t.oy + top * t.scale;
      const sw = w * t.scale;
      const sh = h * t.scale;
      const ix = t.ox;
      const iy = t.oy;
      const iw = t.iw * t.scale;
      const ih = t.ih * t.scale;

      // Live rotation/flip preview: replace the unrotated bg Fabric
      // just drew with a rotated/flipped copy of `doc.working`. The
      // crop rect stays axis-aligned over the rotated image, matching
      // the bake (rotate around image center, then crop).
      //
      // Negate the angle so positive rotationDeg reads as a counter-
      // clockwise tilt visually — matching the slider direction in
      // iOS Photos / Lightroom (drag right → image tilts left). The
      // canvas API's positive direction is clockwise on screen, so the
      // sign flip lives here rather than in the slider mapping.
      const totalDeg = ts.cropQuarterTurns * 90 + ts.rotationDeg;
      if (totalDeg !== 0 || ts.flipH || ts.flipV) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ix, iy, iw, ih);
        ctx.clip();
        ctx.clearRect(ix, iy, iw, ih);
        ctx.translate(ix + iw / 2, iy + ih / 2);
        ctx.rotate((-totalDeg * Math.PI) / 180);
        ctx.scale(ts.flipH ? -1 : 1, ts.flipV ? -1 : 1);
        ctx.drawImage(doc.working, -iw / 2, -ih / 2, iw, ih);
        ctx.restore();
      }

      ctx.save();
      // Dim flush with the rect edge so the orange stroke unambiguously
      // marks the crop boundary: clear = kept, grey = cropped away.
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      if (sy > iy) ctx.fillRect(ix, iy, iw, sy - iy);
      if (sy + sh < iy + ih) ctx.fillRect(ix, sy + sh, iw, iy + ih - (sy + sh));
      if (sx > ix) ctx.fillRect(ix, sy, sx - ix, sh);
      if (sx + sw < ix + iw) ctx.fillRect(sx + sw, sy, ix + iw - (sx + sw), sh);

      // Re-draw the 8 handle chips on the lower canvas above the dim.
      // Fabric also paints them on the upper canvas; both sets land at
      // the same positions/sizes/colours so the user sees one crisp
      // chip per corner. This is the belt-and-braces fix that ensures
      // the handles are unmistakably above the grey, without resorting
      // to a clear "halo" that confuses the crop-edge boundary.
      const cornerSize = (rect as unknown as { cornerSize?: number }).cornerSize ?? 14;
      const r = cornerSize / 2;
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const handlePts: Array<[number, number]> = [
        [sx, sy],
        [cx, sy],
        [sx + sw, sy],
        [sx, cy],
        [sx + sw, cy],
        [sx, sy + sh],
        [cx, sy + sh],
        [sx + sw, sy + sh],
      ];
      ctx.fillStyle = "#f5613a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      for (const [hx, hy] of handlePts) {
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },
    [doc],
  );

  // Mount the crop overlay rect; tear it down on tool switch.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    // Defensive: drop any lingering crop overlay from a previous mount.
    for (const obj of fc.getObjects()) {
      if ((obj as TaggedFabricObject).cloakKind === CROP_TAG) {
        fc.remove(obj);
      }
    }

    const init = initialRect(doc.width, doc.height, aspect);
    const rect = new FabricRect({
      left: init.x,
      top: init.y,
      width: init.w,
      height: init.h,
      // Explicit top-left origin: Fabric v7 changed the default from
      // 'left'/'top' to 'center', which would treat (left, top) as the
      // rect's centre and offset it off-canvas.
      originX: "left",
      originY: "top",
      fill: "transparent",
      stroke: "#f5613a",
      strokeWidth: 1.5,
      strokeUniform: true,
      cornerColor: "#f5613a",
      cornerStrokeColor: "#ffffff",
      // Inherit the global coarse-pointer-aware corner sizing from
      // fabricDefaults instead of pinning a desktop-only 10 px chip.
      transparentCorners: false,
      borderColor: "#f5613a",
      borderScaleFactor: 1.5,
      // The global default is 6 px on phones (gives most objects a
      // wider hit halo). On the crop rect that offset paints Fabric's
      // selection border 6 px outside the rect's own stroke, so the
      // user reads two concentric orange rectangles. Pin to 0 here so
      // border + stroke land on the same line — `touchCornerSize` in
      // fabricDefaults already handles touch hit-target sizing.
      padding: 0,
      // Rotation belongs to the panel, not the rect.
      hasRotatingPoint: false,
      lockRotation: true,
      // Aspect lock when an explicit aspect is chosen.
      lockUniScaling: !!aspect,
      objectCaching: false,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    });
    (rect as TaggedFabricObject).cloakKind = CROP_TAG;
    // Strip the rotation control. `hasRotatingPoint: false` is the v5
    // API and is a no-op in Fabric v7 — the lollipop above the top-mid
    // handle would otherwise still render and read as an extra "bar"
    // bleeding into the dim overlay outside the crop rect.
    rect.controls = { ...rect.controls };
    delete (rect.controls as { mtr?: unknown }).mtr;
    fc.add(rect);
    fc.setActiveObject(rect);
    cropRectRef.current = rect;

    // Constrain move + scale so the rect stays inside the image.
    const onMoving = () => {
      const r = readCropBox(rect);
      const x = Math.max(0, Math.min(doc.width - r.w, r.x));
      const y = Math.max(0, Math.min(doc.height - r.h, r.y));
      rect.set({ left: x, top: y });
    };
    const onScaling = () => {
      const r = readCropBox(rect);
      // Cap to image bounds; clamp width/height directly so the
      // resize stops at the edge instead of overshooting.
      let { x, y, w, h } = r;
      if (x < 0) {
        w += x;
        x = 0;
      }
      if (y < 0) {
        h += y;
        y = 0;
      }
      if (x + w > doc.width) w = doc.width - x;
      if (y + h > doc.height) h = doc.height - y;
      rect.set({
        left: x,
        top: y,
        width: Math.max(8, w),
        height: Math.max(8, h),
        scaleX: 1,
        scaleY: 1,
      });
    };
    fc.on("object:moving", onMoving);
    fc.on("object:scaling", onScaling);
    fc.requestRenderAll();

    return () => {
      fc.off("object:moving", onMoving);
      fc.off("object:scaling", onScaling);
      fc.remove(rect);
      fc.discardActiveObject();
      fc.requestRenderAll();
      cropRectRef.current = null;
    };
    // The aspect change handler reshapes the rect in place; we don't
    // recreate the rect on aspect change, so this effect runs once
    // per doc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, getFabricCanvas]);

  // Aspect change: refit the rect in place + flip lockUniScaling.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;
    const rect = findCropRect(fc);
    if (!rect) return;
    rect.set({ lockUniScaling: !!aspect });
    if (aspect) {
      const cur = readCropBox(rect);
      const targetH = cur.w / aspect;
      const fitH = Math.min(doc.height - cur.y, targetH);
      const fitW = aspect * fitH;
      rect.set({
        width: Math.max(8, fitW),
        height: Math.max(8, fitH),
        scaleX: 1,
        scaleY: 1,
      });
    }
    fc.requestRenderAll();
  }, [aspect, doc, getFabricCanvas]);

  useStageProps({ fabricInteractive: true, paintOverlay });
  return null;
}

/** Bake the rotated/flipped crop region from `src` into a new canvas.
 *  Semantics: rotate (and flip) the source around the *image* centre,
 *  then take the axis-aligned doc-space rect from the rotated image.
 *  The output is exactly `rect.w × rect.h` — matching what the user
 *  saw in the live preview drawn by paintOverlay. */
export function applyCrop(
  src: HTMLCanvasElement,
  rect: Rect,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement {
  const out = createCanvas(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)));
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  const cx = src.width / 2;
  const cy = src.height / 2;
  ctx.save();
  // Map doc point (rect.x, rect.y) → output (0, 0), then apply the
  // same centre-pivoted rotate+flip the preview does. Angle is negated
  // so positive rotationDeg reads as counter-clockwise on screen,
  // matching the slider direction (kept consistent with paintOverlay).
  ctx.translate(-rect.x, -rect.y);
  ctx.translate(cx, cy);
  ctx.rotate((-rotationDeg * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, -cx, -cy);
  ctx.restore();
  return out;
}

// ── Property-panel piece for crop ────────────────────────────────────

export function CropPanel() {
  const { toolState, patchTool, doc, getFabricCanvas, commit, registerPendingApply } = useEditor();
  const subjectMask = useSubjectMask();
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const aspect = ASPECT_OPTIONS[toolState.cropAspect]?.ratio ?? null;
  // Total rotation = quarter turns from the 90° button + fine slider.
  // Normalised to [0, 360) for display so 90° presses don't grow the
  // displayed angle without bound.
  const totalRotation = useMemo(() => {
    const raw = toolState.cropQuarterTurns * 90 + toolState.rotationDeg;
    return ((raw % 360) + 360) % 360;
  }, [toolState.cropQuarterTurns, toolState.rotationDeg]);
  const rotationLabel = useMemo(() => `${totalRotation.toFixed(0)}°`, [totalRotation]);

  // Slider operates only on the fine [-45, +45] portion. The quarter-
  // turn portion is owned by the 90° button so the slider can never
  // overflow its track even after several quarter-turn presses.
  const rotationSlider = (toolState.rotationDeg + 45) / 90;
  const setRotation = useCallback(
    (v: number) => patchTool("rotationDeg", Math.round((v - 0.5) * 90)),
    [patchTool],
  );

  const apply = useCallback(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;
    const rectObj = findCropRect(fc);
    if (!rectObj) return;
    const r = readCropBox(rectObj);
    if (r.w < 4 || r.h < 4) return;
    // Skip the bake when the user hasn't actually moved the rect,
    // rotated, or flipped — running it would produce an identical
    // image but pollute history with a no-op "Crop" entry. Important
    // now that pendingApply auto-fires on tool switch / Export.
    const init = initialRect(doc.width, doc.height, aspect);
    const noTransform =
      toolState.rotationDeg === 0 &&
      toolState.cropQuarterTurns === 0 &&
      !toolState.flipH &&
      !toolState.flipV;
    const noCrop =
      Math.abs(r.x - init.x) < 1 &&
      Math.abs(r.y - init.y) < 1 &&
      Math.abs(r.w - init.w) < 1 &&
      Math.abs(r.h - init.h) < 1;
    if (noTransform && noCrop) return;
    const totalDeg = toolState.cropQuarterTurns * 90 + toolState.rotationDeg;
    const out = applyCrop(doc.working, r, totalDeg, toolState.flipH, toolState.flipV);
    copyInto(doc.working, out);
    doc.width = out.width;
    doc.height = out.height;
    // Reset the crop overlay to span the new doc and clear panel
    // rotate/flip state.
    rectObj.set({
      left: 0,
      top: 0,
      width: out.width,
      height: out.height,
      scaleX: 1,
      scaleY: 1,
    });
    fc.requestRenderAll();
    patchTool("rotationDeg", 0);
    patchTool("cropQuarterTurns", 0);
    patchTool("flipH", false);
    patchTool("flipV", false);
    commit("Crop");
  }, [aspect, commit, doc, getFabricCanvas, patchTool, toolState]);

  // Smart Crop — read the subject bbox from the cached mask (or wait
  // for detection to finish), then snap the Fabric crop overlay to
  // that rect. Aspect-locked? The bbox is centred inside the locked
  // ratio so users can pick "1:1" first and still get a tight crop
  // around the subject. The user still has to tap the existing
  // commit affordance (Enter / tool-switch) to bake — Smart Crop only
  // *positions* the rect, it doesn't apply the crop unilaterally.
  const smartCrop = useCallback(async () => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;
    const rectObj = findCropRect(fc);
    if (!rectObj) return;
    setSmartError(null);
    setSmartBusy(true);
    try {
      const mask = subjectMask.peek() ?? (await subjectMask.request());
      const bbox = getSubjectBBox(mask, 0.06);
      if (!bbox) {
        setSmartError("Couldn't find a clear subject in this photo.");
        return;
      }
      let { x, y, w, h } = bbox;
      // Honour the locked aspect: expand the shorter axis of the
      // bbox until it matches the target ratio, centred on the
      // bbox's centre, then clamp inside the image. This keeps the
      // subject centred when the user has e.g. a 1:1 lock active.
      if (aspect != null && aspect > 0) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const currentRatio = w / h;
        if (currentRatio < aspect) {
          // Bbox is too tall — widen.
          w = h * aspect;
        } else if (currentRatio > aspect) {
          // Bbox is too wide — heighten.
          h = w / aspect;
        }
        x = cx - w / 2;
        y = cy - h / 2;
        // Clamp inside the image. If clamping breaks the ratio,
        // we'd rather lose a sliver of the subject than warp the
        // aspect — accept the clamp.
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x + w > doc.width) x = doc.width - w;
        if (y + h > doc.height) y = doc.height - h;
        if (x < 0 || y < 0) {
          // Still doesn't fit — fall back to the unconstrained bbox.
          x = bbox.x;
          y = bbox.y;
          w = bbox.w;
          h = bbox.h;
        }
      }
      rectObj.set({
        left: Math.round(x),
        top: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        scaleX: 1,
        scaleY: 1,
      });
      rectObj.setCoords();
      fc.requestRenderAll();
    } catch (err) {
      setSmartError(err instanceof Error ? err.message : "Couldn't detect subject.");
    } finally {
      setSmartBusy(false);
    }
  }, [aspect, doc, getFabricCanvas, subjectMask]);

  const reset = useCallback(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;
    const rectObj = findCropRect(fc);
    if (!rectObj) return;
    const init = initialRect(doc.width, doc.height, aspect);
    rectObj.set({
      left: init.x,
      top: init.y,
      width: init.w,
      height: init.h,
      scaleX: 1,
      scaleY: 1,
    });
    // Without setCoords, Fabric's cached corner positions stay anchored
    // to the pre-reset rect — the visual handles snap to the new rect
    // but their hit-test zones stay where they were, so taps near the
    // new corners miss. setCoords forces both to agree.
    rectObj.setCoords();
    // "Reset crop area" is a full reset: rotation, flip, and quarter-
    // turn rotation all clear too. Otherwise the rect snaps back to
    // centred but the user's prior 45° / Flip H / 90° presses persist,
    // which reads as "the button didn't actually undo my work."
    patchTool("rotationDeg", 0);
    patchTool("cropQuarterTurns", 0);
    patchTool("flipH", false);
    patchTool("flipV", false);
    fc.requestRenderAll();
  }, [aspect, doc, getFabricCanvas, patchTool]);

  // Press Enter to apply.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply]);

  // Auto-bake on tool switch / Export. The apply itself early-returns
  // when nothing's actually been changed, so this is safe to register
  // unconditionally — no spurious history entries when the user just
  // peeked at the Crop panel.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
    // applyRef is a stable ref; intentionally omitted from deps so we
    // register once on mount and unregister once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerPendingApply]);

  const subjectStatus = subjectMask.state.status;
  const smartLabel = smartBusy
    ? subjectStatus === "loading"
      ? "Detecting…"
      : "Cropping…"
    : "Crop to subject";

  return (
    <>
      <PropRow label="Aspect ratio">
        <Segment
          options={ASPECT_OPTIONS.map((a) => a.label)}
          active={toolState.cropAspect}
          onChange={(i) => patchTool("cropAspect", i)}
        />
      </PropRow>
      {/* Smart Crop — sized like the secondary buttons in the
          Flip / 90° row so the panel keeps a single visual rhythm.
          Sparkles badge marks it as the AI-powered affordance, same
          convention as the rail. */}
      <button
        type="button"
        onClick={() => void smartCrop()}
        disabled={smartBusy}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text"
        style={{ opacity: smartBusy ? 0.7 : 1 }}
      >
        <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
        {smartLabel}
      </button>
      {smartError && (
        <div className="rounded-md border border-coral-300 bg-coral-50 px-2.5 py-1.5 text-[11px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200">
          {smartError}
        </div>
      )}
      <CropDimensions />
      <PropRow label="Rotation" value={rotationLabel}>
        <Slider value={rotationSlider} accent defaultValue={0.5} onChange={setRotation} />
      </PropRow>
      <PropRow label="Flip / rotate 90°">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`btn btn-secondary flex-1 ${
              toolState.flipH ? "border-coral-500 text-coral-700 dark:text-coral-300" : ""
            }`}
            onClick={() => patchTool("flipH", !toolState.flipH)}
            aria-pressed={toolState.flipH}
            style={{ fontSize: 11.5, padding: "7px 10px" }}
          >
            <I.Resize size={12} /> Flip H
          </button>
          <button
            type="button"
            className={`btn btn-secondary flex-1 ${
              toolState.flipV ? "border-coral-500 text-coral-700 dark:text-coral-300" : ""
            }`}
            onClick={() => patchTool("flipV", !toolState.flipV)}
            aria-pressed={toolState.flipV}
            style={{ fontSize: 11.5, padding: "7px 10px" }}
          >
            <I.Resize size={12} className="rotate-90" /> Flip V
          </button>
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={() => patchTool("cropQuarterTurns", (toolState.cropQuarterTurns + 1) % 4)}
            style={{ fontSize: 11.5, padding: "7px 10px" }}
          >
            <I.Rotate size={12} /> 90°
          </button>
        </div>
      </PropRow>
      <button
        type="button"
        className="btn btn-secondary btn-xs mt-1 w-full justify-center"
        onClick={reset}
      >
        <I.Refresh size={12} />
        Reset crop area
      </button>
      <p className="text-[11px] leading-[1.45] text-text-muted dark:text-dark-text-muted">
        Press Enter or switch to another tool to apply. Undo/Redo recover.
      </p>
    </>
  );
}

/** Live numeric W/H/X/Y editor for the crop rect. Reads from the
 *  Fabric overlay via `object:moving` / `object:scaling` events so
 *  dragging the rect updates the inputs in real time, and writes
 *  back to the rect when the user types — clamped to image bounds.
 *  Honours the current aspect lock from the Aspect segment. */
function CropDimensions() {
  const { getFabricCanvas, doc, toolState } = useEditor();
  const aspect = ASPECT_OPTIONS[toolState.cropAspect]?.ratio ?? null;
  const [box, setBox] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;
    const sync = () => {
      const rect = findCropRect(fc);
      if (!rect) return;
      const r = readCropBox(rect);
      const next = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.w),
        h: Math.round(r.h),
      };
      // Bail when the rounded box is unchanged. Without this, Fabric's
      // object:moving fires on every pointer tick (60 Hz) and pushed a
      // setState even when the integer-rounded box hadn't changed,
      // re-rendering the dimension inputs constantly.
      setBox((prev) =>
        prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
          ? prev
          : next,
      );
    };
    sync();
    // Subscribe only to the events that actually change the rect's
    // box; the previous `after:render` subscription fired on every
    // Fabric paint (including unrelated tool overlays) and turned this
    // panel into a per-frame setState pump.
    fc.on("object:moving", sync);
    fc.on("object:scaling", sync);
    fc.on("object:modified", sync);
    return () => {
      fc.off("object:moving", sync);
      fc.off("object:scaling", sync);
      fc.off("object:modified", sync);
    };
  }, [doc, getFabricCanvas]);

  const writeBox = useCallback(
    (next: Partial<Rect>) => {
      const fc = getFabricCanvas();
      if (!fc || !doc) return;
      const rect = findCropRect(fc);
      if (!rect) return;
      // Merge + clamp to image bounds. Aspect lock keeps the unedited
      // dimension proportional to the edited one.
      let nx = next.x ?? box.x;
      let ny = next.y ?? box.y;
      let nw = next.w ?? box.w;
      let nh = next.h ?? box.h;
      if (aspect) {
        if (next.w !== undefined) nh = nw / aspect;
        else if (next.h !== undefined) nw = nh * aspect;
      }
      nw = Math.max(8, Math.min(doc.width, nw));
      nh = Math.max(8, Math.min(doc.height, nh));
      nx = Math.max(0, Math.min(doc.width - nw, nx));
      ny = Math.max(0, Math.min(doc.height - nh, ny));
      rect.set({
        left: nx,
        top: ny,
        width: nw,
        height: nh,
        scaleX: 1,
        scaleY: 1,
      });
      rect.setCoords();
      fc.requestRenderAll();
      setBox({ x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) });
    },
    [aspect, box, doc, getFabricCanvas],
  );

  return (
    <PropRow label="Dimensions">
      <div className="grid grid-cols-2 gap-1.5">
        <NumInput label="W" value={box.w} onCommit={(n) => writeBox({ w: n })} />
        <NumInput label="H" value={box.h} onCommit={(n) => writeBox({ h: n })} />
        <NumInput label="X" value={box.x} onCommit={(n) => writeBox({ x: n })} />
        <NumInput label="Y" value={box.y} onCommit={(n) => writeBox({ y: n })} />
      </div>
    </PropRow>
  );
}

/** Numeric input that commits on Enter / blur (not on each keystroke,
 *  so typing "100" through "1" → "10" → "100" doesn't keep snapping
 *  the rect to mid-typed values). */
function NumInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // Reset the draft whenever the canonical value changes via dragging
  // the overlay or aspect-lock recompute.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-border bg-page-bg px-2 py-1 text-[12px] dark:border-dark-border dark:bg-dark-page-bg">
      <span className="text-text-muted dark:text-dark-text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="t-mono w-full min-w-0 border-none bg-transparent p-0 font-[inherit] text-[12px] font-semibold text-text outline-none dark:text-dark-text"
      />
    </label>
  );
}
