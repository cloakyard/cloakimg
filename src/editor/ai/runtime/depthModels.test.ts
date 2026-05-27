// Tests for the depth-estimation model registry. Pure data + selectors,
// no canvas — pins the tier contract the CapabilityService + consent
// dialog depend on, mirroring the guarantees bgModels relies on.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_DEPTH_FAMILY,
  getDepthInferenceLongEdge,
  getDepthTierById,
  getDepthTiers,
} from "./depthModels";

describe("depth model registry", () => {
  it("exposes at least one tier, ordered small → large by bytes", () => {
    const tiers = getDepthTiers();
    expect(tiers.length).toBeGreaterThan(0);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.bytes).toBeGreaterThan(tiers[i - 1]!.bytes);
    }
  });

  it("each tier's bytes match mb * 1024 * 1024", () => {
    for (const t of getDepthTiers()) {
      expect(t.bytes).toBe(t.mb * 1024 * 1024);
    }
  });

  it("each tier's index matches its position in the family array", () => {
    ACTIVE_DEPTH_FAMILY.tiers.forEach((t, i) => {
      expect(t.index).toBe(i);
    });
  });

  it("every tier carries an HF repo + dtype the worker can drive", () => {
    for (const t of getDepthTiers()) {
      expect(t.repo).toMatch(/\S/);
      expect(t.dtype).toMatch(/\S/);
    }
  });

  it("tier ids are unique", () => {
    const ids = getDepthTiers().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exactly one tier is marked recommended", () => {
    const recommended = getDepthTiers().filter((t) => t.recommended);
    expect(recommended).toHaveLength(1);
  });

  it("getDepthTierById resolves a known id and throws on an unknown one", () => {
    const first = getDepthTiers()[0]!;
    expect(getDepthTierById(first.id)).toBe(first);
    // @ts-expect-error — exercising the runtime guard with a bad id.
    expect(() => getDepthTierById("nope")).toThrow();
  });

  it("inference long-edge is a positive number", () => {
    expect(getDepthInferenceLongEdge()).toBeGreaterThan(0);
  });
});
