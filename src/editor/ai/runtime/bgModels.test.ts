// Pure-data tests for the background-model registry. No mocks — every
// assertion exercises the live ACTIVE_FAMILY, so a future model swap
// that breaks the contract (missing tier, mismatched index, layout
// filter regression) trips here before the editor even mounts.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_FAMILY,
  type BgQuality,
  getActiveTiers,
  getInferenceLongEdge,
  getTierById,
  getTierByIndex,
  indexForQuality,
  QUALITY_KEYS,
  tiersForLayout,
} from "./bgModels";

describe("bgModels — registry contract", () => {
  it("registers a tier for every QUALITY_KEYS entry", () => {
    for (const id of QUALITY_KEYS) {
      const tier = getTierById(id);
      expect(tier.id).toBe(id);
    }
  });

  it("orders QUALITY_KEYS small → medium → large", () => {
    expect(QUALITY_KEYS).toEqual(["small", "medium", "large"]);
  });

  it("orders ACTIVE_FAMILY tiers by ascending mb (quality monotonic)", () => {
    const sizes = ACTIVE_FAMILY.tiers.map((t) => t.mb);
    const sorted = [...sizes].sort((a, b) => a - b);
    expect(sizes).toEqual(sorted);
  });

  it("derives bytes consistently from mb", () => {
    for (const tier of ACTIVE_FAMILY.tiers) {
      expect(tier.bytes).toBe(tier.mb * 1024 * 1024);
    }
  });

  it("populates required tier fields (label, mb, repo, dtype, copy)", () => {
    for (const tier of ACTIVE_FAMILY.tiers) {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.mb).toBeGreaterThan(0);
      expect(tier.repo.length).toBeGreaterThan(0);
      expect(tier.dtype.length).toBeGreaterThan(0);
      expect(tier.strength.length).toBeGreaterThan(0);
      expect(tier.tradeoff.length).toBeGreaterThan(0);
    }
  });

  it("uses distinct dtype variants per tier (otherwise no point in tiers)", () => {
    const dtypes = ACTIVE_FAMILY.tiers.map((t) => t.dtype);
    expect(new Set(dtypes).size).toBe(ACTIVE_FAMILY.tiers.length);
  });

  it("declares a positive inferenceLongEdge for the active family", () => {
    expect(getInferenceLongEdge()).toBeGreaterThan(0);
  });
});

describe("bgModels — index ↔ id round-trip", () => {
  it("getTierByIndex returns matching id for each numeric index", () => {
    QUALITY_KEYS.forEach((id, idx) => {
      expect(getTierByIndex(idx).id).toBe(id);
    });
  });

  it("indexForQuality returns the index getTierByIndex consumes", () => {
    for (const id of QUALITY_KEYS) {
      const idx = indexForQuality(id);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(getTierByIndex(idx).id).toBe(id);
    }
  });

  it("getTierByIndex falls back to first tier on out-of-range index", () => {
    const fallback = getTierByIndex(99);
    expect(fallback.id).toBe(QUALITY_KEYS[0]);
  });

  it("getTierByIndex falls back to first tier on negative index", () => {
    const fallback = getTierByIndex(-1);
    expect(fallback.id).toBe(QUALITY_KEYS[0]);
  });

  it("getTierById throws for an unregistered id (registry guard)", () => {
    expect(() => getTierById("xxxxxxxx" as BgQuality)).toThrow(/no tier registered/i);
  });
});

describe("bgModels — tiersForLayout (the mobile/desktop filter)", () => {
  it("desktop: surfaces every tier in the active family", () => {
    const tiers = tiersForLayout("desktop");
    expect(tiers).toHaveLength(ACTIVE_FAMILY.tiers.length);
    expect(tiers.map((t) => t.id)).toEqual([...QUALITY_KEYS]);
  });

  it("tablet: surfaces every tier (same surface as desktop)", () => {
    const tiers = tiersForLayout("tablet");
    expect(tiers).toHaveLength(ACTIVE_FAMILY.tiers.length);
  });

  it("mobile: hides any tier flagged desktopAndTabletOnly", () => {
    const mobile = tiersForLayout("mobile");
    const hidden = ACTIVE_FAMILY.tiers.filter((t) => t.desktopAndTabletOnly);
    expect(mobile).toHaveLength(ACTIVE_FAMILY.tiers.length - hidden.length);
    for (const t of hidden) {
      expect(mobile.find((m) => m.id === t.id)).toBeUndefined();
    }
  });

  it("mobile: keeps the small tier (every device must reach the lowest size)", () => {
    const mobile = tiersForLayout("mobile");
    expect(mobile.find((t) => t.id === "small")).toBeDefined();
  });

  it("returns a fresh array (mutation safety — UI must not corrupt the registry)", () => {
    const a = tiersForLayout("desktop");
    const b = tiersForLayout("desktop");
    expect(a).not.toBe(b);
    a.length = 0;
    expect(getActiveTiers().length).toBeGreaterThan(0);
  });
});
