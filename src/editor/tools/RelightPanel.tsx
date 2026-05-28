// RelightPanel.tsx — Controls for the depth-aware Relight tool. The
// light is aimed by dragging the sun on the canvas (RelightTool); this
// panel owns the strength / height / warmth sliders, the Whole /
// Subject / Background scope, and the depth-model download gating.
//
// Depth is required before any relight can render, so while the model
// is downloading / estimating the sliders sit behind a ScopeGate and a
// progress card explains what's happening — the same pattern Filter /
// Adjust use for the subject mask.

import { useCallback } from "react";
import { I } from "../../components/icons";
import { useDepth } from "../ai/capabilities/depth/hook";
import { DEFAULT_DEPTH_TIER, DEPTH_FAMILY } from "../ai/capabilities/depth/family";
import { applyScopedBake, type MaskScope } from "../ai/subjectMask";
import { useSubjectMask } from "../ai/useSubjectMask";
import { MaskScopeRow } from "../ai/ui/MaskScopeRow";
import { ScopeGate } from "../ai/ui/ScopeGate";
import { CapabilityErrorCard, CapabilityProgressCard } from "../ai/ui/status/CapabilityStatusCards";
import { PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { bakeRelight, isRelightIdentity } from "./relight";

export function RelightPanel() {
  const toolState = useToolState();
  const { patchTool, commit } = useEditorActions();
  const { doc } = useEditorReadOnly();
  const depth = useDepth();
  const subjectMask = useSubjectMask();

  const scope = (toolState.relightScope as MaskScope) ?? 0;
  const status = depth.state.status;
  const depthReady = status === "ready";

  const dirty = !isRelightIdentity({
    sunX: toolState.relightSunX,
    sunY: toolState.relightSunY,
    elevation: toolState.relightElevation,
    intensity: toolState.relightIntensity,
    warmth: toolState.relightWarmth,
  });

  const reset = useCallback(() => {
    patchTool("relightIntensity", 0);
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc || !dirty) return;
    const depthCanvas = depth.peek();
    if (!depthCanvas) return; // No depth yet — nothing to bake against.
    let out = bakeRelight(doc.working, depthCanvas, {
      sunX: toolState.relightSunX,
      sunY: toolState.relightSunY,
      elevation: toolState.relightElevation,
      intensity: toolState.relightIntensity,
      warmth: toolState.relightWarmth,
    });
    out = await applyScopedBake(out, doc.working, scope, subjectMask);
    copyInto(doc.working, out);
    releaseCanvas(out);
    // Reset to identity so a subsequent tool visit doesn't double-bake;
    // the sun / height / warmth stay put as sensible next-edit defaults.
    patchTool("relightIntensity", 0);
    commit("Relight");
  }, [commit, depth, dirty, doc, patchTool, scope, subjectMask, toolState]);

  useApplyOnToolSwitch(apply, dirty);

  return (
    <>
      {/* Depth model gating — progress / error while the model loads. */}
      {status === "loading" && (
        <CapabilityProgressCard
          progress={depth.state.progress}
          warm={depth.state.warm}
          copy={DEPTH_FAMILY.status}
          expectedTotal={DEFAULT_DEPTH_TIER.bytes}
          onCancel={depth.cancel}
        />
      )}
      {status === "error" && (
        <CapabilityErrorCard
          msg={depth.state.error}
          onRetry={() => void depth.requestExplicit().catch(() => undefined)}
        />
      )}
      {!depthReady && status !== "loading" && status !== "error" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-text">
            <I.Sparkles size={12} className="shrink-0 text-coral-500 dark:text-coral-400" />
            Relight needs an on-device depth model
          </div>
          <div className="text-[11.5px] leading-snug text-text-muted">
            One ~{DEFAULT_DEPTH_TIER.mb} MB download, then it runs entirely in this tab — your photo
            never leaves your device.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm self-start"
            onClick={() => void depth.requestExplicit().catch(() => undefined)}
          >
            <I.Download size={13} /> Enable relight
          </button>
        </div>
      )}

      <ScopeGate disabled={!depthReady}>
        {/* Header — names the gesture so the on-canvas sun is discoverable. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-text">
              Relight
            </div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-text-muted">
              Drag the sun on your photo to aim the light.
            </div>
          </div>
          {dirty && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 font-[inherit] text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface hover:text-text"
              aria-label="Reset relight"
            >
              <I.Rotate size={11} /> Reset
            </button>
          )}
        </div>

        <PropRow label="Intensity" value={`${Math.round(toolState.relightIntensity * 100)}%`}>
          <Slider
            value={toolState.relightIntensity}
            accent
            defaultValue={0}
            onChange={(v) => patchTool("relightIntensity", v)}
          />
        </PropRow>
        <PropRow label="Light height" value={`${Math.round(toolState.relightElevation * 100)}%`}>
          <Slider
            value={toolState.relightElevation}
            defaultValue={0.6}
            onChange={(v) => patchTool("relightElevation", v)}
          />
        </PropRow>
        <PropRow label="Warmth" value={warmthLabel(toolState.relightWarmth)}>
          <Slider
            value={toolState.relightWarmth}
            defaultValue={0.5}
            onChange={(v) => patchTool("relightWarmth", v)}
          />
        </PropRow>

        <MaskScopeRow
          scope={toolState.relightScope}
          onScope={(i) => patchTool("relightScope", i)}
        />
      </ScopeGate>
    </>
  );
}

/** Warmth read-out: a signed "cool ← neutral → warm" hint rather than a
 *  bare percentage, so the slider's centre reads as neutral. */
function warmthLabel(v: number): string {
  const d = Math.round((v - 0.5) * 200);
  if (d === 0) return "Neutral";
  return d > 0 ? `Warm +${d}` : `Cool ${d}`;
}
