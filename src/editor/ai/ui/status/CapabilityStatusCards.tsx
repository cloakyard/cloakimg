// CapabilityStatusCards.tsx — Generic versions of the inline status
// atoms (progress card, ready chip, error card, paused chip, awaiting-
// consent chip) used across every AI-aware tool. Replaces the segment-
// specific DetectionStatus.tsx for new capabilities; the legacy mask
// surface keeps using DetectionStatus until that migration is done.
//
// The visual rhythm matches DetectionStatus 1:1 — same paddings,
// type scales, icon sizes, palette — so all AI surfaces continue to
// read as one coherent system regardless of capability.
//
// Type rhythm (kept aligned with the panel system):
//   • Card label / strong text:  text-[12px]    font-medium
//   • Mono % readout:            text-[12px]    t-mono
//   • Card body footnote:        text-[10.75px] muted
//   • Status chip body:          text-[11.5px]  font-medium
//   • Inline error body:         text-[11.5px]
//   • Icons pair 1:1 with the matching label size, with one extra
//     pixel of stroke breathing room when the icon sits in a circular
//     swatch.

import { I } from "../../../../components/icons";
import type { CapabilityProgress, StatusCopy } from "../../capability/types";

interface ProgressProps {
  progress: CapabilityProgress | null;
  /** True when the capability has produced a result earlier this session.
   *  Drives the cold-vs-warm copy on the byte readout. */
  warm: boolean;
  /** Per-capability copy supplied by the family. */
  copy: StatusCopy;
  /** Override the leading title in the card. Defaults to the lib's
   *  own progress label, falling back to `copy.inProgressLabel`. */
  fallbackLabel?: string;
  /** Expected total download bytes for the chosen tier. Used as the
   *  bytes-readout fallback when the actual `progress.bytesTotal`
   *  hasn't arrived yet — without this the dialog spends its first
   *  1–3 seconds (worker spawn + model fetch handshake) showing only
   *  "Preparing…" and a tiny stub bar, which reads as "nothing is
   *  happening". */
  expectedTotal?: number;
  /** When provided, renders a Cancel affordance that calls this on
   *  tap. Now that the AI worker can be terminated mid-inference, an
   *  honest cancel exists — passing `onCancel` opts the panel into
   *  surfacing it. Omit on surfaces where cancellation isn't safe. */
  onCancel?: () => void;
}

/** Shared download / inference progress card. Two phases:
 *    • Download — determinate bar driven by ratio + a real MB readout
 *      (e.g. "23 / 84 MB"). Visible once on first-ever AI use.
 *    • Inference — indeterminate sliding-stripe; the lib doesn't
 *      surface inference progress, so we show motion instead of a
 *      fake percentage.
 *
 *  Labels read from the family's status copy so the same card is
 *  honest whether triggered by Adjust scope, Portrait blur, Smart
 *  Crop, Auto-Anonymize, or Read text. */
export function CapabilityProgressCard({
  progress,
  warm,
  copy,
  fallbackLabel,
  expectedTotal,
  onCancel,
}: ProgressProps) {
  const isDownload = progress?.phase === "download";
  const isInference = progress?.phase === "inference" || progress?.phase === "decode";
  // "Indeterminate" = working but no bytes yet. Worker is spawning,
  // transformers.js is initialising, or the model fetch hasn't returned
  // its first chunk. Show the same sliding-stripe animation as
  // inference so the dialog never sits looking dead.
  const isIndeterminate = isDownload && !((progress?.bytesTotal ?? 0) > 0);
  const animateStripe = isInference || isIndeterminate;
  const downloadPct =
    isDownload && !isIndeterminate ? Math.round((progress?.ratio ?? 0) * 100) : null;
  const widthPct = animateStripe ? 100 : Math.max(2, Math.round((progress?.ratio ?? 0) * 100));
  const bytes = progress?.bytesDownloaded ?? 0;
  const total =
    progress?.bytesTotal && progress.bytesTotal > 0 ? progress.bytesTotal : (expectedTotal ?? 0);
  // The lib emits "Preparing model…" before any bytes arrive — that
  // copy reads as static. Swap to the family's `connectingLabel` while
  // indeterminate so the user sees motion-language matching the
  // animated stripe.
  const rawLabel = progress?.label ?? fallbackLabel ?? copy.inProgressLabel;
  const label =
    isIndeterminate && rawLabel === "Preparing model…" ? copy.connectingLabel : rawLabel;
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
        aria-valuenow={animateStripe ? undefined : (downloadPct ?? 0)}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full bg-coral-500 ${
            animateStripe ? "" : "transition-[width] duration-200"
          }`}
          style={{
            width: `${widthPct}%`,
            ...(animateStripe
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
        <div className="flex items-center justify-between gap-2 text-[10.75px] text-text-muted dark:text-dark-text-muted">
          <span className="t-mono">
            {formatMb(bytes)} / {formatMb(total)}
          </span>
          <span className="truncate">One-time · cached after</span>
        </div>
      )}
      {(warm || isInference) && (
        <div className="text-[10.75px] text-text-muted dark:text-dark-text-muted">
          Running on this device. The image never leaves your browser.
        </div>
      )}
      {isIndeterminate && !warm && total === 0 && (
        <div className="text-[10.75px] text-text-muted dark:text-dark-text-muted">
          Spinning up the on-device model. This is a one-time download — cached for next time.
        </div>
      )}
      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border-none bg-transparent p-0 font-[inherit] text-[11px] font-semibold text-coral-700 underline dark:text-coral-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

interface ReadyProps {
  /** Override the chip text. Defaults to the family's `readyMessage`. */
  message?: string;
  copy: StatusCopy;
}

/** Subtle confirmation chip — emerald to read as success without
 *  dominating the panel. */
export function CapabilityReadyChip({ message, copy }: ReadyProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-emerald-200/70 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200">
      <I.Sparkles
        size={12}
        stroke={2}
        className="shrink-0 text-emerald-600 dark:text-emerald-300"
      />
      <span className="min-w-0 flex-1">{message ?? copy.readyMessage}</span>
    </div>
  );
}

interface ErrorProps {
  msg: string | null;
  onRetry: () => void;
  /** Override the fallback "Couldn't run" copy when no msg is set. */
  fallbackMsg?: string;
}

/** Inline error with a Try Again affordance. */
export function CapabilityErrorCard({ msg, onRetry, fallbackMsg }: ErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
    >
      <I.ShieldCheck size={13} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="wrap-break-word">{msg ?? fallbackMsg ?? "Couldn't run."}</div>
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

interface PausedProps {
  /** Tap handler — clears the deny latch and re-fires the operation
   *  (which re-opens the consent dialog via the central host). */
  onResume: () => void;
  copy: StatusCopy;
}

/** Inline affordance shown when the user previously dismissed the
 *  consent dialog. Without this, denying leaves the panel in a stuck
 *  state — controls gated, no obvious way to opt back in. */
export function CapabilityPausedChip({ onResume, copy }: PausedProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-[11.5px] dark:border-dark-border-soft dark:bg-dark-page-bg"
    >
      <I.Sparkles size={12} className="shrink-0 text-coral-500 dark:text-coral-400" />
      <span className="min-w-0 flex-1 text-text-muted dark:text-dark-text-muted">
        {copy.pausedMessage}
      </span>
      <button
        type="button"
        onClick={onResume}
        className="cursor-pointer rounded border-none bg-transparent p-0 font-[inherit] text-[11.5px] font-semibold text-coral-700 underline dark:text-coral-300"
      >
        Enable AI
      </button>
    </div>
  );
}

/** Sits in for the progress card while the user has the consent
 *  dialog up. Reassures them the panel is waiting on their tap, not
 *  on a stuck download. */
export function CapabilityConsentChip() {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-[11.5px] font-medium text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted">
      <I.Sparkles size={12} className="shrink-0 text-coral-500 dark:text-coral-400" />
      <span className="min-w-0 flex-1">Approve the on-device model to continue.</span>
    </div>
  );
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}
