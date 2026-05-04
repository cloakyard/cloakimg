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
import { copyInto, createCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { I } from "../../components/icons";
import { PropRow, Segment, Slider } from "../atoms";
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
  // clearly. We draw on the lower canvas via paintOverlay; Fabric's
  // selection handles live on the upper canvas and stay crisp.
  const paintOverlay = useCallback((ctx: CanvasRenderingContext2D, t: Transform) => {
    const rect = cropRectRef.current;
    if (!rect) return;
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
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    // Top strip
    if (sy > iy) ctx.fillRect(ix, iy, iw, sy - iy);
    // Bottom strip
    if (sy + sh < iy + ih) ctx.fillRect(ix, sy + sh, iw, iy + ih - (sy + sh));
    // Left strip
    if (sx > ix) ctx.fillRect(ix, sy, sx - ix, sh);
    // Right strip
    if (sx + sw < ix + iw) ctx.fillRect(sx + sw, sy, ix + iw - (sx + sw), sh);
    ctx.restore();
  }, []);

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

/** Bake the rotated/flipped crop region from `src` into a new canvas. */
export function applyCrop(
  src: HTMLCanvasElement,
  rect: Rect,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement {
  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const outW = Math.round(rect.w * cos + rect.h * sin);
  const outH = Math.round(rect.w * sin + rect.h * cos);
  const out = createCanvas(Math.max(1, outW), Math.max(1, outH));
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(angle);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.translate(-rect.w / 2, -rect.h / 2);
  ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  ctx.restore();
  return out;
}

// ── Property-panel piece for crop ────────────────────────────────────

export function CropPanel() {
  const { toolState, patchTool, doc, getFabricCanvas, commit, registerPendingApply } = useEditor();
  const aspect = ASPECT_OPTIONS[toolState.cropAspect]?.ratio ?? null;
  const rotationLabel = useMemo(
    () => `${toolState.rotationDeg.toFixed(0)}°`,
    [toolState.rotationDeg],
  );

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
    const noTransform = toolState.rotationDeg === 0 && !toolState.flipH && !toolState.flipV;
    const noCrop =
      Math.abs(r.x - init.x) < 1 &&
      Math.abs(r.y - init.y) < 1 &&
      Math.abs(r.w - init.w) < 1 &&
      Math.abs(r.h - init.h) < 1;
    if (noTransform && noCrop) return;
    const out = applyCrop(doc.working, r, toolState.rotationDeg, toolState.flipH, toolState.flipV);
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
    patchTool("flipH", false);
    patchTool("flipV", false);
    commit("Crop");
  }, [aspect, commit, doc, getFabricCanvas, patchTool, toolState]);

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
    fc.requestRenderAll();
  }, [aspect, doc, getFabricCanvas]);

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

  return (
    <>
      <PropRow label="Aspect ratio">
        <Segment
          options={ASPECT_OPTIONS.map((a) => a.label)}
          active={toolState.cropAspect}
          onChange={(i) => patchTool("cropAspect", i)}
        />
      </PropRow>
      <CropDimensions />
      <PropRow label="Rotation" value={rotationLabel}>
        <Slider value={rotationSlider} accent onChange={setRotation} />
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
            onClick={() => patchTool("rotationDeg", (toolState.rotationDeg + 90) % 360)}
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
