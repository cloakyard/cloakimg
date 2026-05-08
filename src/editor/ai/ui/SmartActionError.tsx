// SmartActionError.tsx — Inline error chip shared by every smart-action
// tool (Smart Crop, Smart Anonymize, Smart Place, Apply Remove BG).
//
// Before this lived together: Crop / Redact / Watermark each rendered
// a coral div with no `role`, no icon, and no dismiss; only RemoveBg
// shipped the richer pattern with an `alert` role and an X button. A
// user who hit a detection failure couldn't predict which panel would
// surface it which way. Centralising here unifies:
//   • role="alert" so screen readers announce on appearance.
//   • Triangle icon — same glyph as MaskDownloadDialog's error block,
//     so the visual language carries across surfaces.
//   • Optional dismiss X — accepted via `onDismiss` prop; omitted when
//     the panel doesn't need a manual clear (e.g. Crop, where the next
//     tap re-runs Smart Crop and the chip auto-clears).
//
// The chip handles its own a11y; callers just need to pass `message`
// (truthy → render) and optionally an `onDismiss` callback.

import { I } from "../../../components/icons";

interface Props {
  /** Error text. Truthy → render; falsy → render nothing. */
  message: string | null;
  /** When provided, renders a dismiss X button that clears the error.
   *  Panels that auto-clear on the next user action can omit this. */
  onDismiss?: () => void;
}

export function SmartActionError({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
    >
      <I.Triangle size={12} stroke={2.25} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 wrap-break-word">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="-mr-0.5 -mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-60 hover:opacity-100"
        >
          <I.X size={10} />
        </button>
      )}
    </div>
  );
}
