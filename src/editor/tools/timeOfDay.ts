// timeOfDay.ts — Maps a single 0..1 "time of day" slider into the
// 11-slot Adjust slider array. Each Adjust slider is 0..1 with 0.5 ==
// identity, so the mapping for each value is "delta from 0.5" where
// the delta encodes a colour-grading look.
//
// Keyframes:
//   t = 0.00  Dawn       — cool, soft, low-contrast, slight blue cast
//   t = 0.20  Morning    — clean light, slight cool, gentle lift
//   t = 0.50  Noon       — identity (no change, slider at rest)
//   t = 0.70  Golden     — warm amber, +saturation, slight contrast
//   t = 0.85  Sunset     — deep warm, lifted shadows, +vibrance
//   t = 1.00  Night      — cool, low exposure, lower saturation
//
// We interpolate LINEARLY between keyframes — Catmull-Rom would
// overshoot at the edges and produce visible-but-wrong tints just
// past the endpoints. Linear keeps the dial honest: dragging halfway
// between Morning and Noon lands exactly halfway in look space.
//
// The function returns a brand-new array (not mutated in place) so it
// composes cleanly inside `useAdjustPreview`'s dependency tracking
// and inside React state updates.

import { ADJUST_KEYS, type AdjustKey } from "../toolState";

/** Per-slider delta at each keyframe. All values are *additive* on
 *  top of 0.5 identity — so e.g. `{temp: 0.15}` at the Golden
 *  keyframe means temp ends up at 0.65 (slightly warm). Sliders not
 *  listed default to 0 delta. */
interface KeyframeDeltas {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  vibrance?: number;
  temp?: number;
  vignette?: number;
}

interface Keyframe {
  t: number;
  label: string;
  /** Short hint shown next to the active label in the panel. Picked
   *  so a user scanning the dial gets a feel for the moment without
   *  having to think about Kelvin or exposure stops. */
  caption: string;
  /** Representative sky color for the gradient + thumb on the dial.
   *  These are *display* colors, not photo edits — the actual look
   *  comes from `deltas`. Tuned so the strip reads as a believable
   *  day arc: pale cool blue → warm white → amber → red → indigo. */
  color: string;
  deltas: KeyframeDeltas;
}

/** Ordered list of keyframes — `t` must be strictly increasing and
 *  span [0, 1]. The labels are also surfaced in the panel UI so the
 *  user reads "Golden" when the dial sits at 0.7 rather than "70%". */
export const KEYFRAMES: readonly Keyframe[] = [
  // Dawn: cool blue cast, lifted shadows for that "morning haze" look,
  // slightly reduced exposure + contrast so the scene reads soft.
  {
    t: 0.0,
    label: "Dawn",
    caption: "Cool, hazy, soft contrast",
    color: "#a6b4c4",
    deltas: { temp: -0.18, exposure: -0.08, shadows: 0.12, contrast: -0.08, saturation: -0.1 },
  },
  // Morning: clean neutral light, faintly cool, slight exposure lift.
  {
    t: 0.2,
    label: "Morning",
    caption: "Clean light, slightly cool",
    color: "#cce0ee",
    deltas: { temp: -0.06, exposure: 0.04, saturation: -0.02 },
  },
  // Noon: identity. All deltas zero.
  {
    t: 0.5,
    label: "Noon",
    caption: "Neutral baseline — no edit",
    color: "#eef2f6",
    deltas: {},
  },
  // Golden: warm amber wash, gentle highlight roll-off, +saturation.
  {
    t: 0.7,
    label: "Golden",
    caption: "Warm amber, gentle vibrance",
    color: "#f5b66a",
    deltas: { temp: 0.16, highlights: -0.06, saturation: 0.1, vibrance: 0.08, vignette: 0.06 },
  },
  // Sunset: deeper warm tones, lifted shadows for that "rim-light"
  // look, slightly reduced exposure to keep highlights manageable.
  {
    t: 0.85,
    label: "Sunset",
    caption: "Deep amber, lifted shadows",
    color: "#c25433",
    deltas: {
      temp: 0.26,
      exposure: -0.04,
      shadows: 0.1,
      saturation: 0.14,
      vibrance: 0.1,
      vignette: 0.1,
    },
  },
  // Night: cool blue, lower exposure, lower saturation, gentle vignette.
  {
    t: 1.0,
    label: "Night",
    caption: "Cool, dim, muted color",
    color: "#1f2a4a",
    deltas: { temp: -0.22, exposure: -0.22, saturation: -0.18, contrast: 0.05, vignette: 0.15 },
  },
];

/** Find the two keyframes that bracket `t` and the fractional
 *  position between them. Always returns a valid pair (clamped at
 *  the endpoints) — the caller can rely on never seeing a NaN even
 *  if `t` arrives out-of-bounds from a corrupted state. */
function bracket(t: number): { a: Keyframe; b: Keyframe; f: number } {
  if (t <= KEYFRAMES[0]!.t) return { a: KEYFRAMES[0]!, b: KEYFRAMES[0]!, f: 0 };
  const last = KEYFRAMES[KEYFRAMES.length - 1]!;
  if (t >= last.t) return { a: last, b: last, f: 0 };
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]!;
    const b = KEYFRAMES[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return { a, b, f };
    }
  }
  return { a: last, b: last, f: 0 };
}

/** Pick out a delta value for a single slider key, defaulting to 0
 *  when the keyframe didn't override it. Reading via this helper
 *  keeps the bilinear-interpolation loop short. */
function deltaFor(k: Keyframe, key: AdjustKey): number {
  const d = k.deltas as Partial<Record<AdjustKey, number>>;
  return d[key] ?? 0;
}

/** Compose `timeOfDay` (0..1) with the user's manual Adjust slider
 *  array. Returns a fresh array of the same length as ADJUST_KEYS,
 *  each value clamped to [0, 1] (slider domain). Identity at
 *  `timeOfDay === 0.5`. Manual adjustments compose ADDITIVELY: e.g.
 *  if the user already pushed exposure to 0.6 and the Time-of-Day
 *  is Golden (no exposure delta), the output is 0.6. If they then
 *  drag to Night (-0.22 exposure delta), the output is 0.38.
 *  Skipping `manualAdjust` is allowed — the standalone Time-of-Day
 *  tool calls this with just the t value. */
export function composeTimeOfDay(timeOfDay: number, manualAdjust: number[] = []): number[] {
  const { a, b, f } = bracket(timeOfDay);
  return ADJUST_KEYS.map((key, i) => {
    const manual = manualAdjust[i] ?? 0.5;
    const da = deltaFor(a, key);
    const db = deltaFor(b, key);
    const delta = da + (db - da) * f;
    return Math.max(0, Math.min(1, manual + delta));
  });
}

/** The closest keyframe label to the current dial position. Used by
 *  the panel to show "Golden" next to the slider value. */
export function timeOfDayLabel(t: number): string {
  let bestLabel = KEYFRAMES[0]!.label;
  let bestDist = Infinity;
  for (const k of KEYFRAMES) {
    const d = Math.abs(k.t - t);
    if (d < bestDist) {
      bestDist = d;
      bestLabel = k.label;
    }
  }
  return bestLabel;
}
