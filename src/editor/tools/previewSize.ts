// previewSize.ts — Shared long-edge cap for the per-tool preview
// hooks (Adjust / Filter / Levels / HSL / Background blur). Pulling
// the constants into one module lets the *Tool components ask the
// subject-mask service for a downsample at the *same* size their
// preview hook is going to bake at — so the mask scales once, gets
// cached, and the per-rAF composite skips the full-res `drawImage`
// scale on every frame.

const PREVIEW_LONG_EDGE_MOBILE = 720;
const PREVIEW_LONG_EDGE_DESKTOP = 1440;
const MOBILE_BREAKPOINT_PX = 768;

export function previewLongEdge(): number {
  if (typeof window === "undefined") return PREVIEW_LONG_EDGE_DESKTOP;
  return window.innerWidth < MOBILE_BREAKPOINT_PX
    ? PREVIEW_LONG_EDGE_MOBILE
    : PREVIEW_LONG_EDGE_DESKTOP;
}
