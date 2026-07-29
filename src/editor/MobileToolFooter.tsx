// MobileToolFooter.tsx — The X / ✓ action footer that sits at the
// bottom of the in-tool MobileSheet. Pattern lifted from Snapseed:
// ✕ on the left, optional middle action slot, ✓ on the right.
//
// Live-preview semantics (V2 redesign decision):
//   • ✓ → close the sheet. The user's edits were live-baked into
//     `doc.working` as they happened; ✓ just dismisses.
//   • ✕ → call `undo()` then close. Undoes only the most recent
//     commit (NOT the whole tool session) — this is a known
//     limitation of the lighter live-preview path. Multi-commit
//     rewind would need a "checkpoint at sheet-open" API on the
//     history ref, which is a future iteration.
//
// The middle slot is reserved for tools that have a primary affordance
// (Selective's "Add point", Filter's "+Mask", Frame's "Layers") —
// callers pass `centerAction`. When omitted, the footer renders just
// the two action buttons with the row's symmetry preserved.

import { I } from "../components/icons";

interface CenterAction {
  label: string;
  icon?: typeof I.Plus;
  onClick: () => void;
}

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
  /** Optional middle button — used by tools with a primary in-tool
   *  action (e.g. Selective's "Add point"). When omitted, the footer
   *  is a clean ✕ … ✓ pair with the center spacer keeping symmetry. */
  centerAction?: CenterAction;
}

export function MobileToolFooter({ onCancel, onConfirm, centerAction }: Props) {
  return (
    <div
      // Sticks to the sheet's bottom; the safe-area-inset on padding
      // keeps the icons clear of the iOS home indicator. V3.1 drops
      // the prior border-t hairline + tonal shift — the sheet now
      // reads as one continuous white card and the X / ✓ live at
      // its corners by position alone, no separator needed.
      className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5"
      style={{
        paddingTop: "0.625rem",
        paddingBottom: "max(env(safe-area-inset-bottom),0.625rem)",
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="btn btn-ghost btn-icon"
      >
        <I.X size={20} stroke={2} />
      </button>

      {centerAction ? (
        <button
          type="button"
          onClick={centerAction.onClick}
          className="flex flex-col items-center justify-center gap-0.5 cursor-pointer border-none bg-transparent px-3 py-1 font-[inherit] text-text"
        >
          {centerAction.icon ? (
            <centerAction.icon
              size={20}
              stroke={2}
              className="text-coral-500 dark:text-coral-400"
            />
          ) : (
            <I.Plus size={20} stroke={2} className="text-coral-500 dark:text-coral-400" />
          )}
          <span className="text-[10.5px] font-medium tracking-[-0.005em]">
            {centerAction.label}
          </span>
        </button>
      ) : (
        // Empty centre keeps the X and ✓ at the row's edges instead of
        // crowding to the middle.
        <span aria-hidden className="h-10 w-10" />
      )}

      <button
        type="button"
        onClick={onConfirm}
        aria-label="Done"
        className="btn btn-outline-coral btn-icon"
      >
        <I.Check size={20} stroke={2} />
      </button>
    </div>
  );
}
