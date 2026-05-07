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
//     for a 176 MB fetch they don't actually want.
//   • "Try again" only appears when detection has settled into an
//     error state. Re-runs the detection at the same quality.

import { I } from "../../../components/icons";
import { ModalFrame } from "../../../components/ModalFrame";
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

  return (
    <ModalFrame
      onClose={error ? onCancel : onDismiss}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-100"
      labelledBy="cloak-mask-download-title"
    >
      <div className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              error
                ? "bg-coral-500/15 text-coral-600 dark:bg-coral-400/15 dark:text-coral-300"
                : "bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300"
            }`}
          >
            {error ? <I.Triangle size={16} stroke={2} /> : <I.Sparkles size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="cloak-mask-download-title"
              className="text-[15px] font-semibold text-text dark:text-dark-text"
            >
              {error ? errorTitle(errorKind) : "Setting up subject detection"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              {error
                ? errorBody(errorKind)
                : "The model downloads once and is cached for future visits. Your image stays on this device."}
            </p>
          </div>
        </div>

        {error ? (
          <ErrorBody message={error} suggestion={errorSuggestion(errorKind)} />
        ) : (
          <DetectionProgressCard progress={progress} warm={warm} expectedTotal={expectedTotal} />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border-soft px-5 pt-3 pb-5 sm:px-6 dark:border-dark-border-soft">
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

type ErrorKind = "network" | "memory" | "module" | "wasm" | "timeout" | "generic";

/** Pattern-match the (already-friendly) error message back to a
 *  category so the dialog title + body can adapt. The worker's
 *  friendlyErrorMessage produces the same canonical strings, so we
 *  can match deterministically rather than re-reading the raw error.
 *  Falls back to "generic" so a new error class never breaks the UI. */
function classifyError(msg: string): ErrorKind {
  const lower = msg.toLowerCase();
  if (lower.includes("connection") || lower.includes("server")) return "network";
  if (lower.includes("memory")) return "memory";
  if (lower.includes("module failed") || lower.includes("didn't finish loading")) return "module";
  if (lower.includes("runtime didn't compile") || lower.includes("webassembly")) return "wasm";
  if (lower.includes("timeout") || lower.includes("didn't respond")) return "timeout";
  return "generic";
}

function errorTitle(kind: ErrorKind | null): string {
  switch (kind) {
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
    case "memory":
      return "Tip: switch to the Fast (~44 MB) tier from Change, or use the Chroma keyer (Mode → Chroma in Remove BG) — it's instant on flat studio backgrounds.";
    case "network":
      return "Tip: once cached, the model runs offline. Re-trying on a stable connection downloads it once.";
    case "module":
    case "wasm":
      return "Tip: CloakIMG needs WebAssembly. Recent Chrome / Safari / Firefox all support it.";
    case "timeout":
      return "Tip: a smaller tier (Fast ~44 MB) downloads in a fraction of the time on slow connections.";
    default:
      return null;
  }
}
