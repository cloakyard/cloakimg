// Tests for filterPresets — the recipe registry and the category
// grouping helper that drives the FilterPanel's section layout.
//
// Three axes to pin:
//   1. Every recipe carries a recognised category. The FilterPanel
//      reads recipe.category to render section headers; an unknown
//      string would silently land in no section and the preset would
//      become invisible.
//   2. The new vintage-inspired presets are registered with the
//      expected categories and shapes.
//   3. groupRecipesByCategory walks the registry deterministically:
//      categories in FILTER_CATEGORIES order, registry order within
//      each, indices intact, empty categories pruned.

import { describe, expect, it } from "vitest";
import {
  type FilterCategory,
  FILTER_CATEGORIES,
  FILTER_PRESETS_RECIPES,
  groupRecipesByCategory,
} from "./filterPresets";

describe("FILTER_PRESETS_RECIPES — taxonomy contract", () => {
  it("every recipe declares a category from FILTER_CATEGORIES", () => {
    const allowed = new Set(FILTER_CATEGORIES);
    for (const r of FILTER_PRESETS_RECIPES) {
      expect(allowed.has(r.category), `${r.name} → ${r.category}`).toBe(true);
    }
  });

  it("every recipe has an 11-slot adjust vector (matches ADJUST_KEYS)", () => {
    for (const r of FILTER_PRESETS_RECIPES) {
      expect(r.adjust, r.name).toHaveLength(11);
    }
  });

  it("every adjust slot is finite and within the documented [-1, +1] band", () => {
    for (const r of FILTER_PRESETS_RECIPES) {
      for (const v of r.adjust) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("None is the only Original-category preset and sits at index 0", () => {
    const originals = FILTER_PRESETS_RECIPES.filter((r) => r.category === "Original");
    expect(originals).toHaveLength(1);
    expect(originals[0]?.name).toBe("None");
    expect(FILTER_PRESETS_RECIPES[0]?.name).toBe("None");
  });

  it("preset names are unique (the panel keys by name)", () => {
    const names = FILTER_PRESETS_RECIPES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // B&W presets must set monochrome:true so the live preview path
  // routes through the per-pixel mono pass. Tinted vintage presets
  // (Sepia, Tintype, Daguerre) intentionally do NOT set monochrome
  // — that pass would erase their warm/cool cast.
  it("only B&W-category recipes carry monochrome:true", () => {
    for (const r of FILTER_PRESETS_RECIPES) {
      if (r.monochrome) expect(r.category, r.name).toBe("B&W");
      if (r.category === "B&W") expect(r.monochrome, r.name).toBe(true);
    }
  });
});

describe("Vintage-inspired additions", () => {
  it("registers Kodak Gold under Warm", () => {
    const r = FILTER_PRESETS_RECIPES.find((p) => p.name === "Kodak Gold");
    expect(r).toBeDefined();
    expect(r?.category).toBe<FilterCategory>("Warm");
  });

  it("registers Super 8 under Warm with a non-zero default grain", () => {
    const r = FILTER_PRESETS_RECIPES.find((p) => p.name === "Super 8");
    expect(r).toBeDefined();
    expect(r?.category).toBe<FilterCategory>("Warm");
    expect(r?.grain ?? 0).toBeGreaterThan(0);
  });

  it("registers Cinestill under Cinematic", () => {
    const r = FILTER_PRESETS_RECIPES.find((p) => p.name === "Cinestill");
    expect(r).toBeDefined();
    expect(r?.category).toBe<FilterCategory>("Cinematic");
  });

  it("registers Tintype under Vintage with a cool tint (negative temp delta)", () => {
    const r = FILTER_PRESETS_RECIPES.find((p) => p.name === "Tintype");
    expect(r).toBeDefined();
    expect(r?.category).toBe<FilterCategory>("Vintage");
    // ADJUST_KEYS[8] == temp. Negative delta → cooler than neutral.
    expect(r?.adjust[8] ?? 0).toBeLessThan(0);
  });

  it("registers Daguerre under Vintage with a warm tint (positive temp delta)", () => {
    const r = FILTER_PRESETS_RECIPES.find((p) => p.name === "Daguerre");
    expect(r).toBeDefined();
    expect(r?.category).toBe<FilterCategory>("Vintage");
    expect(r?.adjust[8] ?? 0).toBeGreaterThan(0);
  });

  // Vintage preset trio (Sepia / Tintype / Daguerre) all bridge colour
  // → near-mono with strong tinting. Pin the heavy desat so a future
  // tweak can't accidentally turn one of them into a saturated warm
  // preset (which would belong in Warm, not Vintage).
  it("Vintage tinted trio all heavily desaturate (sat delta ≤ -0.85)", () => {
    for (const name of ["Sepia", "Tintype", "Daguerre"]) {
      const r = FILTER_PRESETS_RECIPES.find((p) => p.name === name);
      expect(r, name).toBeDefined();
      expect(r?.adjust[6] ?? 0, `${name} saturation`).toBeLessThanOrEqual(-0.85);
    }
  });

  it("none of the new vintage presets accidentally set monochrome:true (tint preservation)", () => {
    for (const name of ["Tintype", "Daguerre", "Cinestill", "Super 8", "Kodak Gold"]) {
      const r = FILTER_PRESETS_RECIPES.find((p) => p.name === name);
      expect(r?.monochrome ?? false, name).toBe(false);
    }
  });
});

describe("groupRecipesByCategory", () => {
  it("returns groups in FILTER_CATEGORIES order", () => {
    const groups = groupRecipesByCategory();
    const order = groups.map((g) => g.category);
    // Filter the canonical order to only the categories that actually
    // have recipes — groups with zero items are pruned.
    const expected = FILTER_CATEGORIES.filter((cat) =>
      FILTER_PRESETS_RECIPES.some((r) => r.category === cat),
    );
    expect(order).toEqual(expected);
  });

  it("preserves registry order within each category", () => {
    const groups = groupRecipesByCategory();
    for (const { items } of groups) {
      const indices = items.map((i) => i.index);
      const sorted = [...indices].sort((a, b) => a - b);
      expect(indices).toEqual(sorted);
    }
  });

  // The panel dispatches `patchTool("filterPreset", item.index)` —
  // index must point back into FILTER_PRESETS_RECIPES at the same
  // recipe. A bug in groupRecipesByCategory that swapped these would
  // result in the wrong preset being applied on tap.
  it("each item's index points back at the correct recipe in the registry", () => {
    const groups = groupRecipesByCategory();
    for (const { items } of groups) {
      for (const { recipe, index } of items) {
        expect(FILTER_PRESETS_RECIPES[index]).toBe(recipe);
      }
    }
  });

  it("the union of grouped items covers the whole registry exactly once", () => {
    const groups = groupRecipesByCategory();
    const flat = groups.flatMap((g) => g.items);
    expect(flat).toHaveLength(FILTER_PRESETS_RECIPES.length);
    const indices = new Set(flat.map((i) => i.index));
    expect(indices.size).toBe(FILTER_PRESETS_RECIPES.length);
  });

  it("includes section headers for the new vintage presets", () => {
    const groups = groupRecipesByCategory();
    const vintage = groups.find((g) => g.category === "Vintage");
    expect(vintage).toBeDefined();
    const names = vintage?.items.map((i) => i.recipe.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["Sepia", "Tintype", "Daguerre"]));
  });
});
