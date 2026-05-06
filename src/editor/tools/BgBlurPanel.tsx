// BgBlurPanel.tsx — Portrait-mode-style depth-of-field. The user
// picks which side of the subject gets the blur (Background by
// default → recognisable phone-portrait look) and how strong it is.
// The first non-Whole scope auto-fires subject detection through
// MaskScopeRow; from then on every tool that uses the mask is
// instant.

import { useCallback, useEffect, useRef } from "react";
import { I } from "../../components/icons";
import { PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { type MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { bakeBgBlur, blurAmountToPx, isBgBlurIdentity } from "./bgBlur";
import { MaskScopeRow } from "./MaskScopeRow";

export function BgBlurPanel() {
  const { toolState, patchTool, doc, commit, registerPendingApply } = useEditor();
  const subjectMask = useSubjectMask();
  const scope = (toolState.bgBlurScope as MaskScope) ?? 2;
  const amount = toolState.bgBlurAmount;
  const dirty = !isBgBlurIdentity(amount);

  const reset = useCallback(() => {
    patchTool("bgBlurAmount", 0.4);
    patchTool("bgBlurScope", 2);
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc || !dirty) return;
    // For non-Whole scopes, await the cached cut (or trigger
    // detection if the user committed before MaskScopeRow's
    // auto-trigger had fired). Whole-image blur runs without ever
    // touching the model.
    let mask: HTMLCanvasElement | null = null;
    if (scope !== 0) {
      try {
        mask = subjectMask.peek() ?? (await subjectMask.request());
      } catch {
        // Detection failed — degrade to whole-image blur rather than
        // dropping the user's edit on the floor.
        mask = null;
      }
    }
    const out = bakeBgBlur(doc.working, mask, scope, amount);
    copyInto(doc.working, out);
    releaseCanvas(out);
    reset();
    commit("Portrait blur");
  }, [amount, commit, dirty, doc, reset, scope, subjectMask]);

  // Auto-flush on tool switch / Export, same pattern as the tone
  // tools.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!dirty) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [dirty, registerPendingApply]);

  const radiusPx = Math.round(blurAmountToPx(amount));

  return (
    <>
      <MaskScopeRow
        label="Blur target"
        scope={toolState.bgBlurScope}
        onScope={(i) => patchTool("bgBlurScope", i)}
      />

      <PropRow label="Strength" value={`${radiusPx} px`}>
        <Slider
          value={amount}
          accent={amount > 0.001}
          defaultValue={0.4}
          onChange={(v) => patchTool("bgBlurAmount", v)}
        />
      </PropRow>

      <button
        type="button"
        className="btn btn-secondary btn-xs mt-1 w-full justify-center"
        onClick={reset}
        disabled={amount === 0.4 && scope === 2}
      >
        <I.Refresh size={12} />
        Reset
      </button>

      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {scope === 2
          ? "Subject stays sharp; the background gets a phone-portrait gaussian blur."
          : scope === 1
            ? "Background stays sharp; the subject gets blurred — useful for stylised covers or anonymising a face."
            : "The whole image is gaussian-blurred. Pick Subject or Background to keep one side crisp."}
      </div>
    </>
  );
}
