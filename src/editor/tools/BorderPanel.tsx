// BorderPanel.tsx — Mode (Solid / Aspect) + thickness or aspect picker
// + colour. Apply bakes a new larger working canvas and shifts every
// Fabric layer by the offset so they stay anchored to the image.

import { useCallback, useMemo } from "react";
import { I } from "../../components/icons";
import { NumericReadout, PropRow, Segment, Slider } from "../atoms";
import { ColorPicker } from "../ColorPicker";
import { copyInto } from "../doc";
import { useEditor } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import {
  bakeBorder,
  BORDER_ASPECTS,
  computeAspectTargetSize,
  isBorderIdentity,
  solidBorderMax,
} from "./border";

const MODES = ["Solid", "Aspect"] as const;

export function BorderPanel() {
  const { toolState, patchTool, doc, commit, getFabricCanvas } = useEditor();
  const docW = doc?.width ?? 0;
  const docH = doc?.height ?? 0;

  const maxSolid = useMemo(() => (doc ? solidBorderMax(doc.width, doc.height) : 200), [doc]);

  const params = useMemo(
    () => ({
      mode: toolState.borderMode as 0 | 1,
      thickness: toolState.borderThickness,
      color: toolState.borderColor,
      aspect: toolState.borderAspect,
    }),
    [
      toolState.borderMode,
      toolState.borderThickness,
      toolState.borderColor,
      toolState.borderAspect,
    ],
  );

  const dirty = !!doc && !isBorderIdentity(params, docW, docH);

  const reset = useCallback(() => {
    patchTool("borderThickness", 0);
    patchTool("borderAspect", 0);
  }, [patchTool]);

  const apply = useCallback(() => {
    if (!doc || !dirty) return;
    const result = bakeBorder(doc.working, params);
    copyInto(doc.working, result.canvas);
    doc.width = result.canvas.width;
    doc.height = result.canvas.height;
    // Shift every Fabric layer by the same offset so they stay anchored
    // to the image rather than the new top-left. Crop overlay isn't
    // present on this tool, but filter it out defensively.
    const fc = getFabricCanvas();
    if (fc && (result.offsetX || result.offsetY)) {
      for (const obj of fc.getObjects()) {
        if ((obj as { cloakKind?: string }).cloakKind === "cloak:cropOverlay") continue;
        obj.set({
          left: (obj.left ?? 0) + result.offsetX,
          top: (obj.top ?? 0) + result.offsetY,
        });
        obj.setCoords();
      }
      fc.requestRenderAll();
    }
    reset();
    commit("Border");
  }, [commit, dirty, doc, getFabricCanvas, params, reset]);

  useApplyOnToolSwitch(apply, dirty);

  const target = useMemo(() => {
    if (!doc || params.mode !== 1 || params.aspect <= 0) return null;
    return computeAspectTargetSize(doc.width, doc.height, params.aspect);
  }, [doc, params.aspect, params.mode]);

  return (
    <>
      <PropRow label="Mode">
        <Segment
          options={MODES}
          active={toolState.borderMode}
          onChange={(i) => patchTool("borderMode", i)}
        />
      </PropRow>

      {toolState.borderMode === 0 ? (
        <PropRow
          label="Thickness"
          valueInput={
            <NumericReadout
              display={`${toolState.borderThickness}`}
              normalized={maxSolid > 0 ? Math.min(1, toolState.borderThickness / maxSolid) : 0}
              fromNormalized={(n) => Math.round(n * maxSolid)}
              toNormalized={(real) => (maxSolid > 0 ? real / maxSolid : 0)}
              onCommit={(n) =>
                patchTool(
                  "borderThickness",
                  Math.max(0, Math.min(maxSolid, Math.round(n * maxSolid))),
                )
              }
            />
          }
        >
          <Slider
            value={maxSolid > 0 ? Math.min(1, toolState.borderThickness / maxSolid) : 0}
            accent={toolState.borderThickness > 0}
            defaultValue={0}
            onChange={(v) => patchTool("borderThickness", Math.round(v * maxSolid))}
          />
        </PropRow>
      ) : (
        <PropRow label="Target ratio">
          <div className="flex flex-wrap gap-1.5">
            {/* Explicit "None" pill — gives the user a tappable
                "no aspect lock" state instead of relying on
                tap-the-active-button-again to clear. The previous
                tap-to-deselect behaviour is retained for power users
                but the None pill makes the no-op state visible to
                first-time users. */}
            {(() => {
              const noneActive = toolState.borderAspect === 0;
              return (
                <button
                  key="none"
                  type="button"
                  onClick={() => patchTool("borderAspect", 0)}
                  aria-pressed={noneActive}
                  className={`flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-[11.5px] font-semibold pointer-coarse:py-2.5 pointer-coarse:text-[12.5px] ${
                    noneActive
                      ? "border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                      : "border-border-soft bg-page-bg text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted"
                  }`}
                >
                  None
                </button>
              );
            })()}
            {BORDER_ASPECTS.map((a) => {
              const active = Math.abs(toolState.borderAspect - a.ratio) < 1e-3;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => patchTool("borderAspect", active ? 0 : a.ratio)}
                  aria-pressed={active}
                  className={`flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-[11.5px] font-semibold pointer-coarse:py-2.5 pointer-coarse:text-[12.5px] ${
                    active
                      ? "border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                      : "border-border-soft bg-page-bg text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </PropRow>
      )}

      <PropRow label="Color">
        <ColorPicker value={toolState.borderColor} onChange={(c) => patchTool("borderColor", c)} />
      </PropRow>

      {target && (
        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          New size: {target.w} × {target.h}
        </div>
      )}
      {toolState.borderMode === 0 && (
        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          Adds a uniform pad on every side. Layers shift with the image so a watermark stays in its
          corner.
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-xs mt-1 w-full justify-center text-coral-700 dark:text-coral-300"
        onClick={reset}
        disabled={!dirty}
      >
        <I.Refresh size={12} />
        Reset
      </button>
    </>
  );
}
