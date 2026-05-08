// MaskReadyPill.tsx — Tiny inline indicator that the on-device subject
// mask is already cached for the current image. Rendered alongside
// each smart-action button (Smart Crop, Smart Anonymize, Apply Remove
// BG, Smart Place) so the user can see "this tap is instant — no
// download or detection" without having to find out by tapping.
//
// Without the pill the editor reads as if every smart action could
// independently kick off a 30-second download, even when one panel
// already paid for the mask. The pill is a quiet reassurance — small
// enough to disappear when not relevant (renders nothing when the
// mask isn't ready), informative enough to nudge users toward
// chaining smart actions.

import { I } from "../../../components/icons";

interface Props {
  /** True when `subjectMask.peek()` returns a cut for the current
   *  source. Falsy → render nothing (the panel just shows its smart
   *  button without the badge). */
  ready: boolean;
  /** Alignment of the pill within its row. Most call sites want
   *  end-aligned so the badge sits next to the smart action label;
   *  `start` and `center` are exposed for layouts where the panel's
   *  smart button isn't right-aligned. */
  align?: "start" | "center" | "end";
}

export function MaskReadyPill({ ready, align = "end" }: Props) {
  if (!ready) return null;
  const justify =
    align === "start" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  return (
    <div className={`flex ${justify}`}>
      <span
        role="status"
        aria-label="Subject mask ready"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200"
      >
        <I.Check size={9} stroke={2.5} />
        Mask ready
      </span>
    </div>
  );
}
