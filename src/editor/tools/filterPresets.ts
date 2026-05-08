// filterPresets.ts — Adjust-vector recipes for each named preset, plus
// the category taxonomy the FilterPanel renders as section headers.
//
// Each recipe stores per-slider deltas in -1..+1 (0 == no change). The
// vector is added to the user's manual adjust sliders, then the result
// is run through the same pipeline (cssFilterFor or bakeAdjust). Index
// order matches ADJUST_KEYS in toolState.ts:
//   [exposure, contrast, highlights, shadows, whites, blacks, saturation,
//    vibrance, temp, vignette, sharpen]
//
// `category` groups visually-similar presets so the panel can render
// labelled sections — users skim categories rather than 30+ unlabelled
// thumbs. The category name is purely descriptive: it doesn't affect
// the bake or the saved state. Recipes are stored in category order so
// the visual flow in the panel matches the registry order.
//
// `filterPreset` in toolState is a numeric INDEX into this array. The
// state is session-only (not persisted in draft / recents), so the
// order can be reshuffled freely without breaking saved sessions.
// BatchView's preset dropdown also uses index → name, so an additive
// reorder there is identity-preserving (it just renders the new label
// at the corresponding index slot).

export type FilterCategory =
  | "Original"
  | "Subtle"
  | "Warm"
  | "Vibrant"
  | "Cool"
  | "Cinematic"
  | "Faded"
  | "Vintage"
  | "B&W";

/** Order matters — the panel renders section headers in this order. */
export const FILTER_CATEGORIES: readonly FilterCategory[] = [
  "Original",
  "Subtle",
  "Warm",
  "Vibrant",
  "Cool",
  "Cinematic",
  "Faded",
  "Vintage",
  "B&W",
] as const;

export interface FilterRecipe {
  name: string;
  category: FilterCategory;
  adjust: number[];
  grain?: number;
  monochrome?: boolean;
}

export const FILTER_PRESETS_RECIPES: FilterRecipe[] = [
  // ── Original ──────────────────────────────────────────────────────
  { name: "None", category: "Original", adjust: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },

  // ── Subtle / true-to-life ─────────────────────────────────────────
  {
    name: "Natural",
    category: "Subtle",
    adjust: [0, 0.05, -0.05, 0.1, 0, 0, 0.08, 0.12, 0.1, 0, 0.06],
  },
  {
    name: "Portra",
    category: "Subtle",
    adjust: [0, 0.05, -0.05, 0.1, 0, 0, -0.05, 0.1, 0.15, 0, 0],
  },
  {
    name: "Portrait",
    category: "Subtle",
    adjust: [0.05, 0.05, -0.05, 0.2, 0.05, 0, 0.05, 0.15, 0.2, 0, 0.05],
  },
  {
    name: "Soft",
    category: "Subtle",
    adjust: [0.1, -0.1, -0.2, 0.2, 0, 0, -0.05, 0.1, 0.05, 0, -0.1],
  },

  // ── Warm → vintage warm ───────────────────────────────────────────
  {
    name: "Warm",
    category: "Warm",
    adjust: [0.05, 0.1, -0.1, 0.15, 0, 0, 0.1, 0.15, 0.25, 0, 0],
  },
  // Kodak Gold — warm yellow midtones + lifted shadows. Distinct from
  // Aged / 70s by being more golden than amber, with a milder contrast
  // curve so faces stay flattering.
  {
    name: "Kodak Gold",
    category: "Warm",
    adjust: [0.05, 0.1, -0.1, 0.2, -0.05, 0.1, 0.05, 0.15, 0.3, 0.05, 0],
  },
  {
    name: "Aged",
    category: "Warm",
    adjust: [0, 0.1, -0.1, 0.1, -0.1, 0.05, -0.15, -0.05, 0.3, 0.2, 0],
  },
  {
    name: "70s",
    category: "Warm",
    adjust: [0.05, -0.1, -0.15, 0.2, -0.1, 0.25, -0.05, 0, 0.4, 0.1, -0.05],
  },
  {
    name: "Polaroid",
    category: "Warm",
    adjust: [0.05, -0.15, -0.1, 0.2, -0.05, 0.2, -0.1, -0.05, 0.15, 0.05, -0.05],
  },
  // Avocado — earthy 70s palette: warm-muted, low contrast, lifted
  // blacks. Sits alongside 70s and Aged but is more desaturated and
  // softer; reads as faded magazine print rather than punchy slide
  // film.
  {
    name: "Avocado",
    category: "Warm",
    adjust: [0.05, -0.2, -0.1, 0.25, -0.15, 0.25, -0.2, -0.05, 0.25, 0.1, -0.05],
  },
  // Super 8 — heavy orange, lifted blacks, soft + grainy. The grain
  // default (0.4) is what gives this preset its character; scaled by
  // the panel's intensity slider at apply time.
  {
    name: "Super 8",
    category: "Warm",
    adjust: [0.05, -0.15, -0.15, 0.25, -0.1, 0.3, -0.1, 0.05, 0.4, 0.15, -0.1],
    grain: 0.4,
  },

  // ── Saturated / punchy ────────────────────────────────────────────
  {
    name: "Punch",
    category: "Vibrant",
    adjust: [0.05, 0.2, -0.1, 0.05, 0, 0, 0.25, 0.3, 0, 0, 0.15],
  },
  {
    name: "Velvia",
    category: "Vibrant",
    adjust: [0, 0.25, -0.1, -0.05, 0.1, -0.1, 0.3, 0.25, 0.05, 0.1, 0.1],
  },
  {
    name: "Kodachrome",
    category: "Vibrant",
    adjust: [0, 0.25, -0.1, -0.05, 0.1, -0.1, 0.25, 0.2, 0.15, 0.1, 0.1],
  },
  {
    name: "Verde",
    category: "Vibrant",
    adjust: [0, 0.15, -0.15, 0.05, 0, 0, 0.2, 0.25, -0.15, 0, 0],
  },
  {
    name: "Lomo",
    category: "Vibrant",
    adjust: [0, 0.25, -0.15, 0.05, 0.05, -0.1, 0.35, 0.3, 0.05, 0.4, 0.1],
  },
  // Disco — late-70s saturated dance-floor look. Higher saturation
  // than Punch with lifted shadows (mirror-ball glow) and a touch of
  // warmth. Lower vignette than Lomo so faces stay readable.
  {
    name: "Disco",
    category: "Vibrant",
    adjust: [0, 0.2, -0.05, 0.1, 0, -0.05, 0.4, 0.3, 0.1, 0.15, 0.05],
  },

  // ── Cool ──────────────────────────────────────────────────────────
  {
    name: "Cool",
    category: "Cool",
    adjust: [-0.02, 0.05, -0.05, 0.1, 0, 0, -0.05, 0.05, -0.3, 0, 0.05],
  },
  {
    name: "Phocus",
    category: "Cool",
    adjust: [0, 0.1, -0.1, -0.1, 0, -0.05, 0, 0.05, -0.2, 0, 0.12],
  },
  {
    name: "Cross",
    category: "Cool",
    adjust: [0.05, 0.3, 0.05, -0.1, 0.05, 0, 0.3, 0.25, -0.15, 0.1, 0.1],
  },
  // Miami — 80s pastel: soft cool tones, lifted shadows, very low
  // contrast. Reads as Vice / South-Beach poster: airy, not punchy.
  // Distinct from Cool/Phocus (more contrasty, less lifted).
  {
    name: "Miami",
    category: "Cool",
    adjust: [0.05, -0.1, -0.15, 0.2, -0.05, 0.15, -0.05, 0.1, -0.1, 0, 0],
  },

  // ── Moody / cinematic ─────────────────────────────────────────────
  {
    name: "Mood",
    category: "Cinematic",
    adjust: [-0.05, 0.2, -0.25, -0.1, 0, -0.1, 0.05, 0.1, 0.1, 0.18, 0],
  },
  {
    name: "Drama",
    category: "Cinematic",
    adjust: [0, 0.3, -0.2, -0.1, -0.05, 0.15, 0.1, 0.15, 0, 0.18, 0.15],
  },
  {
    name: "Cine",
    category: "Cinematic",
    adjust: [0, 0.15, -0.15, 0.05, -0.05, 0.15, -0.05, 0.1, -0.05, 0.22, 0],
  },
  // Cinestill — modern motion-picture film. Subtle warm cast, mild
  // halated highlights via lifted shadows + slight saturation drop.
  // Reads cinematic without going as moody as Drama.
  {
    name: "Cinestill",
    category: "Cinematic",
    adjust: [0, 0.15, -0.05, 0.05, 0, 0.05, -0.05, 0.1, 0.15, 0.15, 0],
  },
  // Synthwave — 80s neon retrofuture: cool temp, high contrast,
  // saturated, heavy vignette. The only Cinematic preset that pulls
  // temp negative — gives it the Drive / Stranger Things palette
  // without competing with the warm Drama / Cinestill section.
  {
    name: "Synthwave",
    category: "Cinematic",
    adjust: [-0.05, 0.3, -0.15, -0.1, 0.05, -0.15, 0.2, 0.25, -0.25, 0.3, 0.1],
  },

  // ── Faded / bleach ────────────────────────────────────────────────
  {
    name: "Faded",
    category: "Faded",
    adjust: [0.05, -0.2, -0.1, 0.15, -0.1, 0.25, -0.1, 0, 0.05, 0, -0.05],
  },
  {
    name: "Matte",
    category: "Faded",
    adjust: [0.05, -0.15, -0.05, 0.2, -0.05, 0.2, -0.1, 0, 0, 0, 0],
  },
  {
    name: "Bleach",
    category: "Faded",
    adjust: [0, 0.35, -0.1, -0.1, 0.15, 0.05, -0.6, -0.3, 0, 0.1, 0.15],
  },
  // VHS — 80s home video: soft (negative sharpen), low contrast,
  // faintly desaturated, light grain for the analog noise floor.
  // Differentiated from Matte by the deliberate softness + grain.
  {
    name: "VHS",
    category: "Faded",
    adjust: [0.05, -0.15, -0.1, 0.15, -0.05, 0.2, -0.1, -0.05, 0.05, 0.05, -0.15],
    grain: 0.2,
  },

  // ── Vintage / antique processes ───────────────────────────────────
  // Sepia / Tintype / Daguerre all bridge colour → near-mono with
  // strong tinting. They use heavy desat (sat -0.85+, vib -0.5+) but
  // NOT `monochrome: true` — that pass would erase the warm/cool tint
  // that defines each look.
  {
    name: "Sepia",
    category: "Vintage",
    adjust: [0.05, 0.1, -0.1, 0.1, 0, 0, -0.85, -0.5, 0.5, 0.15, 0],
  },
  // Tintype — wet-plate / ferrotype look: cool blue cast, very high
  // contrast, vignette, faint sharpen. The cool tint distinguishes it
  // from Sepia/Daguerre's warm tones.
  {
    name: "Tintype",
    category: "Vintage",
    adjust: [-0.05, 0.4, -0.15, -0.05, 0.1, -0.1, -0.85, -0.5, -0.4, 0.25, 0.15],
  },
  // Daguerre — early-19th-century Daguerreotype: very high contrast,
  // heavy warm-brown tint, dramatic vignette. Similar gamut to Sepia
  // but pushed further in every direction.
  {
    name: "Daguerre",
    category: "Vintage",
    adjust: [0.05, 0.45, -0.15, -0.05, 0.1, -0.05, -0.9, -0.6, 0.55, 0.25, 0.15],
  },

  // ── Monochrome ────────────────────────────────────────────────────
  {
    name: "Mono",
    category: "B&W",
    adjust: [0.05, 0.2, -0.05, 0.1, 0, 0, -1, -1, 0, 0.1, 0],
    monochrome: true,
  },
  {
    name: "B&W Film",
    category: "B&W",
    adjust: [0.05, 0.25, -0.1, 0.15, 0, 0, -1, -1, 0, 0.15, 0.1],
    monochrome: true,
  },
  {
    name: "Noir",
    category: "B&W",
    adjust: [0, 0.4, -0.2, 0.1, 0.1, -0.1, -1, -1, 0, 0.18, 0.18],
    monochrome: true,
  },
];

/** Group recipes by category, preserving registry order within each
 *  group and the category order from FILTER_CATEGORIES. Each entry
 *  carries the recipe's index in FILTER_PRESETS_RECIPES so the panel
 *  can dispatch `patchTool("filterPreset", index)` directly. */
export function groupRecipesByCategory(): Array<{
  category: FilterCategory;
  items: Array<{ recipe: FilterRecipe; index: number }>;
}> {
  const buckets = new Map<FilterCategory, Array<{ recipe: FilterRecipe; index: number }>>();
  for (const cat of FILTER_CATEGORIES) buckets.set(cat, []);
  FILTER_PRESETS_RECIPES.forEach((recipe, index) => {
    buckets.get(recipe.category)?.push({ recipe, index });
  });
  return FILTER_CATEGORIES.map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
