// StickerTool.tsx — Click on the canvas to drop the currently
// selected sticker (built-in vector or user-uploaded raster/SVG) at a
// fixed default size. Once placed the sticker behaves like any other
// Fabric object: drag, scale, rotate via native handles. Tagged
// `cloak:sticker` so the Layers panel can offer per-image filters.

import {
  type FabricObject,
  FabricImage,
  loadSVGFromString,
  Path,
  type TPointerEventInfo,
  util,
} from "fabric";
import { useEffect, useRef } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { type CustomSticker, listCustomStickers } from "./customStickers";
import { STICKERS } from "./stickers";

const STICKER_TAG = "cloak:sticker";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

export function StickerTool() {
  const { getFabricCanvas, doc, toolState, commit } = useEditor();
  // Cached list of user-uploaded stickers; refreshed on tool mount so
  // a sticker added in the panel without leaving the tool is reachable.
  const customsRef = useRef<CustomSticker[]>([]);
  useEffect(() => {
    // customStickerId is the trigger: re-pull on every selection so a
    // sticker uploaded in the panel without leaving the tool is
    // reachable when the user clicks the canvas.
    void toolState.customStickerId;
    let cancelled = false;
    void listCustomStickers().then((c) => {
      if (!cancelled) customsRef.current = c;
    });
    return () => {
      cancelled = true;
    };
  }, [toolState.customStickerId]);

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    const onMouseDown = async (opt: TPointerEventInfo) => {
      if (opt.target) return;
      const p = fc.getScenePoint(opt.e);
      if (p.x < 0 || p.y < 0 || p.x > doc.width || p.y > doc.height) return;
      // Default sticker size: ~1/6 of the image's short edge.
      const target = Math.max(48, Math.round(Math.min(doc.width, doc.height) / 6));

      let placed: FabricObject | null = null;

      if (toolState.customStickerId) {
        const custom = customsRef.current.find((c) => c.id === toolState.customStickerId);
        if (!custom) return;
        placed = await buildCustomSticker(custom, target);
      } else {
        const sticker = STICKERS[toolState.stickerKind];
        if (!sticker) return;
        const scale = target / 100;
        placed = new Path(sticker.d, {
          fill: sticker.fill,
          stroke: undefined,
          strokeWidth: 0,
          scaleX: scale,
          scaleY: scale,
          originX: "left",
          originY: "top",
          selectable: true,
          hasControls: true,
          hasBorders: true,
        });
      }

      if (!placed) return;
      // Centre on the click. We compute on the just-built object's
      // own bbox so SVG / raster stickers with non-square content
      // still look centred under the cursor.
      const bbox = placed.getBoundingRect();
      placed.set({ left: p.x - bbox.width / 2, top: p.y - bbox.height / 2 });
      (placed as TaggedFabricObject).cloakKind = STICKER_TAG;
      fc.add(placed);
      fc.setActiveObject(placed);
      fc.requestRenderAll();
      commit("Add sticker");
    };

    fc.on("mouse:down", (opt) => {
      void onMouseDown(opt);
    });
    return () => {
      fc.off("mouse:down");
    };
  }, [commit, doc, getFabricCanvas, toolState.customStickerId, toolState.stickerKind]);

  useStageProps({ fabricInteractive: true, cursor: "crosshair" });
  return null;
}

/** Build a Fabric object for a user-uploaded sticker. SVG uploads
 *  become a grouped Path so they keep vector edges on zoom; raster
 *  uploads become a FabricImage. Sized so the longer edge matches
 *  `target` image-space pixels. */
async function buildCustomSticker(
  sticker: CustomSticker,
  target: number,
): Promise<FabricObject | null> {
  if (sticker.svgText) {
    try {
      const result = await loadSVGFromString(sticker.svgText);
      const obj = util.groupSVGElements(
        result.objects.filter((o): o is FabricObject => !!o),
        {
          ...result.options,
        },
      );
      const w = obj.width || 100;
      const h = obj.height || 100;
      const scale = target / Math.max(w, h);
      obj.set({
        scaleX: scale,
        scaleY: scale,
        originX: "left",
        originY: "top",
        selectable: true,
        hasControls: true,
        hasBorders: true,
      });
      return obj;
    } catch {
      // Fall through to raster.
    }
  }
  try {
    const img = await FabricImage.fromURL(sticker.dataUrl);
    const w = img.width || 100;
    const h = img.height || 100;
    const scale = target / Math.max(w, h);
    img.set({
      scaleX: scale,
      scaleY: scale,
      originX: "left",
      originY: "top",
      selectable: true,
      hasControls: true,
      hasBorders: true,
    });
    return img;
  } catch {
    return null;
  }
}
