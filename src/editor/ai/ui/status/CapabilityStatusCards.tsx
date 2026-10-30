// Shared progress and retry surfaces for AI capabilities.
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
   *  hasn't arrived yet — without this the modal spends its first
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
 *  Crop, or Auto-Anonymize. */
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
  // inference so the modal never sits looking dead.
  const isIndeterminate = isDownload && !((progress?.bytesTotal ?? 0) > 0);
  const indeterminate = isInference || isIndeterminate;
  const downloadPct =
    isDownload && !isIndeterminate ? Math.round((progress?.ratio ?? 0) * 100) : null;
  const widthPct = indeterminate ? 33 : Math.max(2, Math.round((progress?.ratio ?? 0) * 100));
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
      className="flex items-start gap-2 rounded-lg border border-accent bg-surface-soft px-2.5 py-2 text-[0.8125rem] text-text"
    >
      <I.ShieldCheck size={13} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="wrap-break-word">{msg ?? fallbackMsg ?? "Couldn't run."}</div>
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
