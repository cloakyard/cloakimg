// BgBlurPanel.tsx — Portrait-mode-style depth-of-field. The user
// picks a lens flavour (Soft / Lens / Tilt-shift) and a strength;
// the bake composites the result against the subject mask so the
// subject stays sharp and the background takes the blur. Picking
// any non-Whole scope auto-fires subject detection through the
// central mask service; from then on every tool that uses the mask
// is instant.
//
// Design call: this tool intentionally does NOT offer "blur the
// subject" any more. Anonymising a face is the Redact tool's job
// (it already supports pixelate / blur / solid styles, including a
// person-aware shortcut). Keeping that mode here was confusing and
// duplicated functionality. The numeric scope keys still match the
// central MaskScope type (0 = whole, 2 = background) so existing
// state migrates without conversion.

import { useCallback, useEffect, useRef } from "react";
import { I } from "../../components/icons";
import { PropRow, Segment, Slider, ToggleSwitch } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import {
  bakeBgBlur,
  blurAmountToPx,
  isBgBlurIdentity,
  LENS_KIND_HINTS,
  LENS_KIND_LABELS,
  type LensKind,
} from "./bgBlur";
import {
  DetectionErrorCard,
  DetectionPausedChip,
  DetectionProgressCard,
  DetectionReadyChip,
} from "./DetectionStatus";
import { ScopeGate } from "./ScopeGate";

const TARGETS = ["Background only", "Whole image"] as const;
const LENS_OPTIONS: LensKind[] = ["gaussian", "lens", "tilt-shift"];
const LENS_LABELS = LENS_OPTIONS.map((k) => LENS_KIND_LABELS[k]);

export function BgBlurPanel() {
  const { toolState, patchTool, doc, commit, registerPendingApply } = useEditor();
  const subjectMask = useSubjectMask();
  // 0 (whole) or 2 (background). The Subject scope (1) used to live
  // here; we coerce any leftover value-1 doc state to 2 so old saved
  // sessions round-trip cleanly.
  const rawScope = (toolState.bgBlurScope as MaskScope) ?? 2;
  const scope: MaskScope = rawScope === 1 ? 2 : rawScope;
  const targetIndex = scope === 0 ? 1 : 0;
  const amount = toolState.bgBlurAmount;
  const lens = toolState.bgBlurLens;
  const progressive = toolState.bgBlurProgressive;
  const dirty = !isBgBlurIdentity(amount);

  const reset = useCallback(() => {
    patchTool("bgBlurAmount", 0.4);
    patchTool("bgBlurScope", 2);
    patchTool("bgBlurLens", "gaussian");
    patchTool("bgBlurProgressive", false);
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc || !dirty) return;
    // For background scope, await the cached cut (or trigger
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
    const out = bakeBgBlur(doc.working, mask, scope, { amount, lens, progressive });
    copyInto(doc.working, out);
    releaseCanvas(out);
    reset();
    commit("Portrait blur");
  }, [amount, commit, dirty, doc, lens, progressive, reset, scope, subjectMask]);

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

  // Auto-trigger detection when the panel opens with the default
  // background scope and the mask isn't ready. Mirrors MaskScopeRow's
  // own auto-trigger but happens at the panel level since the row UI
  // is now custom (Background-only / Whole-image, not Whole / Subject /
  // Background). State mid-flight: do nothing — the inline progress
  // card below already reads "Detecting subject…". When the user has
  // explicitly dismissed the consent dialog this session, we leave
  // the panel paused and surface DetectionPausedChip instead — the
  // alternative is an immediate re-pop loop the user can't escape.
  useEffect(() => {
    if (scope === 0) return;
    if (subjectMask.state.userDenied) return;
    const status = subjectMask.state.status;
    if (status === "ready" || status === "loading" || status === "error") return;
    if (status === "needs-consent") return;
    void subjectMask.request().catch(() => undefined);
  }, [scope, subjectMask]);

  const radiusPx = Math.round(blurAmountToPx(amount));
  // Gate the blur strength slider while a non-Whole scope is picked
  // and the mask isn't ready. Without this, dragging during detection
  // would show whole-image blur (the bake's mask=null fallback) and
  // read as "Background-only is broken" — exactly the regression this
  // gate prevents.
  const gated = scope !== 0 && subjectMask.state.status !== "ready";

  const lensIndex = LENS_OPTIONS.indexOf(lens);
  const handleTarget = useCallback(
    (i: number) => {
      // i=0 → "Background only" → bgBlurScope=2; i=1 → "Whole image"
      // → bgBlurScope=0. Note the segment index ↔ scope value
      // inversion: index 0 in the UI is the *AI-using* option.
      const nextScope = i === 0 ? 2 : 0;
      patchTool("bgBlurScope", nextScope);
      // Picking Background-only after a previous deny is the explicit
      // re-opt-in signal — kick off the resume flow so the consent
      // dialog re-opens instead of leaving the panel paused.
      if (nextScope !== 0 && subjectMask.state.userDenied) {
        void subjectMask.resumeAfterDeny();
      }
    },
    [patchTool, subjectMask],
  );
  const handleLens = useCallback(
    (i: number) => {
      patchTool("bgBlurLens", LENS_OPTIONS[i] ?? "gaussian");
    },
    [patchTool],
  );
  const handleRetry = useCallback(() => {
    void subjectMask.request().catch(() => undefined);
  }, [subjectMask]);

  return (
    <>
      {/* AI section header — sparkle indicates this panel uses the
          on-device subject model when targeting the background. */}
      <div className="flex items-center gap-1.5 text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
        <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
        Subject-aware lens
      </div>

      <PropRow label="Blur target">
        <Segment options={TARGETS} active={targetIndex} onChange={handleTarget} />
      </PropRow>

      {scope !== 0 && subjectMask.state.status === "loading" && (
        <DetectionProgressCard
          progress={subjectMask.state.progress}
          warm={subjectMask.state.warm}
        />
      )}
      {scope !== 0 && subjectMask.state.status === "ready" && (
        <DetectionReadyChip message="Subject locked in — adjust the blur below." />
      )}
      {scope !== 0 && subjectMask.state.status === "idle" && subjectMask.state.userDenied && (
        <DetectionPausedChip onResume={() => void subjectMask.resumeAfterDeny()} />
      )}
      {scope !== 0 && subjectMask.state.status === "error" && (
        <DetectionErrorCard msg={subjectMask.state.error} onRetry={handleRetry} />
      )}

      <ScopeGate disabled={gated}>
        <PropRow label="Lens">
          <Segment options={LENS_LABELS} active={Math.max(0, lensIndex)} onChange={handleLens} />
        </PropRow>
        <div className="text-[11px] leading-snug text-text-muted dark:text-dark-text-muted">
          {LENS_KIND_HINTS[lens]}
        </div>

        <PropRow label="Strength" value={`${radiusPx} px`}>
          <Slider
            value={amount}
            accent={amount > 0.001}
            defaultValue={0.4}
            onChange={(v) => patchTool("bgBlurAmount", v)}
          />
        </PropRow>

        {/* Progressive falloff is meaningless on whole-image and on
            tilt-shift (which has its own falloff geometry). Hide it
            in those cases instead of showing a no-op toggle. */}
        {scope !== 0 && lens !== "tilt-shift" && (
          <PropRow label="Progressive falloff">
            <ToggleSwitch on={progressive} onChange={(v) => patchTool("bgBlurProgressive", v)} />
          </PropRow>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-xs mt-1 w-full justify-center"
          onClick={reset}
          disabled={amount === 0.4 && scope === 2 && lens === "gaussian" && !progressive}
        >
          <I.Refresh size={12} />
          Reset
        </button>

        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          {scope === 2
            ? progressive
              ? "Subject stays crisp; the background blur ramps softer near the subject and stronger toward the edges of the frame."
              : "Subject stays crisp; the entire background takes a uniform lens blur."
            : "The whole image is blurred. Pick Background only to keep the subject in focus."}
        </div>
      </ScopeGate>
    </>
  );
}
