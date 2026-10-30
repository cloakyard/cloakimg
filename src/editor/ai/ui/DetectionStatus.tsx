// DetectionStatus.tsx — Shared visual atoms for the central
// subject-mask service's UX. Used by both `MaskScopeRow` (when the
// user picks a Subject / Background scope) and `RemoveBgPanel` (the
// dedicated Remove BG tool). Pulling them out into one file keeps the
// styling identical — same paddings, same font sizes, same icon
// proportions — so users see one consistent "AI detection" surface
// no matter which tool surfaced it.
//
// Type rhythm (kept consistent with the rest of the panel system):
//   • Card label / strong text:  text-[0.8125rem]    font-medium
//   • Mono % readout:            text-[0.8125rem]    tabular-nums
//   • Card body footnote:        text-[0.8125rem] muted
//   • Status chip body:          text-[0.8125rem]  font-medium
//   • Inline error body:         text-[0.8125rem]
//   • Icons pair 1:1 with the matching label size, with one extra
//     pixel of stroke breathing room when the icon sits in a circular
//     swatch.

import { I } from "../../../components/icons";
import type { SmartRemoveProgress } from "../runtime/segment";

interface ProgressProps {
  progress: SmartRemoveProgress | null;
  /** True when a detection has completed earlier in this session.
   *  Drives the cold-vs-warm copy on the byte readout. */
  warm: boolean;
  /** Override the leading title in the card. Defaults to the lib's
   *  own progress label, falling back to "Detecting subject…". */
  fallbackLabel?: string;
  /** Expected total download bytes for the chosen quality tier.
   *  Used as a fallback for the bytes readout when the actual
   *  `progress.bytesTotal` hasn't arrived yet — without this the
   *  modal spends its first 1–3 seconds (worker spawn + model
   *  fetch handshake) showing only "Preparing…" and a tiny stub bar,
   *  which reads as "nothing is happening". */
  expectedTotal?: number;
  /** When provided, renders a Cancel affordance that calls this on
   *  tap. Now that the AI worker can be terminated mid-inference, an
   *  honest cancel exists — passing `onCancel` opts the panel into
   *  surfacing it. Omit on surfaces where cancellation isn't safe
   *  (no current callers, but the flexibility avoids forcing every
   *  consumer to handle it). */
  onCancel?: () => void;
}

/** Shared download / inference progress card. Two phases:
 *    • Download — determinate bar driven by ratio + a real MB readout
 *      (e.g. "23 / 84 MB"). Visible once on first-ever AI use.
 *    • Inference — indeterminate sliding-stripe; the lib doesn't
 *      surface inference progress, so we show motion instead of a
 *      fake percentage.
 *
 *  Labels read generically — "Detecting subject…" — so the same card
 *  is honest whether triggered by Adjust scope, Portrait blur, Smart
 *  Crop, or Remove BG itself. */
export function DetectionProgressCard({
  progress,
  warm,
  fallbackLabel,
  expectedTotal,
  onCancel,
}: ProgressProps) {
  const isDownload = progress?.phase === "download";
  const isInference = progress?.phase === "inference" || progress?.phase === "decode";
  // "Indeterminate" means we know we're working but have no bytes
  // yet — worker is spawning, transformers.js is initialising, or
  // the model fetch hasn't returned its first chunk. Show the same
  // sliding-stripe animation as inference so the modal never sits
  // looking dead.
  const isIndeterminate = isDownload && !((progress?.bytesTotal ?? 0) > 0);
  const indeterminate = isInference || isIndeterminate;
  const downloadPct =
    isDownload && !isIndeterminate ? Math.round((progress?.ratio ?? 0) * 100) : null;
  const widthPct = indeterminate ? 33 : Math.max(2, Math.round((progress?.ratio ?? 0) * 100));
  const bytes = progress?.bytesDownloaded ?? 0;
  // Prefer the live `bytesTotal` once the lib reports it, otherwise
  // fall back to the caller's pre-flight estimate so the user sees
  // "0.0 MB / 84 MB" right away instead of a blank line.
  const total =
    progress?.bytesTotal && progress.bytesTotal > 0 ? progress.bytesTotal : (expectedTotal ?? 0);
  // The lib emits "Preparing model…" before any bytes arrive — that
  // copy reads as static. Swap to "Connecting…" while indeterminate
  // so the user sees motion-language matching the animated stripe.
  const rawLabel = progress?.label ?? fallbackLabel ?? "Detecting subject…";
  const label = isIndeterminate && rawLabel === "Preparing model…" ? "Connecting…" : rawLabel;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[0.8125rem] font-medium text-text">
        <span className="flex min-w-0 items-center gap-1.5">
          <I.Sparkles size={12} className="shrink-0 text-text" />
          <span className="truncate">{label}</span>
        </span>
        {downloadPct !== null && (
          <span className="tabular-nums shrink-0 text-[0.8125rem] text-text">{downloadPct}%</span>
        )}
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : (downloadPct ?? 0)}
        aria-label={label}
      >
        <div
          className="h-full origin-left rounded-full bg-accent"
          style={{
            width: "100%",
            transform: `scaleX(${widthPct / 100})`,
          }}
        />
      </div>
      {!warm && total > 0 && !isInference && (
        <div className="flex items-center justify-between gap-2 text-[0.8125rem] text-text-muted">
          <span className="tabular-nums">
            {formatMb(bytes)} / {formatMb(total)}
          </span>
          <span className="truncate">One-time · cached after</span>
        </div>
      )}
      {(warm || isInference) && (
        <div className="text-[0.8125rem] text-text-muted">
          Running on this device. The image never leaves your browser.
        </div>
      )}
      {/* Reassurance line when we're indeterminate AND don't already
          have a privacy / bytes line — without it the modal had a
          single muted bar and nothing else, which is what the user
          flagged as "nothing happens". */}
      {isIndeterminate && !warm && total === 0 && (
        <div className="text-[0.8125rem] text-text-muted">
          Spinning up the on-device model. This is a one-time download — cached for next time.
        </div>
      )}
      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border-none bg-transparent p-0 font-[inherit] text-[0.8125rem] font-medium text-text underline"
          >
            Cancel
          </button>
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
    <div className="flex items-center gap-1.5 rounded-md border border-[var(--air-success)] bg-[var(--air-success-soft)] px-2.5 py-1.5 text-[0.8125rem] font-medium text-success">
      <I.Sparkles size={12} stroke={2} className="shrink-0 text-success" />
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

/** Inline error with a Try Again affordance and Air error tokens. */
export function DetectionErrorCard({ msg, onRetry }: ErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger bg-[var(--air-danger-soft)] px-2.5 py-2 text-[0.8125rem] text-text"
    >
      <I.ShieldCheck size={13} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="wrap-break-word">{msg ?? "Couldn't detect subject."}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 cursor-pointer rounded border-none bg-transparent p-0 text-[0.8125rem] font-medium underline"
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

interface PausedProps {
  /** Tap handler — clears the deny latch and re-fires detection (which
   *  re-opens the consent modal via the central host). */
  onResume: () => void;
}

/** Inline affordance shown when the user previously dismissed the
 *  consent modal. Without this, denying leaves the panel in a stuck
 *  state — controls gated, no obvious way to opt back in. */
export function DetectionPausedChip({ onResume }: PausedProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-[0.8125rem]"
    >
      <I.Sparkles size={12} className="shrink-0 text-text" />
      <span className="min-w-0 flex-1 text-text-muted">Detection paused.</span>
      <button
        type="button"
        onClick={onResume}
        className="cursor-pointer rounded border-none bg-transparent p-0 font-[inherit] text-[0.8125rem] font-medium text-text underline"
      >
        Enable AI
      </button>
    </div>
  );
}
