// TextTool.tsx — Fabric IText-based text editor (Phase F2-B-3).
//
// While the Text tool is active, the Fabric stage runs interactive
// (`fabricInteractive`):
//
//   • Click empty canvas → drop a new IText at the click position,
//     selected with transform handles and ready to drag immediately.
//     The user can double-click (or press Enter) to enter inline edit
//     mode, or just type into the panel's Caption field.
//   • Click an existing IText → select it (Fabric handles transform
//     handles + drag).
//   • Double-click an IText → enter editing mode.
//   • Drag → move (Fabric native).
//   • Esc → exit editing.
//
// The TextPanel reflects the active selection's properties and
// pushes panel changes back into the live Fabric object.

import { type FabricObject, IText, type TPointerEventInfo } from "fabric";
import { useEffect } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { ALIGN_OPTIONS, FONT_OPTIONS, WEIGHT_OPTIONS } from "./TextPanel";

/** Fabric `cloakKind` tag for free-form text layers (distinct from
 *  watermark-text which is pinned). */
export const TEXT_TAG = "cloak:text";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

export function TextTool() {
  const { getFabricCanvas, doc, toolState, commit } = useEditor();

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    const onMouseDown = (opt: TPointerEventInfo) => {
      // If the click landed on an existing object, let Fabric handle
      // selection / transform / inline-edit. Only act on empty space.
      if (opt.target) return;
      const p = fc.getScenePoint(opt.e);
      // Outside-image clicks shouldn't drop layers (matches the
      // legacy behaviour).
      if (p.x < 0 || p.y < 0 || p.x > doc.width || p.y > doc.height) return;

      const fontOption = FONT_OPTIONS[toolState.textFont] ?? FONT_OPTIONS[0];
      const text = new IText(toolState.textValue || "Caption", {
        left: p.x,
        top: p.y,
        fontFamily: fontOption.stack,
        fontSize: toolState.textSize,
        fontWeight: WEIGHT_OPTIONS[toolState.textWeight] ?? 600,
        textAlign: ALIGN_OPTIONS[toolState.textAlign] ?? "left",
        fill: toolState.textColor,
        originX: "left",
        originY: "top",
        editable: true,
        selectable: true,
        hasControls: true,
        hasBorders: true,
      });
      (text as TaggedFabricObject).cloakKind = TEXT_TAG;
      fc.add(text);
      fc.setActiveObject(text);
      // Don't auto-enter editing — that traps the user in a caret-mode
      // loop where their next click creates another IText instead of
      // moving the one they just dropped. Land in select mode so drag
      // works immediately; double-click or Enter to inline edit.
      fc.requestRenderAll();
      commit("Add text");
    };

    fc.on("mouse:down", onMouseDown);
    return () => {
      fc.off("mouse:down", onMouseDown);
    };
  }, [commit, doc, getFabricCanvas, toolState]);

  useStageProps({ fabricInteractive: true, cursor: "text" });
  return null;
}
