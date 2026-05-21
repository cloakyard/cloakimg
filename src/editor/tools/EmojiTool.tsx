// EmojiTool.tsx — Click on the canvas to drop the currently selected
// emoji at a fixed default size. The emoji is rendered as a static
// FabricText layer using the platform's colour-emoji font, so the entire
// system emoji catalogue is available without bundling any glyph assets.
// Tagged `cloak:emoji` so the Layers panel can label it correctly; the
// dropped object behaves like any other Fabric object after placement
// (drag, scale, rotate via native handles).

import { type FabricObject, FabricText, type TPointerEventInfo } from "fabric";
import { useEffect } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { DEFAULT_EMOJI, EMOJI_FONT_STACK } from "./emoji";

const EMOJI_TAG = "cloak:emoji";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

export function EmojiTool() {
  const { getFabricCanvas, doc, toolState, commit } = useEditor();

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    const onMouseDown = (opt: TPointerEventInfo) => {
      if (opt.target) return;
      const p = fc.getScenePoint(opt.e);
      if (p.x < 0 || p.y < 0 || p.x > doc.width || p.y > doc.height) return;
      const character = toolState.emojiChar || DEFAULT_EMOJI;
      // Default emoji size: ~1/6 of the image's short edge, mirroring
      // the legacy sticker drop size so existing muscle memory stays
      // intact when users switch between the two tools.
      const fontSize = Math.max(48, Math.round(Math.min(doc.width, doc.height) / 6));

      const emoji = new FabricText(character, {
        fontFamily: EMOJI_FONT_STACK,
        fontSize,
        originX: "left",
        originY: "top",
        selectable: true,
        hasControls: true,
        hasBorders: true,
        // Emoji glyphs already carry their own colour data so a fill
        // doesn't apply, but Fabric still tracks one for selection
        // outlining maths. Leaving the default keeps that hidden.
      });
      const bbox = emoji.getBoundingRect();
      emoji.set({ left: p.x - bbox.width / 2, top: p.y - bbox.height / 2 });
      (emoji as TaggedFabricObject).cloakKind = EMOJI_TAG;
      fc.add(emoji);
      fc.setActiveObject(emoji);
      fc.requestRenderAll();
      commit("Add emoji");
    };

    fc.on("mouse:down", onMouseDown);
    return () => {
      fc.off("mouse:down", onMouseDown);
    };
  }, [commit, doc, getFabricCanvas, toolState.emojiChar]);

  useStageProps({ fabricInteractive: true, cursor: "crosshair" });
  return null;
}
