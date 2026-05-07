// MaskDownloadDialog.tsx — Progress modal shown after the user
// accepts the consent dialog's "Download" tap. Stays on-screen for
// the duration of the model fetch + initial inference so the user
// has visible confirmation that work is happening on their behalf.
// Auto-closes when detection settles to "ready" — failures stay
// pinned with an inline error + Try again so the dialog doesn't
// silently vanish on a worker crash or network drop.
//
// Three ways out:
//   • "Continue in background" hides the modal but lets detection
//     finish; the cached cut becomes available to the next tool that
//     asks for it.
//   • "Cancel" terminates the AI worker outright. The transformers.js
//     + ONNX migration gave us an honest cancel — we surface it here
//     so a user who taps Download by accident isn't stuck waiting
//     for the model fetch they don't actually want.
//   • "Try again" only appears when detection has settled into an
//     error state. Re-runs the detection at the same quality.

import { I } from "../../../components/icons";
import { ModalCloseButton, ModalFrame } from "../../../components/ModalFrame";
import { useEditorReadOnly } from "../../EditorContext";
import type { SmartRemoveProgress } from "../runtime/segment";
import { DetectionProgressCard } from "./DetectionStatus";

interface Props {
  progress: SmartRemoveProgress | null;
  warm: boolean;
  /** Pre-flight estimate of the model's bytes for the chosen tier.
   *  Forwarded to DetectionProgressCard so the bytes readout shows
   *  immediately instead of waiting for the lib's first chunk. */
  expectedTotal?: number;
  /** Detection error string when the worker / model fetch failed.
   *  When set, the body swaps from progress to an error explainer. */
  error: string | null;
  /** "Continue in background" — hide the modal, let detection finish. */
  onDismiss: () => void;
  /** "Cancel" — terminate the worker and reset state to idle. */
  onCancel: () => void;
  /** "Try again" — re-run detection with the same quality. */
  onRetry: () => void;
}

export function MaskDownloadDialog({
  progress,
  warm,
  expectedTotal,
  error,
  onDismiss,
  onCancel,
  onRetry,
}: Props) {
  const { layout } = useEditorReadOnly();
  const isMobile = layout === "mobile";

  // Classify the error so the body copy can suggest the right next
  // step. The actual user-facing message is already friendly (the
  // worker maps low-level errors to actionable text in
  // friendlyErrorMessage); this classifier only decides which
  // *suggestion paragraph* to show below the message — e.g. "use the
  // Chroma keyer" for memory issues, or "check connection" for
  // network failures.
  const errorKind = error ? classifyError(error) : null;

  // Single close handler for the X / backdrop. Errors send to onCancel
  // (terminate the worker so a stale broken pipeline isn't reused);
  // active downloads send to onDismiss (let the detection finish in
  // the background — the cached cut becomes available to the next
  // tool that asks for it).
  const onClose = error ? onCancel : onDismiss;

  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-130"
      labelledBy="cloak-mask-download-title"
    >
      {/* Sticky header — same icon-+-title-+-close-X pattern as
          ConfirmDialog, FilePropertiesModal, and the consent dialog.
          The icon swatch swaps from Sparkles (active download) to a
          coral Triangle (error) so the visual state is clear at a
          glance, and the subtitle moved into the body so the header
          stays a single fixed-height row. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
              error
                ? "bg-coral-500/15 text-coral-600 dark:bg-coral-400/15 dark:text-coral-300"
                : "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
            }`}
          >
            {error ? <I.Triangle size={16} stroke={2} /> : <I.Sparkles size={16} />}
          </div>
          <div id="cloak-mask-download-title" className="t-headline truncate text-base">
            {error ? errorTitle(errorKind) : "Setting up subject detection"}
          </div>
        </div>
        <ModalCloseButton onClose={onClose} iconSize={14} />
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          {error
            ? errorBody(errorKind)
            : "The model downloads once and is cached for future visits. Your image stays on this device."}
        </p>
        {error ? (
          <ErrorBody message={error} suggestion={errorSuggestion(errorKind)} />
        ) : (
          <DetectionProgressCard progress={progress} warm={warm} expectedTotal={expectedTotal} />
        )}
      </div>

      {/* Sticky footer — bordered top + safe-area padding on mobile,
          matching ConfirmDialog. The action set differs by state but
          the row layout / button sizes / spacing are identical so
          the modal feels like a single component animating between
          download → error states, not two different dialogs. */}
      <div
        className={`flex shrink-0 items-center justify-end gap-2 border-t border-border-soft dark:border-dark-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        {error ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Close
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
              <I.Refresh size={13} /> Try again
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
              Continue in background
            </button>
          </>
        )}
      </div>
    </ModalFrame>
  );
}

/** Two-block error body — the literal message in mono so it's
 *  copy-pasteable, then a subtler suggestion paragraph. Mobile
 *  benefits from this split because the small chip we previously
 *  showed read as a generic "something broke" prompt; the title +
 *  suggestion + raw-message rhythm gives the user something to
 *  actually act on. */
function ErrorBody({ message, suggestion }: { message: string; suggestion: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-3 py-2.5 text-[12px] leading-relaxed text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-100"
      >
        <I.Triangle size={13} stroke={2.25} className="mt-px shrink-0" />
        <span className="min-w-0 flex-1 wrap-break-word">{message}</span>
      </div>
      {suggestion && (
        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          {suggestion}
        </div>
      )}
    </div>
  );
}

type ErrorKind =
  | "network"
  | "memory"
  | "module"
  | "wasm"
  | "timeout"
  | "stalled"
  | "interrupted"
  | "quota"
  | "generic";

/** Pattern-match the (already-friendly) error message back to a
 *  category so the dialog title + body can adapt. The worker's
 *  friendlyErrorMessage produces the same canonical strings, so we
 *  can match deterministically rather than re-reading the raw error.
 *  Falls back to "generic" so a new error class never breaks the UI. */
function classifyError(msg: string): ErrorKind {
  const lower = msg.toLowerCase();
  // Stall watchdog (set inside subjectMask.ts) — match before
  // "network" because the message includes "slow connection".
  if (lower.includes("download stalled") || lower.includes("stalled")) return "stalled";
  // Browser-initiated abort (tab suspended, OS killed the fetch).
  // Match before "network" because the friendly text says "interrupted".
  if (lower.includes("interrupted") || lower.includes("long pause")) return "interrupted";
  // Storage quota exhausted — different remediation from OOM.
  if (lower.includes("storage is full") || lower.includes("quota")) return "quota";
  if (lower.includes("connection") || lower.includes("server")) return "network";
  if (lower.includes("memory")) return "memory";
  if (lower.includes("module failed") || lower.includes("didn't finish loading")) return "module";
  if (lower.includes("runtime didn't compile") || lower.includes("webassembly")) return "wasm";
  if (lower.includes("timeout") || lower.includes("didn't respond")) return "timeout";
  return "generic";
}

function errorTitle(kind: ErrorKind | null): string {
  switch (kind) {
    case "stalled":
      return "Download stalled";
    case "interrupted":
      return "Download was interrupted";
    case "quota":
      return "Browser storage is full";
    case "network":
      return "Couldn't reach the model server";
    case "memory":
      return "Not enough memory to load the model";
    case "module":
    case "wasm":
      return "AI runtime didn't start";
    case "timeout":
      return "Model loading timed out";
    default:
      return "Couldn't load the model";
  }
}

function errorBody(kind: ErrorKind | null): string {
  switch (kind) {
    case "stalled":
      return "The download stopped making progress. Usually a flaky connection — Try again resumes from where it left off, or pick a smaller tier from Change.";
    case "interrupted":
      return "The browser cancelled the download — typically after a long background pause on mobile. Try again to resume.";
    case "quota":
      return "There's not enough space in browser storage to cache the model. Free up space in your browser settings, or use a private tab to try without caching.";
    case "network":
      return "The model bytes never arrived. Check your network and try again — your image stayed on this device the whole time.";
    case "memory":
      return "This device couldn't fit the chosen model. Try a smaller tier, or use the Chroma keyer for flat backgrounds.";
    case "module":
    case "wasm":
      return "The on-device model runtime failed to start in this browser. Reloading the page usually fixes it.";
    case "timeout":
      return "The model didn't finish loading in time. This is usually a slow connection — try again, or pick a smaller tier.";
    default:
      return "The on-device model didn't finish loading. Trying again usually clears it up — your image stayed on this device.";
  }
}

function errorSuggestion(kind: ErrorKind | null): string | null {
  switch (kind) {
    case "stalled":
    case "timeout":
      return "Tip: a smaller tier (Fast ~6 MB) downloads in a fraction of the time on slow connections.";
    case "interrupted":
      return "Tip: keep CloakIMG in the foreground while the model downloads — mobile browsers pause background tabs aggressively.";
    case "quota":
      return "Tip: clear cached site data for sites you don't actively use. CloakIMG itself only caches the model on first use.";
    case "memory":
      return "Tip: switch to the Fast (~6 MB) tier from Change, or use the Chroma keyer (Mode → Chroma in Remove BG) — it's instant on flat studio backgrounds.";
    case "network":
      return "Tip: once cached, the model runs offline. Re-trying on a stable connection downloads it once.";
    case "module":
    case "wasm":
      return "Tip: CloakIMG needs WebAssembly. Recent Chrome / Safari / Firefox all support it.";
    default:
      return null;
  }
}
