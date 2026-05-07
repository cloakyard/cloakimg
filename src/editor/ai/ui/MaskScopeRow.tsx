// MaskScopeRow.tsx — Shared "Apply to: Whole / Subject / Background"
// segmented control. Drop this into any per-pixel tool (Adjust,
// Filter, Levels, HSL) to give the user mask-aware editing without
// any extra thinking — the moment they pick Subject or Background,
// the central subject-mask service kicks off detection if it hasn't
// already, shows progress inline, and the tool's bake quietly starts
// scoping its output. Once detected, every other tool's scope toggle
// is instant.
//
// Visual states (top → bottom):
//   • Idle, scope = Whole — just the segmented control.
//   • Idle, scope ≠ Whole, mask not yet ready — auto-triggers
//     detection on mount; shows the inline progress card.
//   • Loading — DetectionProgressCard with download or inference state.
//   • Ready — DetectionReadyChip.
//   • Needs consent — DetectionConsentChip while the host dialog is up.
//   • Error — DetectionErrorCard with a Try Again button.
//
// All sub-states render the *exact* same components Remove BG uses
// (`./DetectionStatus`), so the visual rhythm is uniform across every
// subject-aware tool.

import { useCallback, useEffect } from "react";
import { I } from "../../../components/icons";
import { PropRow, Segment } from "../../atoms";
import { useSubjectMask } from "../useSubjectMask";
import {
  DetectionErrorCard,
  DetectionPausedChip,
  DetectionProgressCard,
  DetectionReadyChip,
} from "./DetectionStatus";

const SCOPE_OPTIONS = ["Whole", "Subject", "Background"] as const;

interface Props {
  scope: number;
  onScope: (i: number) => void;
  /** Override the section label. Defaults to "Apply to". */
  label?: string;
}

export function MaskScopeRow({ scope, onScope, label = "Apply to" }: Props) {
  const { state, request, resumeAfterDeny } = useSubjectMask();
  const wantsMask = scope !== 0;

  // Auto-trigger detection the moment the user picks a scoped option
  // and the mask isn't ready. We don't trigger if status is already
  // "loading", "error" or "needs-consent" (avoid hammering retries;
  // the error card owns the retry button, the consent dialog owns the
  // accept tap), and we don't trigger when the user has explicitly
  // denied — re-firing then would just re-pop the dialog, defeating
  // the dismiss. The DetectionPausedChip surfaces the explicit
  // re-opt-in path. The request itself may still bounce off the
  // consent gate (MaskConsentError) — the host dialog renders via
  // state, not via this throw.
  useEffect(() => {
    if (!wantsMask) return;
    if (state.userDenied) return;
    if (
      state.status === "ready" ||
      state.status === "loading" ||
      state.status === "error" ||
      state.status === "needs-consent"
    )
      return;
    void request().catch(() => {
      // Either a real detection error (surfaces via DetectionErrorCard
      // through state.error) or a consent bounce (handled by the host
      // dialog through state.status === "needs-consent"). Either way
      // the user is told via state, not an exception.
    });
  }, [request, state.status, state.userDenied, wantsMask]);

  const handleScope = useCallback(
    (i: number) => {
      onScope(i);
      // Picking a non-Whole scope is an explicit "I want the AI"
      // signal. If the user previously dismissed the consent dialog
      // (state.userDenied), kick off the resume flow so the dialog
      // re-opens instead of the panel staying paused forever.
      // resumeAfterDeny clears the latch and fires detection — same
      // path as the "Enable AI" chip, keeping both re-opt-in surfaces
      // aligned. No-op when scope is Whole or no deny is pending.
      if (i !== 0 && state.userDenied) {
        void resumeAfterDeny();
      }
    },
    [onScope, resumeAfterDeny, state.userDenied],
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

      {wantsMask && state.status === "needs-consent" && <DetectionConsentChip />}

      {wantsMask && state.status === "idle" && state.userDenied && (
        <DetectionPausedChip onResume={() => void resumeAfterDeny()} />
      )}

      {wantsMask && state.status === "error" && (
        <DetectionErrorCard msg={state.error} onRetry={handleRetry} />
      )}
    </>
  );
}

/** Sits in for the progress card while the user has the consent
 *  dialog up. Reassures them the panel is waiting on their tap, not
 *  on a stuck download. */
function DetectionConsentChip() {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted">
      <I.Sparkles size={12} className="shrink-0 text-coral-500 dark:text-coral-400" />
      <span className="min-w-0 flex-1">Approve the on-device model to continue.</span>
    </div>
  );
}
