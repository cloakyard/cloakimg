// LevelsPanel.tsx — Five sliders for input black/white/gamma + output
// black/white. Auto-flushes the bake on tool switch via
// registerPendingApply, just like AdjustPanel.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { I } from "../../components/icons";
import { NumericReadout, PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { applyScopedBake, type MaskScope } from "../ai/subjectMask";
import { useSubjectMask } from "../ai/useSubjectMask";
import { AiSectionHeader } from "../ai/ui/AiSectionHeader";
import { bakeLevels, isLevelsIdentity, LEVELS_DEFAULT, type LevelsParams } from "./levels";
import { MaskScopeRow } from "../ai/ui/MaskScopeRow";
import { ScopeGate } from "../ai/ui/ScopeGate";

export function LevelsPanel() {
  const { toolState, patchTool, doc, commit, registerPendingApply } = useEditor();
  const subjectMask = useSubjectMask();
  const scope = (toolState.levelsScope as MaskScope) ?? 0;

  const params = useMemo<LevelsParams>(
    () => ({
      blackIn: toolState.levelsBlackIn,
      whiteIn: toolState.levelsWhiteIn,
      gamma: toolState.levelsGamma,
      blackOut: toolState.levelsBlackOut,
      whiteOut: toolState.levelsWhiteOut,
    }),
    [
      toolState.levelsBlackIn,
      toolState.levelsWhiteIn,
      toolState.levelsGamma,
      toolState.levelsBlackOut,
      toolState.levelsWhiteOut,
    ],
  );

  const dirty = !isLevelsIdentity(params);

  const reset = useCallback(() => {
    patchTool("levelsBlackIn", LEVELS_DEFAULT.blackIn);
    patchTool("levelsWhiteIn", LEVELS_DEFAULT.whiteIn);
    patchTool("levelsGamma", LEVELS_DEFAULT.gamma);
    patchTool("levelsBlackOut", LEVELS_DEFAULT.blackOut);
    patchTool("levelsWhiteOut", LEVELS_DEFAULT.whiteOut);
    patchTool("levelsScope", 0);
  }, [patchTool]);

  const apply = useCallback(async () => {
    if (!doc || !dirty) return;
    let out = bakeLevels(doc.working, params);
    out = await applyScopedBake(out, doc.working, scope, subjectMask);
    copyInto(doc.working, out);
    // bakeLevels pulls from the canvas pool; once copyInto has
    // mirrored the pixels we can hand the bake canvas back instead
    // of waiting on GC.
    releaseCanvas(out);
    reset();
    commit("Levels");
  }, [commit, dirty, doc, params, reset, scope, subjectMask]);

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

  // Input black/white interlock: black always strictly less than white.
  const setBlackIn = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(toolState.levelsWhiteIn - 1, Math.round(n)));
      patchTool("levelsBlackIn", clamped);
    },
    [patchTool, toolState.levelsWhiteIn],
  );
  const setWhiteIn = useCallback(
    (n: number) => {
      const clamped = Math.min(255, Math.max(toolState.levelsBlackIn + 1, Math.round(n)));
      patchTool("levelsWhiteIn", clamped);
    },
    [patchTool, toolState.levelsBlackIn],
  );
  const setBlackOut = useCallback(
    (n: number) => patchTool("levelsBlackOut", Math.max(0, Math.min(255, Math.round(n)))),
    [patchTool],
  );
  const setWhiteOut = useCallback(
    (n: number) => patchTool("levelsWhiteOut", Math.max(0, Math.min(255, Math.round(n)))),
    [patchTool],
  );
  const setGamma = useCallback(
    (n: number) => patchTool("levelsGamma", Math.max(0.1, Math.min(3, n))),
    [patchTool],
  );

  // Gate the five Levels sliders while the user has Subject /
  // Background scope picked but the mask isn't ready — the
  // MaskScopeRow above renders the detection progress, and the
  // sliders below stay greyed-out until the cut is cached.
  const gated = scope !== 0 && subjectMask.state.status !== "ready";

  return (
    <>
      <AiSectionHeader />
      <MaskScopeRow scope={toolState.levelsScope} onScope={(i) => patchTool("levelsScope", i)} />
      <ScopeGate disabled={gated}>
        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          Pull the input black up to crush shadows, the white down to clip highlights, and the
          midtone slider to lift or darken the middle of the curve.
        </div>

        <PropRow
          label="Input black"
          valueInput={
            <NumericReadout
              display={`${toolState.levelsBlackIn}`}
              normalized={toolState.levelsBlackIn / 255}
              fromNormalized={(n) => Math.round(n * 255)}
              toNormalized={(real) => real / 255}
              onCommit={(n) => setBlackIn(n * 255)}
            />
          }
        >
          <Slider
            value={toolState.levelsBlackIn / 255}
            accent={toolState.levelsBlackIn !== 0}
            defaultValue={0}
            onChange={(v) => setBlackIn(v * 255)}
          />
        </PropRow>

        <PropRow
          label="Midtone"
          valueInput={
            <NumericReadout
              display={toolState.levelsGamma.toFixed(2)}
              normalized={gammaToNormalized(toolState.levelsGamma)}
              step={0.1}
              fromNormalized={(n) => normalizedToGamma(n)}
              toNormalized={(real) => gammaToNormalized(real)}
              onCommit={(n) => setGamma(normalizedToGamma(n))}
            />
          }
        >
          <Slider
            value={gammaToNormalized(toolState.levelsGamma)}
            accent={Math.abs(toolState.levelsGamma - 1) > 1e-3}
            defaultValue={0.5}
            onChange={(v) => setGamma(normalizedToGamma(v))}
          />
        </PropRow>

        <PropRow
          label="Input white"
          valueInput={
            <NumericReadout
              display={`${toolState.levelsWhiteIn}`}
              normalized={toolState.levelsWhiteIn / 255}
              fromNormalized={(n) => Math.round(n * 255)}
              toNormalized={(real) => real / 255}
              onCommit={(n) => setWhiteIn(n * 255)}
            />
          }
        >
          <Slider
            value={toolState.levelsWhiteIn / 255}
            accent={toolState.levelsWhiteIn !== 255}
            defaultValue={1}
            onChange={(v) => setWhiteIn(v * 255)}
          />
        </PropRow>

        <PropRow
          label="Output black"
          valueInput={
            <NumericReadout
              display={`${toolState.levelsBlackOut}`}
              normalized={toolState.levelsBlackOut / 255}
              fromNormalized={(n) => Math.round(n * 255)}
              toNormalized={(real) => real / 255}
              onCommit={(n) => setBlackOut(n * 255)}
            />
          }
        >
          <Slider
            value={toolState.levelsBlackOut / 255}
            accent={toolState.levelsBlackOut !== 0}
            defaultValue={0}
            onChange={(v) => setBlackOut(v * 255)}
          />
        </PropRow>

        <PropRow
          label="Output white"
          valueInput={
            <NumericReadout
              display={`${toolState.levelsWhiteOut}`}
              normalized={toolState.levelsWhiteOut / 255}
              fromNormalized={(n) => Math.round(n * 255)}
              toNormalized={(real) => real / 255}
              onCommit={(n) => setWhiteOut(n * 255)}
            />
          }
        >
          <Slider
            value={toolState.levelsWhiteOut / 255}
            accent={toolState.levelsWhiteOut !== 255}
            defaultValue={1}
            onChange={(v) => setWhiteOut(v * 255)}
          />
        </PropRow>

        <button
          type="button"
          className="btn btn-secondary btn-xs mt-1 w-full justify-center"
          onClick={reset}
          disabled={!dirty}
        >
          <I.Refresh size={12} />
          Reset
        </button>
      </ScopeGate>
    </>
  );
}

// Map gamma 0.1..3.0 onto a 0..1 slider with 1.0 at the centre. The
// halves are linear in their own range so the slider feels balanced
// either side of neutral.
function gammaToNormalized(g: number): number {
  if (g <= 1) return Math.max(0, (g - 0.1) / 0.9) * 0.5;
  return 0.5 + Math.min(1, (g - 1) / 2) * 0.5;
}

function normalizedToGamma(n: number): number {
  if (n <= 0.5) return 0.1 + (n / 0.5) * 0.9;
  return 1 + ((n - 0.5) / 0.5) * 2;
}
