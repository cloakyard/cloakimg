// types.test.ts — Lock the tier helpers' edge cases. These look
// trivial but they're consumed by every consent dialog and panel
// readout — a bad fallback here means the UI shows the wrong size
// or no selection.

import { describe, expect, it } from "vitest";
import { indexForTier, tierById, tierByIndex, tiersForLayout } from "./types";
import type { CapabilityTier } from "./types";

const TIERS: CapabilityTier<null>[] = [
  {
    id: "small",
    index: 0,
    label: "Fast",
    mb: 1,
    bytes: 1024 * 1024,
    strength: "Quick.",
    tradeoff: "Less detail.",
    runtimeRef: null,
  },
  {
    id: "medium",
    index: 1,
    label: "Better",
    mb: 2,
    bytes: 2 * 1024 * 1024,
    strength: "Sharper.",
    tradeoff: "Bigger.",
    recommended: true,
    runtimeRef: null,
  },
  {
    id: "large",
    index: 2,
    label: "Best",
    mb: 4,
    bytes: 4 * 1024 * 1024,
    strength: "Highest fidelity.",
    tradeoff: "Heaviest.",
    desktopAndTabletOnly: true,
    runtimeRef: null,
  },
];

describe("tier helpers", () => {
  it("tierById returns the matching tier", () => {
    expect(tierById(TIERS, "medium").label).toBe("Better");
  });

  it("tierById throws on an unregistered id (no silent fall-through)", () => {
    expect(() => tierById(TIERS, "ginormous")).toThrow(/no tier registered/);
  });

  it("tierByIndex returns the indexed tier", () => {
    expect(tierByIndex(TIERS, 1).id).toBe("medium");
  });

  it("tierByIndex falls back to the first entry on out-of-range", () => {
    // Persisted prefs after a future migration may name an index that
    // no longer exists. Falling back to the smallest tier keeps the
    // UI in a usable state.
    expect(tierByIndex(TIERS, 99).id).toBe("small");
    expect(tierByIndex(TIERS, -5).id).toBe("small");
  });

  it("indexForTier is the inverse of tierByIndex", () => {
    expect(indexForTier(TIERS, "medium")).toBe(1);
    expect(indexForTier(TIERS, "missing")).toBe(-1);
  });

  it("tiersForLayout drops desktopAndTabletOnly tiers on mobile", () => {
    expect(tiersForLayout(TIERS, "mobile")).toHaveLength(2);
    expect(tiersForLayout(TIERS, "mobile").map((t) => t.id)).toEqual(["small", "medium"]);
  });

  it("tiersForLayout keeps every tier on desktop and tablet", () => {
    expect(tiersForLayout(TIERS, "desktop")).toHaveLength(3);
    expect(tiersForLayout(TIERS, "tablet")).toHaveLength(3);
  });

  it("tiersForLayout returns a fresh array (caller-mutable, no aliasing)", () => {
    const desktop = tiersForLayout(TIERS, "desktop");
    desktop.length = 0;
    expect(TIERS).toHaveLength(3);
  });
});
