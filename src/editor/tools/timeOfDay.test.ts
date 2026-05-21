// timeOfDay.test.ts — Unit coverage for the keyframe interpolation
// + identity-at-0.5 contract. The Time of Day tool builds its
// preview by composing the user's dial into an 11-slot Adjust slider
// array; if that composition drifts off identity at the rest point,
// every photo gets a permanent tint baked into the preview.

import { describe, expect, it } from "vitest";
import { ADJUST_KEYS } from "../toolState";
import { composeTimeOfDay, KEYFRAMES, timeOfDayLabel } from "./timeOfDay";

describe("composeTimeOfDay", () => {
  it("returns an array of ADJUST_KEYS length", () => {
    const out = composeTimeOfDay(0.5);
    expect(out).toHaveLength(ADJUST_KEYS.length);
  });

  it("returns identity at the rest point (0.5 = Noon)", () => {
    const out = composeTimeOfDay(0.5);
    // Every slider should sit at 0.5 (identity).
    for (const v of out) expect(v).toBe(0.5);
  });

  it("warms the photo at the Golden keyframe (0.7)", () => {
    const out = composeTimeOfDay(0.7);
    const tempIdx = ADJUST_KEYS.indexOf("temp");
    const satIdx = ADJUST_KEYS.indexOf("saturation");
    // Golden has temp +0.16 → expect > 0.5; saturation +0.10 → > 0.5.
    expect(out[tempIdx]).toBeGreaterThan(0.5);
    expect(out[satIdx]).toBeGreaterThan(0.5);
  });

  it("cools the photo at the Dawn keyframe (0.0)", () => {
    const out = composeTimeOfDay(0.0);
    const tempIdx = ADJUST_KEYS.indexOf("temp");
    const expIdx = ADJUST_KEYS.indexOf("exposure");
    // Dawn has temp -0.18 → expect < 0.5; exposure -0.08 → < 0.5.
    expect(out[tempIdx]).toBeLessThan(0.5);
    expect(out[expIdx]).toBeLessThan(0.5);
  });

  it("clamps each slider to [0, 1] even when deltas would overshoot", () => {
    // Drive a manual adjust that would push a slider out of range
    // when stacked with a delta (e.g. manual exposure 0.95 + Golden
    // shouldn't produce an out-of-range value).
    const manual = Array.from({ length: ADJUST_KEYS.length }, () => 0.95);
    const out = composeTimeOfDay(0.0, manual); // dawn adds negative deltas
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const manual2 = Array.from({ length: ADJUST_KEYS.length }, () => 0.95);
    const out2 = composeTimeOfDay(0.85, manual2); // sunset adds positive deltas
    for (const v of out2) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("composes additively with the manual Adjust array", () => {
    // At Noon (no delta) the output should match the manual array
    // exactly — no accidental delta drift.
    const manual = [0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.55, 0.5, 0.4, 0.5, 0.5];
    const out = composeTimeOfDay(0.5, manual);
    for (let i = 0; i < manual.length; i++) {
      expect(out[i]).toBeCloseTo(manual[i]!, 5);
    }
  });

  it("interpolates linearly between keyframes", () => {
    // Halfway between Morning (0.2) and Noon (0.5) is t=0.35. The
    // temp delta at Morning is -0.06, at Noon is 0. Halfway = -0.03.
    const out = composeTimeOfDay(0.35);
    const tempIdx = ADJUST_KEYS.indexOf("temp");
    expect(out[tempIdx]).toBeCloseTo(0.5 + -0.03, 3);
  });

  it("clamps `t` to the endpoints", () => {
    // t < 0 should behave like t=0 (Dawn); t > 1 like t=1 (Night).
    expect(composeTimeOfDay(-0.5)).toEqual(composeTimeOfDay(0.0));
    expect(composeTimeOfDay(1.5)).toEqual(composeTimeOfDay(1.0));
  });
});

describe("timeOfDayLabel", () => {
  it("returns the nearest keyframe label", () => {
    expect(timeOfDayLabel(0.0)).toBe("Dawn");
    expect(timeOfDayLabel(0.5)).toBe("Noon");
    expect(timeOfDayLabel(0.7)).toBe("Golden");
    expect(timeOfDayLabel(1.0)).toBe("Night");
  });

  it("snaps to whichever keyframe is closest in t-space", () => {
    // 0.6 sits between Noon (0.5) and Golden (0.7); Golden is the
    // nearer one.
    expect(timeOfDayLabel(0.62)).toBe("Golden");
    expect(timeOfDayLabel(0.58)).toBe("Noon");
  });
});

describe("KEYFRAMES contract", () => {
  it("is sorted by `t` ascending and spans the full [0, 1] range", () => {
    for (let i = 1; i < KEYFRAMES.length; i++) {
      expect(KEYFRAMES[i]!.t).toBeGreaterThan(KEYFRAMES[i - 1]!.t);
    }
    expect(KEYFRAMES[0]!.t).toBe(0);
    expect(KEYFRAMES[KEYFRAMES.length - 1]!.t).toBe(1);
  });

  it("includes a literal Noon identity keyframe at t=0.5", () => {
    const noon = KEYFRAMES.find((k) => k.t === 0.5);
    expect(noon?.label).toBe("Noon");
    expect(Object.keys(noon?.deltas ?? {})).toHaveLength(0);
  });
});
