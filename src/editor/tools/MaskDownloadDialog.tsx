// MaskDownloadDialog.tsx — Progress modal shown after the user
// accepts the consent dialog's "Download" tap. Stays on-screen for
// the duration of the model fetch + initial inference so the user
// has visible confirmation that work is happening on their behalf.
// Auto-closes when detection settles (ready / error) — the host
// handles the lifecycle.
//
// Two ways out:
//   • "Continue in background" hides the modal but lets detection
//     finish; the cached cut becomes available to the next tool that
//     asks for it. Same UX we shipped under imgly.
//   • "Cancel" terminates the AI worker outright. The transformers.js
//     + ONNX migration gave us an honest cancel — we surface it here
//     so a user who taps Download by accident isn't stuck waiting
//     for a 176 MB fetch they don't actually want.

import { I } from "../../components/icons";
import { ModalFrame } from "../../components/ModalFrame";
import { useEditorReadOnly } from "../EditorContext";
import { DetectionProgressCard } from "./DetectionStatus";
import type { SmartRemoveProgress } from "./ai/segment";

interface Props {
  progress: SmartRemoveProgress | null;
  warm: boolean;
  /** "Continue in background" — hide the modal, let detection finish. */
  onDismiss: () => void;
  /** "Cancel" — terminate the worker and reset state to idle. */
  onCancel: () => void;
}

export function MaskDownloadDialog({ progress, warm, onDismiss, onCancel }: Props) {
  const { layout } = useEditorReadOnly();
  const isMobile = layout === "mobile";

  return (
    <ModalFrame
      onClose={onDismiss}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-100"
      labelledBy="cloak-mask-download-title"
    >
      <div className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300">
            <I.Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="cloak-mask-download-title"
              className="text-[15px] font-semibold text-text dark:text-dark-text"
            >
              Setting up subject detection
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              The model downloads once and is cached for future visits. Your image stays on this
              device.
            </p>
          </div>
        </div>

        <DetectionProgressCard progress={progress} warm={warm} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border-soft px-5 pt-3 pb-5 sm:px-6 dark:border-dark-border-soft">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Continue in background
        </button>
      </div>
    </ModalFrame>
  );
}
