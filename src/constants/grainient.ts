// Shared config for the <Grainient /> backdrop. Anything that mounts
// the gradient (landing hero, editor shell) reads from here so the
// palette and motion stay coherent across surfaces — change once,
// applied everywhere.
//
// Palette is anchored to the brand mark in public/icons/logo.svg
// (--coral-400 → --coral-700, midpoint --coral-500 = #f5613a, the
// app primary). `color2` carries the brand hue so the ribbon weaving
// through the field reads as the logo. Flanking stops are pushed to
// extreme luminance — pale-on-pale in light, deep-warm-on-near-black
// in dark — so `color2` stands alone as the only chromatic anchor.

export const GRAINIENT_LIGHT = {
  color1: "#fcf8f4",
  color2: "#f5a793",
  color3: "#FBECDF",
} as const;

export const GRAINIENT_DARK = {
  color1: "#3A2516",
  color2: "#F5613A",
  color3: "#1F140A",
} as const;

// Mode-independent motion + saturation knockdown. The brand coral
// reads as a hint rather than a wall, and translucent panels layered
// on top still pick up enough warmth via backdrop-blur.
export const GRAINIENT_MOTION = {
  timeSpeed: 0.3,
  warpSpeed: 3,
  saturation: 1.0,
} as const;
