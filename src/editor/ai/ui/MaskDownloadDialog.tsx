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
                ? "bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300"
                : "bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300"
            }`}
          >
            {error ? <I.ShieldCheck size={16} /> : <I.Sparkles size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="cloak-mask-download-title"
              className="text-[15px] font-semibold text-text dark:text-dark-text"
            >
              {error ? "Couldn't load the model" : "Setting up subject detection"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              {error
                ? "The on-device model didn't finish loading. This usually clears up by trying again — your image stayed on this device the whole time."
                : "The model downloads once and is cached for future visits. Your image stays on this device."}
            </p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
          >
            <I.ShieldCheck size={13} className="mt-px shrink-0" />
            <span className="min-w-0 flex-1 wrap-break-word">{error}</span>
          </div>
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
              <I.Sparkles size={13} /> Try again
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
