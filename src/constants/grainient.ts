// Shared config for the <Grainient /> backdrop. Anything that mounts
// the gradient (landing hero, editor shell) reads from here so the
// palette and motion stay coherent across surfaces — change once,
// applied everywhere.
//
// Palette is anchored to the brand mark in public/icons/logo.svg
// (Tailwind orange-400 → orange-700). Both modes use orange-400 as
// `color2` so the ribbon weaving through the field is the logo hue.
// Flanking stops are pushed to extreme luminance — pale-on-pale in
// light, deep-warm-on-near-black in dark — so `color2` stands alone
// as the only chromatic anchor.

export const GRAINIENT_LIGHT = {
  color1: "#F7E2D0",
  color2: "#FB923C",
  color3: "#FBECDF",
} as const;

export const GRAINIENT_DARK = {
  color1: "#3A2516",
  color2: "#FB923C",
  color3: "#1F140A",
} as const;

// Mode-independent motion + saturation knockdown. `saturation: 0.3`
// pulls the chroma down 70% so the brand orange reads as a hint, not
// a wall, and translucent panels layered on top still pick up enough
// warmth via backdrop-blur.
export const GRAINIENT_MOTION = {
  timeSpeed: 0.3,
  warpSpeed: 3,
  saturation: 0.3,
} as const;
