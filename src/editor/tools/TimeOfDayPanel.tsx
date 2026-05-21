// TimeOfDayPanel.tsx — Single-slider tool that grades the photo as
// Dawn → Morning → Noon → Golden → Sunset → Night. The dial composes
// into the Adjust pipeline at apply time (via `composeTimeOfDay`),
// so the result lives in history as a single "Time of day" entry
// without leaving stale slider state behind.
//
// Why a separate tool from Adjust? Two reasons:
//   • Discoverability — Lightroom-style "look picker" users go
//     hunting for time-of-day affordances; calling it out lets them
//     find it without scrolling 11 sliders.
//   • Simplicity — one knob, one promise. Adjust is the power tool;
//     this is the intent tool.

import { useCallback } from "react";
import { I } from "../../components/icons";
import { PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { bakeAdjustAsync } from "./adjustments";
import { composeTimeOfDay, KEYFRAMES, timeOfDayLabel } from "./timeOfDay";

export function TimeOfDayPanel() {
  const toolState = useToolState();
  const { patchTool, commit } = useEditorActions();
  const { doc } = useEditorReadOnly();

  const t = toolState.timeOfDay;
  const label = timeOfDayLabel(t);
  // Identity is exactly 0.5 (Noon). Any other value is "dirty" — the
  // apply path bakes the synthesized adjust array into history.
  const dirty = Math.abs(t - 0.5) > 0.001;

  const reset = useCallback(() => {
    patchTool("timeOfDay", 0.5);
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc || !dirty) return;
    // Compose the dial into the 11-slot adjust array, then run the
    // same async chunked bake the Adjust panel uses. This means the
    // tool gets all of bakeAdjust's existing infrastructure
    // (downsample yield, gain LUT, etc.) for free.
    const adjustArray = composeTimeOfDay(t);
    const out = await bakeAdjustAsync(doc.working, adjustArray, 0);
    copyInto(doc.working, out);
    releaseCanvas(out);
    reset();
    commit("Time of day");
  }, [commit, doc, dirty, reset, t]);

  // Bake on tool switch / export — same pattern as Adjust / Filter
  // so the global ✓ on mobile and tool-switch flush on desktop
  // commit a clean history entry.
  useApplyOnToolSwitch(apply, dirty);

  return (
    <>
      <PropRow label="Time of day" value={label}>
        <Slider value={t} accent defaultValue={0.5} onChange={(v) => patchTool("timeOfDay", v)} />
      </PropRow>

      {/* Keyframe rail — six tappable chips below the slider that
          snap the dial to known looks. Doubles as a legend so the
          user understands what "0.7" actually means on the slider
          without dragging blindly. The active chip is whichever
          keyframe label the slider's closest to. */}
      <div className="-mx-1 flex flex-wrap gap-1 px-1">
        {KEYFRAMES.map((k) => {
          const active = k.label === label;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => patchTool("timeOfDay", k.t)}
              aria-pressed={active}
              className={`cursor-pointer rounded-md border-none px-2 py-1 font-[inherit] text-[11px] font-semibold transition-colors pointer-coarse:py-1.5 pointer-coarse:text-[12px] ${
                active
                  ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                  : "bg-page-bg text-text-muted hover:bg-page-bg/70"
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={reset}
        disabled={!dirty}
        className="btn btn-secondary btn-xs justify-center"
        style={{ opacity: dirty ? 1 : 0.5 }}
      >
        <I.Rotate size={11} /> Reset
      </button>

      <div className="text-[11.5px] leading-relaxed text-text-muted">
        A single dial that walks the photo through Dawn → Noon → Sunset → Night. Composes
        temperature, exposure, saturation, and contrast into one move. Use the chips to snap to a
        look, then refine with the slider. Layer Adjust on top after for fine-tuning.
      </div>
    </>
  );
}
