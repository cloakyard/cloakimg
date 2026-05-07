// ScopeGate.tsx — Disables a panel's interactive controls while the
// subject-mask service is detecting (or has errored), so users don't
// drag a slider that quietly applies to the whole image when they
// asked for "Subject only". The MaskScopeRow itself sits OUTSIDE
// this gate so the user can always step back to Whole — the gate
// just blanks out the per-pixel controls below.
//
// Two pieces:
//   • `inert` removes the subtree from the tab order and blocks
//     pointer events without having to thread `disabled` through
//     every atom (Slider, CurveEditor, etc.).
//   • opacity-50 makes the visual state read as "waiting" — paired
//     with the DetectionProgressCard the panel renders above this
//     gate, the user gets a clear "model is loading, controls will
//     wake up when it's ready" cue.

import type { ReactNode } from "react";

interface Props {
  /** True → block interaction with the children. False → pass-through. */
  disabled: boolean;
  children: ReactNode;
}

export function ScopeGate({ disabled, children }: Props) {
  return (
    <div
      // `inert` is the modern HTML primitive for "this subtree is
      // present but non-interactive." It both removes from the tab
      // order and stops pointer events. Supported in every browser
      // we target (Chrome 102+, Safari 15.5+, Firefox 112+).
      inert={disabled}
      aria-hidden={disabled || undefined}
      className={
        disabled
          ? "flex flex-col gap-3 opacity-50 transition-opacity duration-150"
          : "flex flex-col gap-3 transition-opacity duration-150"
      }
    >
      {children}
    </div>
  );
}
