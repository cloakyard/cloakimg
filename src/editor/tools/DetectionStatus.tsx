// DetectionStatus.tsx — Shared visual atoms for the central
// subject-mask service's UX. Used by both `MaskScopeRow` (when the
// user picks a Subject / Background scope) and `RemoveBgPanel` (the
// dedicated Remove BG tool). Pulling them out into one file keeps the
// styling identical — same paddings, same font sizes, same icon
// proportions — so users see one consistent "AI detection" surface
// no matter which tool surfaced it.
//
// Type rhythm (kept consistent with the rest of the panel system):
//   • Card label / strong text:  text-[12px]    font-medium
//   • Mono % readout:            text-[12px]    t-mono
//   • Card body footnote:        text-[10.75px] muted
//   • Status chip body:          text-[11.5px]  font-medium
//   • Inline error body:         text-[11.5px]
//   • Icons pair 1:1 with the matching label size, with one extra
//     pixel of stroke breathing room when the icon sits in a circular
//     swatch.

import { I } from "../../components/icons";
import type { SmartRemoveProgress } from "./smartRemoveBg";

interface ProgressProps {
  progress: SmartRemoveProgress | null;
  /** True when a detection has completed earlier in this session.
   *  Drives the cold-vs-warm copy on the byte readout. */
  warm: boolean;
  /** Override the leading title in the card. Defaults to the lib's
   *  own progress label, falling back to "Detecting subject…". */
  fallbackLabel?: string;
}

/** Shared download / inference progress card. Two phases:
 *    • Download — determinate bar driven by ratio + a real MB readout
 *      (e.g. "23 / 44 MB"). Visible once on first-ever AI use.
 *    • Inference — indeterminate sliding-stripe; the lib doesn't
 *      surface inference progress, so we show motion instead of a
 *      fake percentage.
 *
 *  Labels read generically — "Detecting subject…" — so the same card
 *  is honest whether triggered by Adjust scope, Portrait blur, Smart
 *  Crop, or Remove BG itself. */
export function DetectionProgressCard({ progress, warm, fallbackLabel }: ProgressProps) {
  const isDownload = progress?.phase === "download";
  const isInference = progress?.phase === "inference" || progress?.phase === "decode";
  const downloadPct = isDownload ? Math.round((progress?.ratio ?? 0) * 100) : null;
  const widthPct = isInference ? 100 : Math.max(2, Math.round((progress?.ratio ?? 0) * 100));
  const bytes = progress?.bytesDownloaded ?? 0;
  const total = progress?.bytesTotal ?? 0;
  const label = progress?.label ?? fallbackLabel ?? "Detecting subject…";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-3 py-2.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-text dark:text-dark-text">
        <span className="flex min-w-0 items-center gap-1.5">
          <I.Sparkles size={12} className="shrink-0 text-coral-500 dark:text-coral-400" />
          <span className="truncate">{label}</span>
        </span>
        {downloadPct !== null && (
          <span className="t-mono shrink-0 text-[12px] text-coral-700 dark:text-coral-300">
            {downloadPct}%
          </span>
        )}
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface dark:bg-dark-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isInference ? undefined : (downloadPct ?? 0)}
        aria-label={label}
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
        <div className="flex items-center justify-between text-[10.75px] text-text-muted dark:text-dark-text-muted">
          <span className="t-mono">
            {formatMb(bytes)} / {formatMb(total)}
          </span>
          <span>One-time · cached after</span>
        </div>
      )}
      {(warm || isInference) && (
        <div className="text-[10.75px] text-text-muted dark:text-dark-text-muted">
          Running on this device. The image never leaves your browser.
        </div>
      )}
    </div>
  );
}

interface ReadyProps {
  /** Override the chip text. Defaults to a generic "subject detected"
   *  message; tools with a more specific affordance can supply their
   *  own (e.g. RemoveBg might say "Subject ready to remove"). */
  message?: string;
}

/** Subtle confirmation chip — emerald to read as success without
 *  dominating the panel. Same body type as the inline help text below
 *  the panel so the visual weight stays uniform. */
export function DetectionReadyChip({ message }: ReadyProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-emerald-200/70 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200">
      <I.Sparkles
        size={12}
        stroke={2}
        className="shrink-0 text-emerald-600 dark:text-emerald-300"
      />
      <span className="min-w-0 flex-1">
        {message ?? "Subject detected — every scoped tool now applies instantly."}
      </span>
    </div>
  );
}

interface ErrorProps {
  msg: string | null;
  onRetry: () => void;
}

/** Inline error with a Try Again affordance. Coral palette to mirror
 *  the editor's existing alert styling. */
export function DetectionErrorCard({ msg, onRetry }: ErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
    >
      <I.ShieldCheck size={13} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="wrap-break-word">{msg ?? "Couldn't detect subject."}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 cursor-pointer rounded border-none bg-transparent p-0 text-[11.5px] font-semibold underline"
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
