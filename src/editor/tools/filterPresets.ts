// filterPresets.ts — Adjust-vector recipes for each named preset. The
// vector is added to the user's manual adjust sliders, then the result
// is run through the same pipeline (cssFilterFor or bakeAdjust).
//
// Each preset stores per-slider deltas in -1..+1 (0 == no change).
// Index order matches ADJUST_KEYS in toolState.ts:
//   [exposure, contrast, highlights, shadows, whites, blacks, saturation,
//    vibrance, temp, vignette, sharpen]

export interface FilterRecipe {
  name: string;
  adjust: number[];
  grain?: number;
  monochrome?: boolean;
}

// Ordered so visually similar presets sit next to each other. The grid
// flows: subtle/neutral → warm → vintage warm → saturated → cool →
// cinematic/moody → faded/bleach → sepia → monochrome.
export const FILTER_PRESETS_RECIPES: FilterRecipe[] = [
  { name: "None", adjust: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // Subtle / true-to-life.
  { name: "Natural", adjust: [0, 0.05, -0.05, 0.1, 0, 0, 0.08, 0.12, 0.1, 0, 0.06] },
  { name: "Portra", adjust: [0, 0.05, -0.05, 0.1, 0, 0, -0.05, 0.1, 0.15, 0, 0] },
  { name: "Portrait", adjust: [0.05, 0.05, -0.05, 0.2, 0.05, 0, 0.05, 0.15, 0.2, 0, 0.05] },
  { name: "Soft", adjust: [0.1, -0.1, -0.2, 0.2, 0, 0, -0.05, 0.1, 0.05, 0, -0.1] },
  // Warm → vintage warm.
  { name: "Warm", adjust: [0.05, 0.1, -0.1, 0.15, 0, 0, 0.1, 0.15, 0.25, 0, 0] },
  { name: "Aged", adjust: [0, 0.1, -0.1, 0.1, -0.1, 0.05, -0.15, -0.05, 0.3, 0.2, 0] },
  { name: "70s", adjust: [0.05, -0.1, -0.15, 0.2, -0.1, 0.25, -0.05, 0, 0.4, 0.1, -0.05] },
  {
    name: "Polaroid",
    adjust: [0.05, -0.15, -0.1, 0.2, -0.05, 0.2, -0.1, -0.05, 0.15, 0.05, -0.05],
  },
  // Saturated / punchy.
  { name: "Punch", adjust: [0.05, 0.2, -0.1, 0.05, 0, 0, 0.25, 0.3, 0, 0, 0.15] },
  { name: "Velvia", adjust: [0, 0.25, -0.1, -0.05, 0.1, -0.1, 0.3, 0.25, 0.05, 0.1, 0.1] },
  { name: "Kodachrome", adjust: [0, 0.25, -0.1, -0.05, 0.1, -0.1, 0.25, 0.2, 0.15, 0.1, 0.1] },
  { name: "Verde", adjust: [0, 0.15, -0.15, 0.05, 0, 0, 0.2, 0.25, -0.15, 0, 0] },
  { name: "Lomo", adjust: [0, 0.25, -0.15, 0.05, 0.05, -0.1, 0.35, 0.3, 0.05, 0.4, 0.1] },
  // Cool.
  { name: "Cool", adjust: [-0.02, 0.05, -0.05, 0.1, 0, 0, -0.05, 0.05, -0.3, 0, 0.05] },
  { name: "Phocus", adjust: [0, 0.1, -0.1, -0.1, 0, -0.05, 0, 0.05, -0.2, 0, 0.12] },
  { name: "Cross", adjust: [0.05, 0.3, 0.05, -0.1, 0.05, 0, 0.3, 0.25, -0.15, 0.1, 0.1] },
  // Moody / cinematic.
  { name: "Mood", adjust: [-0.05, 0.2, -0.25, -0.1, 0, -0.1, 0.05, 0.1, 0.1, 0.18, 0] },
  { name: "Drama", adjust: [0, 0.3, -0.2, -0.1, -0.05, 0.15, 0.1, 0.15, 0, 0.18, 0.15] },
  { name: "Cine", adjust: [0, 0.15, -0.15, 0.05, -0.05, 0.15, -0.05, 0.1, -0.05, 0.22, 0] },
  // Faded / bleach.
  { name: "Faded", adjust: [0.05, -0.2, -0.1, 0.15, -0.1, 0.25, -0.1, 0, 0.05, 0, -0.05] },
  { name: "Matte", adjust: [0.05, -0.15, -0.05, 0.2, -0.05, 0.2, -0.1, 0, 0, 0, 0] },
  { name: "Bleach", adjust: [0, 0.35, -0.1, -0.1, 0.15, 0.05, -0.6, -0.3, 0, 0.1, 0.15] },
  // Sepia bridges colour → monochrome (heavy desat + warm cast; not
  // monochrome:true because that pass would erase the tint).
  { name: "Sepia", adjust: [0.05, 0.1, -0.1, 0.1, 0, 0, -0.85, -0.5, 0.5, 0.15, 0] },
  // Monochrome.
  {
    name: "Mono",
    adjust: [0.05, 0.2, -0.05, 0.1, 0, 0, -1, -1, 0, 0.1, 0],
    monochrome: true,
  },
  {
    name: "B&W Film",
    adjust: [0.05, 0.25, -0.1, 0.15, 0, 0, -1, -1, 0, 0.15, 0.1],
    monochrome: true,
  },
  {
    name: "Noir",
    adjust: [0, 0.4, -0.2, 0.1, 0.1, -0.1, -1, -1, 0, 0.18, 0.18],
    monochrome: true,
  },
];
