// MaskScopeRow.tsx — Shared "Apply to: Whole / Subject / Background"
// segmented control. Drop this into any per-pixel tool (Adjust,
// Filter, Levels, HSL, Background blur) to give the user mask-aware
// editing without any extra thinking — the moment they pick Subject
// or Background, the central subject-mask service kicks off detection
// if it hasn't already, shows progress inline, and the tool's bake
// quietly starts scoping its output. Once detected, every other
// tool's scope toggle is instant.
//
// Visual states (top → bottom):
//   • Idle, scope = Whole — just the segmented control.
//   • Idle, scope ≠ Whole, mask not yet ready — auto-triggers
//     detection on mount; shows the inline progress card.
//   • Loading — DetectionProgressCard with download or inference state.
//   • Ready — DetectionReadyChip.
//   • Error — DetectionErrorCard with a Try Again button.
//
// All three sub-states render the *exact* same components Remove BG
// uses (`./DetectionStatus`), so the visual rhythm is uniform across
// every subject-aware tool.

import { useCallback, useEffect } from "react";
import { PropRow, Segment } from "../atoms";
import { useSubjectMask } from "../useSubjectMask";
import { DetectionErrorCard, DetectionProgressCard, DetectionReadyChip } from "./DetectionStatus";

const SCOPE_OPTIONS = ["Whole", "Subject", "Background"] as const;

interface Props {
  scope: number;
  onScope: (i: number) => void;
  /** Override the section label. Defaults to "Apply to". The
   *  Background-blur tool overrides this to "Blur target" so the
   *  segment makes sense in context. */
  label?: string;
}

export function MaskScopeRow({ scope, onScope, label = "Apply to" }: Props) {
  const { state, request } = useSubjectMask();
  const wantsMask = scope !== 0;

  // Auto-trigger detection the moment the user picks a scoped option
  // and the mask isn't ready. We don't trigger if status is already
  // "loading" or "error" (avoid hammering retries; the error card
  // owns the retry button). Idle status is the "first time after
  // pick" case — kick it off without making the user hunt for a
  // button.
  useEffect(() => {
    if (!wantsMask) return;
    if (state.status === "ready" || state.status === "loading" || state.status === "error") return;
    void request().catch(() => {
      // Errors surface via state.error → DetectionErrorCard.
    });
  }, [request, state.status, wantsMask]);

  const handleScope = useCallback(
    (i: number) => {
      onScope(i);
    },
    [onScope],
  );

  const handleRetry = useCallback(() => {
    void request().catch(() => undefined);
  }, [request]);

  return (
    <>
      <PropRow label={label}>
        <Segment options={SCOPE_OPTIONS} active={scope} onChange={handleScope} />
      </PropRow>

      {wantsMask && state.status === "loading" && (
        <DetectionProgressCard progress={state.progress} warm={state.warm} />
      )}

      {wantsMask && state.status === "ready" && <DetectionReadyChip />}

      {wantsMask && state.status === "error" && (
        <DetectionErrorCard msg={state.error} onRetry={handleRetry} />
      )}
    </>
  );
}
