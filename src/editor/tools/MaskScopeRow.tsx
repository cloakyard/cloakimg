// MaskScopeRow.tsx — Shared "Apply to: Whole / Subject / Background"
// segmented control. Drop this into any per-pixel tool (Adjust,
// Filter, Levels, HSL) to give the user mask-aware editing without
// any extra thinking — the moment they pick Subject or Background,
// the central subject-mask service kicks off detection if it hasn't
// already, shows progress inline, and the tool's bake quietly starts
// scoping its output. Once detected, every other tool's scope toggle
// is instant.
//
// Visual states (top→bottom):
//   • Idle, scope = Whole — just the segmented control.
//   • Idle, scope ≠ Whole, mask not yet ready — auto-triggers
//     detection on mount; shows the inline progress card.
//   • Loading — progress card with download or inference state.
//   • Ready — small "Subject detected" chip with sparkles icon.
//   • Error — coral message + retry button.
//
// Layout is identical across desktop / tablet / mobile — the segment
// uses Tailwind's pointer-coarse: variants for touch targets, and
// the progress card is a plain rounded div that flows naturally.

import { useCallback, useEffect } from "react";
import { I } from "../../components/icons";
import { PropRow, Segment } from "../atoms";
import type { SmartRemoveProgress } from "./smartRemoveBg";
import { useSubjectMask } from "../useSubjectMask";

const SCOPE_OPTIONS = ["Whole", "Subject", "Background"] as const;

interface Props {
  scope: number;
  onScope: (i: number) => void;
  /** Override the section label. Defaults to "Apply to". */
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
      // Errors surface via state.error → DetectionError card.
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
        <DetectionProgress progress={state.progress} warm={state.warm} />
      )}

      {wantsMask && state.status === "ready" && <DetectionReady />}

      {wantsMask && state.status === "error" && (
        <DetectionError msg={state.error} onRetry={handleRetry} />
      )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function DetectionProgress({
  progress,
  warm,
}: {
  progress: SmartRemoveProgress | null;
  warm: boolean;
}) {
  const isDownload = progress?.phase === "download";
  const isInference = progress?.phase === "inference" || progress?.phase === "decode";
  const downloadPct = isDownload ? Math.round((progress?.ratio ?? 0) * 100) : null;
  const widthPct = isInference ? 100 : Math.max(2, Math.round((progress?.ratio ?? 0) * 100));
  const bytes = progress?.bytesDownloaded ?? 0;
  const total = progress?.bytesTotal ?? 0;
  // First-time download ("cold"): lead with byte counts so the user
  // sees the scale of the wait. Warm runs (model already cached):
  // lead with the lib's own progress label, no MB readout.
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-3 py-2.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-text dark:text-dark-text">
        <span className="flex items-center gap-1.5">
          <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
          {progress?.label ?? "Detecting subject…"}
        </span>
        {downloadPct !== null && (
          <span className="t-mono text-coral-700 dark:text-coral-300">{downloadPct}%</span>
        )}
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface dark:bg-dark-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isInference ? undefined : (downloadPct ?? 0)}
        aria-label={progress?.label ?? "Detecting subject"}
      >
        <div
          className={`h-full rounded-full bg-coral-500 ${
            isInference ? "" : "transition-[width] duration-200"
          }`}
          style={{
            width: `${widthPct}%`,
            ...(isInference
              ? {
                  backgroundImage:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                  backgroundSize: "40% 100%",
                  backgroundRepeat: "no-repeat",
                  animation: "ci-bg-shimmer 1.4s linear infinite",
                }
              : {}),
          }}
        />
      </div>
      {!warm && total > 0 && !isInference && (
        <div className="flex items-center justify-between text-[10.5px] text-text-muted dark:text-dark-text-muted">
          <span className="t-mono">
            {formatMb(bytes)} / {formatMb(total)}
          </span>
          <span>One-time · cached after</span>
        </div>
      )}
      {(warm || isInference) && (
        <div className="text-[10.5px] text-text-muted dark:text-dark-text-muted">
          Running on this device. The image never leaves your browser.
        </div>
      )}
    </div>
  );
}

function DetectionReady() {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[10.5px] font-medium text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
      <I.Sparkles size={11} className="text-emerald-600 dark:text-emerald-300" />
      Subject detected — every scoped tool now applies instantly.
    </div>
  );
}

function DetectionError({ msg, onRetry }: { msg: string | null; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
    >
      <I.ShieldCheck size={12} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="wrap-break-word">{msg ?? "Couldn't detect subject."}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 cursor-pointer rounded border-none bg-transparent p-0 text-[11px] font-semibold underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}
