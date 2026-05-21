// TimeOfDayPanel.tsx — Single-dial tool that grades the photo as
// Dawn → Morning → Noon → Golden → Sunset → Night. The dial composes
// into the Adjust pipeline at apply time (via `composeTimeOfDay`),
// so the result lives in history as a single "Time of day" entry
// without leaving stale slider state behind.
//
// The UI is a *sky-gradient dial*, not a generic slider. The bar's
// gradient is built from each keyframe's representative sky color,
// so dragging the thumb across it shows the user the moment they're
// picking instead of a percentage. Labels sit underneath, anchored
// to their keyframe `t` positions, and double as snap targets.

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from "react";
import { I } from "../../components/icons";
import { copyInto, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { bakeAdjustAsync } from "./adjustments";
import { composeTimeOfDay, KEYFRAMES, timeOfDayLabel } from "./timeOfDay";

const NOON_KEYFRAME = KEYFRAMES.find((k) => k.label === "Noon") ?? KEYFRAMES[0];

/** Map a 0..1 dial position to one of the six keyframes whose label
 *  is currently closest. Used to pick the header copy + thumb color. */
function nearestKeyframe(t: number) {
  let best = NOON_KEYFRAME;
  let bestDist = Infinity;
  for (const k of KEYFRAMES) {
    const d = Math.abs(k.t - t);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best ?? KEYFRAMES[0];
}

/** Linearly blend two `#rrggbb` hex strings. Used to compute the
 *  thumb's fill color so it visually matches the sky beneath it as
 *  the user drags between keyframes — no jumpy color snaps. */
function lerpHex(a: string, b: string, f: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff;
  const ag = (pa >> 8) & 0xff;
  const ab = pa & 0xff;
  const br = (pb >> 16) & 0xff;
  const bg = (pb >> 8) & 0xff;
  const bb = pb & 0xff;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function interpolateSkyColor(t: number): string {
  if (t <= KEYFRAMES[0].t) return KEYFRAMES[0].color;
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  if (t >= last.t) return last.color;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return lerpHex(a.color, b.color, f);
    }
  }
  return last.color;
}

/** Pre-built CSS gradient string for the dial track. Computed once
 *  at module load since KEYFRAMES is static. */
const SKY_GRADIENT = `linear-gradient(to right, ${KEYFRAMES.map(
  (k) => `${k.color} ${(k.t * 100).toFixed(1)}%`,
).join(", ")})`;

export function TimeOfDayPanel() {
  const toolState = useToolState();
  const { patchTool, commit } = useEditorActions();
  const { doc } = useEditorReadOnly();

  const t = toolState.timeOfDay;
  const label = timeOfDayLabel(t);
  const active = nearestKeyframe(t);
  const thumbColor = interpolateSkyColor(t);
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

  // Pointer-driven dial. Same coalescing pattern as <Slider> in
  // atoms.tsx so a 120 Hz drag doesn't translate into 120 React
  // renders across every useEditor() consumer.
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const v = pendingRef.current;
    pendingRef.current = null;
    if (v !== null) patchTool("timeOfDay", v);
  }, [patchTool]);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = railRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      pendingRef.current = next;
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      flush();
    }
  }, [flush]);

  // Cancel any pending rAF on unmount so we don't fire onChange after
  // the consumer has gone away.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Header — names the moment the user has landed on plus a one-
          line caption, so the dial reads as a verb tense ("Golden")
          rather than a number (0.70). The Reset chip docks here when
          dirty; hidden at identity to keep the panel calm. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-text">
            {label}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-text-muted">{active.caption}</div>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 font-[inherit] text-[11px] font-semibold text-text-muted transition-colors hover:bg-page-bg hover:text-text"
            aria-label="Reset Time of day to Noon"
          >
            <I.Rotate size={11} /> Reset
          </button>
        )}
      </div>

      {/* Sky-gradient dial. The bar IS the picker — the photo's look
          matches whichever sky color the thumb is sitting on, so
          there's no abstraction between control and result. */}
      <div className="flex flex-col gap-1.5">
        <div
          ref={railRef}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={Number(t.toFixed(2))}
          aria-valuetext={label}
          aria-label="Time of day"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            // Arrow-key nudges in 1% increments; Home / End snap to
            // the endpoints. Matches native <input type=range> a11y.
            const step = e.shiftKey ? 0.05 : 0.01;
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              patchTool("timeOfDay", Math.max(0, t - step));
            } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              patchTool("timeOfDay", Math.min(1, t + step));
            } else if (e.key === "Home") {
              e.preventDefault();
              patchTool("timeOfDay", 0);
            } else if (e.key === "End") {
              e.preventDefault();
              patchTool("timeOfDay", 1);
            }
          }}
          className="relative flex h-9 w-full cursor-grab touch-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 pointer-coarse:h-11 active:cursor-grabbing"
        >
          {/* Sky strip. Inner shadow + thin dark hairline keep the
              gradient from floating off the page in light mode. */}
          <div
            aria-hidden
            className="h-6 w-full rounded-full pointer-coarse:h-8"
            style={{
              background: SKY_GRADIENT,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08), inset 0 1px 2px rgba(0,0,0,0.1)",
            }}
          />
          {/* Thumb. Color tracks the interpolated sky beneath, so the
              cursor visually merges with the gradient. White ring +
              soft shadow lift it off the bar; the inner radial
              highlight gives a subtle "sun" feel without committing
              to a literal icon (which would have to flip to a moon
              at the Night end and break the unified gesture). */}
          <div
            aria-hidden
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 rounded-full pointer-coarse:h-7 pointer-coarse:w-7"
            style={{
              left: `${t * 100}%`,
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${thumbColor} 55%, ${thumbColor})`,
              border: "2px solid white",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.08), 0 0 12px rgba(0,0,0,0.05)",
            }}
          />
        </div>

        {/* Tappable label legend. Evenly distributed via
            `justify-between` — the keyframes' actual `t` positions
            are unevenly clustered (Sunset 0.85, Night 1.0) so
            anchoring labels to those positions made adjacent
            labels overlap. The continuous gradient + thumb on the
            rail above already carries the precise "where am I"
            visual; this row just needs to read as a clean legend
            and provide tap-to-snap shortcuts. */}
        <div className="flex items-start justify-between gap-1">
          {KEYFRAMES.map((k) => {
            const isActive = k.label === label;
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => patchTool("timeOfDay", k.t)}
                aria-pressed={isActive}
                aria-label={`Snap to ${k.label}`}
                className={`shrink-0 cursor-pointer rounded border-none bg-transparent px-0.5 py-0.5 font-[inherit] text-[10.5px] font-semibold whitespace-nowrap transition-colors pointer-coarse:px-1 pointer-coarse:py-1 pointer-coarse:text-[11.5px] ${
                  isActive
                    ? "text-coral-600 dark:text-coral-300"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[11.5px] leading-relaxed text-text-muted">
        Drag the sun, or tap a moment to snap. One move layers temperature, exposure, saturation,
        and contrast — re-enter Adjust afterwards to fine-tune.
      </div>
    </>
  );
}
