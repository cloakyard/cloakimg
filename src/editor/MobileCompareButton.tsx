// MobileCompareButton.tsx — Press-and-hold "compare with original"
// pill, mobile-only, rendered as an overlay on the canvas.
//
// History
// -------
// The previous compare affordance lived in the mobile More menu: tap
// More → tap "Show original" → tap More → tap "Hide original". That's
// four taps just to flick back and forth between the original and the
// edit. This pill collapses the loop to a single press-and-hold gesture:
// press to peek the source, lift to return.
//
// The canvas swap itself is driven by `compareActive` in EditorContext
// (existing rendering path in ImageCanvas), so this component does not
// touch image pixels — it just owns the gesture surface and toggles
// the boolean. Press-and-hold semantics here intentionally match the
// desktop hold-to-compare button in TopBar so the gesture is consistent
// across platforms.
//
// Pointer-event handlers live on the button itself (not the canvas
// container) so that drag-off-edge releases cleanly via `pointerleave`
// — the canvas never gets stuck in compare mode if the user's finger
// slides off the pill. `touch-none` + `select-none` suppress iOS
// magnifier / text-selection on long-press.
//
// Positioned at the canvas top-left to balance the zoom badge at the
// top-right (both glassmorphic dark pills, mirrored).

import { useCallback } from "react";
import { I } from "../components/icons";

interface Props {
  compareActive: boolean;
  setCompareActive: (active: boolean) => void;
}

export function MobileCompareButton({ compareActive, setCompareActive }: Props) {
  const release = useCallback(() => setCompareActive(false), [setCompareActive]);
  const press = useCallback(() => setCompareActive(true), [setCompareActive]);
  return (
    <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} className="t-mono">
      <button
        type="button"
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        aria-label={
          compareActive ? "Showing original — release to return" : "Hold to compare with original"
        }
        aria-pressed={compareActive}
        className="flex cursor-pointer touch-none items-center gap-1.5 rounded-full border-none px-3 py-1 text-[11px] font-semibold text-white select-none active:scale-[0.96]"
        style={{
          background: compareActive ? "rgba(245,97,58,0.85)" : "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          transition: "background 150ms",
        }}
      >
        <I.GitCompare size={12} />
        {compareActive ? "Original" : "Hold"}
      </button>
    </div>
  );
}
