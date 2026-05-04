// ImagePanel.tsx — Drop a raster image onto the canvas as its own
// layer. After placement the image acts like any other Fabric object:
// drag, scale, rotate via handles, or use the Layers list to reorder.
// The panel also exposes quick stack-order buttons + opacity for the
// currently-selected image.

import { type FabricObject, FabricImage } from "fabric";
import { useCallback, useEffect, useState } from "react";
import { I } from "../../components/icons";
import { PropRow, Slider } from "../atoms";
import { useEditor } from "../EditorContext";

const IMAGE_TAG = "cloak:image";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

export function ImagePanel() {
  const { doc, getFabricCanvas, commit } = useEditor();
  const [activeImage, setActiveImage] = useState<FabricImage | null>(null);
  const [opacity, setOpacity] = useState(1);

  // Track the currently-selected image so the reorder/opacity controls
  // operate on it without the panel needing to be aware of selection
  // events from elsewhere in the editor.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const sync = () => {
      const obj = fc.getActiveObject();
      const tagged = obj as TaggedFabricObject | null;
      if (obj && tagged?.cloakKind === IMAGE_TAG) {
        const img = obj as FabricImage;
        setActiveImage(img);
        setOpacity(img.opacity ?? 1);
      } else {
        setActiveImage(null);
      }
    };
    sync();
    fc.on("selection:created", sync);
    fc.on("selection:updated", sync);
    fc.on("selection:cleared", sync);
    fc.on("object:removed", sync);
    return () => {
      fc.off("selection:created", sync);
      fc.off("selection:updated", sync);
      fc.off("selection:cleared", sync);
      fc.off("object:removed", sync);
    };
  }, [getFabricCanvas]);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const fc = getFabricCanvas();
      if (!fc || !doc) return;
      const dataUrl = await readFileAsDataUrl(file);
      const img = await FabricImage.fromURL(dataUrl);

      // Fit the image inside ~70% of the canvas's short edge so it lands
      // visibly without overflowing. The user can scale up afterwards.
      const naturalW = img.width || 1;
      const naturalH = img.height || 1;
      const short = Math.min(doc.width, doc.height);
      const target = short * 0.7;
      const factor = Math.min(target / naturalW, target / naturalH, 1);
      const placedW = naturalW * factor;
      const placedH = naturalH * factor;

      img.set({
        left: (doc.width - placedW) / 2,
        top: (doc.height - placedH) / 2,
        scaleX: factor,
        scaleY: factor,
        originX: "left",
        originY: "top",
        opacity: 1,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        lockUniScaling: true,
      });
      (img as TaggedFabricObject).cloakKind = IMAGE_TAG;
      fc.add(img);
      fc.setActiveObject(img);
      fc.requestRenderAll();
      commit("Place image");
    },
    [commit, doc, getFabricCanvas],
  );

  const onOpacity = useCallback(
    (v: number) => {
      if (!activeImage) return;
      const fc = getFabricCanvas();
      if (!fc) return;
      activeImage.set({ opacity: v });
      setOpacity(v);
      fc.requestRenderAll();
    },
    [activeImage, getFabricCanvas],
  );

  const commitOpacity = useCallback(() => {
    if (!activeImage) return;
    commit("Image opacity");
  }, [activeImage, commit]);

  const reorder = useCallback(
    (op: "front" | "forward" | "backward" | "back") => {
      const fc = getFabricCanvas();
      if (!fc || !activeImage) return;
      if (op === "front") fc.bringObjectToFront(activeImage);
      else if (op === "forward") fc.bringObjectForward(activeImage);
      else if (op === "backward") fc.sendObjectBackwards(activeImage);
      else fc.sendObjectToBack(activeImage);
      fc.requestRenderAll();
      commit("Reorder image");
    },
    [activeImage, commit, getFabricCanvas],
  );

  const center = useCallback(
    (axis: "h" | "v" | "both") => {
      const fc = getFabricCanvas();
      if (!fc || !activeImage || !doc) return;
      // Image-space bbox accounts for the current scale + rotation.
      const bbox = activeImage.getBoundingRect();
      const next: { left?: number; top?: number } = {};
      if (axis === "h" || axis === "both") {
        const dx = (doc.width - bbox.width) / 2 - bbox.left;
        next.left = (activeImage.left ?? 0) + dx;
      }
      if (axis === "v" || axis === "both") {
        const dy = (doc.height - bbox.height) / 2 - bbox.top;
        next.top = (activeImage.top ?? 0) + dy;
      }
      activeImage.set(next);
      activeImage.setCoords();
      fc.requestRenderAll();
      commit("Center image");
    },
    [activeImage, commit, doc, getFabricCanvas],
  );

  // Fit (contain) and Fill (cover) the image to the document bounds.
  // Both centre the image, then choose the scale factor that either
  // contains it inside the canvas (fit) or covers it (fill). Same maths
  // CSS uses for `object-fit`.
  const fitOrFill = useCallback(
    (mode: "fit" | "fill") => {
      const fc = getFabricCanvas();
      if (!fc || !activeImage || !doc) return;
      const naturalW = activeImage.width || 1;
      const naturalH = activeImage.height || 1;
      const sx = doc.width / naturalW;
      const sy = doc.height / naturalH;
      const factor = mode === "fit" ? Math.min(sx, sy) : Math.max(sx, sy);
      const placedW = naturalW * factor;
      const placedH = naturalH * factor;
      activeImage.set({
        scaleX: factor,
        scaleY: factor,
        angle: 0,
        left: (doc.width - placedW) / 2,
        top: (doc.height - placedH) / 2,
      });
      activeImage.setCoords();
      fc.requestRenderAll();
      commit(mode === "fit" ? "Fit image" : "Fill image");
    },
    [activeImage, commit, doc, getFabricCanvas],
  );

  return (
    <>
      <PropRow label="Add an image">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-border bg-page-bg px-2.5 py-2 text-xs dark:border-dark-border dark:bg-dark-page-bg">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onPickFile(f);
              e.target.value = "";
            }}
            className="hidden"
          />
          <I.Upload size={14} />
          <span className="flex-1">Choose a PNG / JPG…</span>
        </label>
      </PropRow>

      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Drop an image to add a new layer. Drag handles to scale or rotate; use Layers to reorder.
      </div>

      {activeImage && (
        <>
          <PropRow label="Opacity" value={`${Math.round(opacity * 100)}%`}>
            <div onPointerUp={commitOpacity}>
              <Slider value={opacity} accent onChange={onOpacity} />
            </div>
          </PropRow>
          <div className="mt-1.5">
            <div className="mb-1.5 text-[11.5px] font-medium text-text-muted dark:text-dark-text-muted">
              Align
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <ReorderButton label="Center H" onClick={() => center("h")} />
              <ReorderButton label="Center V" onClick={() => center("v")} />
              <ReorderButton label="Center" onClick={() => center("both")} />
            </div>
          </div>
          <div className="mt-1.5">
            <div className="mb-1.5 text-[11.5px] font-medium text-text-muted dark:text-dark-text-muted">
              Size to canvas
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <ReorderButton label="Fit" onClick={() => fitOrFill("fit")} />
              <ReorderButton label="Fill" onClick={() => fitOrFill("fill")} />
            </div>
          </div>
          <div className="mt-1.5">
            <div className="mb-1.5 text-[11.5px] font-medium text-text-muted dark:text-dark-text-muted">
              Layer order
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <ReorderButton label="To front" onClick={() => reorder("front")} />
              <ReorderButton label="Forward" onClick={() => reorder("forward")} />
              <ReorderButton label="Backward" onClick={() => reorder("backward")} />
              <ReorderButton label="To back" onClick={() => reorder("back")} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ReorderButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md border border-border bg-surface px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold text-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
    >
      {label}
    </button>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
