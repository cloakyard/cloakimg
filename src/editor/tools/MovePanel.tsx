// MovePanel.tsx — Property panel for the Move tool. The Move tool
// flips Fabric's selection layer on so the user can pick up text /
// shapes / stickers / placed images and drag, scale, or rotate them.
// It does *not* move the underlying photo — that's intentional, since
// the photo serves as the canvas, not as a layer.
//
// We surface what's selected (or, when nothing is, why dragging on
// the photo doesn't appear to do anything) so the tool stops feeling
// inert when the scene has no layers yet.

import { type FabricObject } from "fabric";
import { useCallback, useEffect, useState } from "react";
import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

const KIND_LABEL: Record<string, string> = {
  "cloak:text": "Text",
  "cloak:watermarkText": "Text watermark",
  "cloak:watermarkImage": "Image watermark",
  "cloak:drawStroke": "Stroke",
  "cloak:shape": "Shape",
  "cloak:sticker": "Sticker",
  "cloak:image": "Image",
};

export function MovePanel() {
  const { getFabricCanvas, commit } = useEditor();
  const [layerCount, setLayerCount] = useState(0);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  // Subscribe to scene mutations so the panel always reflects the live
  // layer count + selection state. Mirrors the LayersList subscription
  // pattern.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const sync = () => {
      const objs = fc.getObjects().filter((o) => {
        const k = (o as TaggedFabricObject).cloakKind;
        return k && k !== "cloak:cropOverlay";
      });
      setLayerCount(objs.length);
      const active = fc.getActiveObject();
      const k = (active as TaggedFabricObject | null)?.cloakKind ?? null;
      setActiveLabel(k ? (KIND_LABEL[k] ?? k.replace("cloak:", "")) : null);
    };
    sync();
    const events = [
      "object:added",
      "object:removed",
      "object:modified",
      "selection:created",
      "selection:updated",
      "selection:cleared",
    ] as const;
    for (const e of events) fc.on(e, sync);
    return () => {
      for (const e of events) fc.off(e, sync);
    };
  }, [getFabricCanvas]);

  const onDelete = useCallback(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const active = fc.getActiveObject();
    if (!active) return;
    fc.remove(active);
    fc.discardActiveObject();
    fc.requestRenderAll();
    commit("Delete layer");
  }, [commit, getFabricCanvas]);

  const onDeselect = useCallback(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    fc.discardActiveObject();
    fc.requestRenderAll();
  }, [getFabricCanvas]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-border-soft bg-page-bg px-3 py-2.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
        <I.Move size={14} className="mt-0.5 shrink-0 text-coral-500" />
        <div className="text-[12px] leading-relaxed text-text dark:text-dark-text">
          {layerCount === 0 ? (
            <>
              Tap a layer to pick it up. There aren't any yet — add text, a shape, a sticker, or
              place an image, then come back here to drag, scale, or rotate it.
            </>
          ) : activeLabel ? (
            <>
              <span className="font-semibold text-coral-700 dark:text-coral-300">
                {activeLabel}
              </span>{" "}
              selected. Drag to move, use the corner handles to resize or rotate.
            </>
          ) : (
            <>
              Tap any text / shape / sticker / image layer to select it, then drag to move or use
              the handles to resize and rotate. The background photo isn't moveable — use Crop or
              Resize for that.
            </>
          )}
        </div>
      </div>
      {activeLabel && (
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn btn-secondary btn-xs flex-1 justify-center"
            onClick={onDeselect}
          >
            Deselect
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs flex-1 justify-center"
            onClick={onDelete}
          >
            <I.X size={11} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
