// PenPanel.tsx — Phase F4.5. Stroke / fill / width controls for the
// in-progress Pen path AND the currently-selected committed pen path.
//
// Fill is a toggle (on / off) rather than a "No fill" / "Add fill"
// button pair — clearer affordance, smaller surface, matches the
// pattern used elsewhere in the editor for boolean state. The last
// non-transparent colour is remembered in a ref so toggling off and
// back on restores the user's pick instead of resetting to the
// stroke colour.
//
// When a committed pen path is selected (cloak:shape with cloakAnchors
// set), panel changes propagate live to that path — toggling fill on
// fills the existing shape, dragging the stroke-width slider thickens
// the stroke in real time, and so on. Without this, the panel only
// affected new paths and changes silently no-op'd on existing ones,
// which led users to think Fill was broken.

import type { FabricObject } from "fabric";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColorPicker } from "../ColorPicker";
import { useEditorActions, useToolState } from "../EditorContext";
import { PropRow, Slider, ToggleSwitch } from "../atoms";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
  cloakAnchors?: unknown[];
}

function isPenPath(obj: FabricObject | null): obj is FabricObject {
  if (!obj) return false;
  const o = obj as TaggedFabricObject;
  return o.cloakKind === "cloak:shape" && Array.isArray(o.cloakAnchors);
}

export function PenPanel() {
  const toolState = useToolState();
  const { patchTool, getFabricCanvas } = useEditorActions();
  const fillOn = toolState.penFill !== "transparent";
  // Remember whatever colour the user last chose for the fill, so
  // toggling Fill off → on restores their pick instead of jumping to
  // the stroke colour.
  const lastFillRef = useRef<string>(fillOn ? toolState.penFill : toolState.penStroke);
  if (fillOn) lastFillRef.current = toolState.penFill;

  // Track the currently-selected pen path so panel changes can write
  // back to it. We keep the FabricObject in state (not a ref) so the
  // panel re-renders when the user picks a different path, but only
  // re-render on selection events — slider drags don't churn this.
  const [selected, setSelected] = useState<FabricObject | null>(null);
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const sync = () => {
      const a = fc.getActiveObject() ?? null;
      setSelected(isPenPath(a) ? a : null);
    };
    sync();
    const events = ["selection:created", "selection:updated", "selection:cleared"] as const;
    for (const e of events) fc.on(e, sync);
    return () => {
      for (const e of events) fc.off(e, sync);
    };
  }, [getFabricCanvas]);

  // Push panel-driven changes onto the selected path's Fabric props.
  // Empty string for fill is Fabric's "no fill" sentinel — passing
  // "transparent" works in CSS but renders as a coloured fill in
  // Fabric on some versions, so we normalise it here.
  const updateSelected = useCallback(
    (props: Record<string, unknown>) => {
      if (!selected) return;
      const fc = getFabricCanvas();
      if (!fc) return;
      selected.set(props);
      selected.dirty = true;
      fc.requestRenderAll();
    },
    [getFabricCanvas, selected],
  );

  const onStrokeChange = useCallback(
    (c: string) => {
      patchTool("penStroke", c);
      updateSelected({ stroke: c });
    },
    [patchTool, updateSelected],
  );

  const onFillToggle = useCallback(
    (on: boolean) => {
      const next = on ? lastFillRef.current : "transparent";
      patchTool("penFill", next);
      updateSelected({ fill: next === "transparent" ? "" : next });
    },
    [patchTool, updateSelected],
  );

  const onFillColor = useCallback(
    (c: string) => {
      patchTool("penFill", c);
      lastFillRef.current = c;
      updateSelected({ fill: c });
    },
    [patchTool, updateSelected],
  );

  const onStrokeWidth = useCallback(
    (v: number) => {
      const w = Math.max(1, v * 32);
      patchTool("penStrokeWidth", w);
      updateSelected({ strokeWidth: w });
    },
    [patchTool, updateSelected],
  );

  // Reflect the selected path's actual property values when one is
  // active so the panel matches what the user sees on canvas. Falls
  // back to toolState defaults when nothing is selected.
  const selStroke =
    typeof (selected?.stroke as unknown) === "string"
      ? (selected?.stroke as string)
      : toolState.penStroke;
  const selFillRaw = selected?.fill;
  const selFill =
    typeof selFillRaw === "string"
      ? selFillRaw === ""
        ? "transparent"
        : selFillRaw
      : toolState.penFill;
  const selFillOn = selFill !== "transparent";
  const selStrokeWidth = (selected?.strokeWidth as number | undefined) ?? toolState.penStrokeWidth;

  return (
    <>
      <PropRow label="Stroke">
        <ColorPicker value={selStroke} onChange={onStrokeChange} />
      </PropRow>
      <PropRow label="Fill" valueInput={<ToggleSwitch on={selFillOn} onChange={onFillToggle} />}>
        {selFillOn ? (
          <ColorPicker
            value={selFill === "transparent" ? lastFillRef.current : selFill}
            onChange={onFillColor}
          />
        ) : null}
      </PropRow>
      <PropRow label="Stroke width" value={`${selStrokeWidth.toFixed(0)} px`}>
        <Slider
          value={Math.min(1, selStrokeWidth / 32)}
          accent
          defaultValue={2 / 32}
          onChange={onStrokeWidth}
        />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {selected
          ? "Editing the selected path. Click an empty area on the canvas to deselect, or pick another tool to stop editing."
          : "Click to drop anchors; drag from a click to bend with bezier handles. Click the first anchor or press "}
        {!selected && (
          <>
            <strong>Enter</strong> to finish. <strong>Esc</strong> cancels.
          </>
        )}
      </div>
    </>
  );
}
