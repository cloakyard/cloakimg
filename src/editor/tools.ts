// tools.ts — The 15 tools the unified editor exposes, plus their group
// metadata for separators in the rail and mobile toolbar.

import type { ComponentType } from "react";
import { I } from "../components/icons";

export type ToolId =
  | "move"
  | "crop"
  | "perspective"
  | "adjust"
  | "levels"
  | "hsl"
  | "filter"
  | "redact"
  | "spot"
  | "bgrm"
  | "bgblur"
  | "draw"
  | "pen"
  | "text"
  | "mark"
  | "shapes"
  | "sticker"
  | "image"
  | "color"
  | "frame"
  | "border"
  | "resize";

export type ToolGroup = "select" | "tone" | "privacy" | "retouch" | "mark" | "color" | "output";

export interface Tool {
  id: ToolId;
  name: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
  group: ToolGroup;
}

// Rail order follows the user's natural editing flow:
//   select → tone → retouch → privacy → mark → sampling → output.
//
// The two big shifts versus a "tools-by-category" rail:
//   • Retouch (Spot heal / Portrait blur / Remove BG) sits BEFORE
//     Mark — users typically clean up the photo before they annotate
//     it, not after.
//   • Privacy (Redact) sits in the upper half rather than buried at
//     the tail. Redact is a brand-defining tool for this app; making
//     it reachable in two scrolls instead of last-in-rail matches the
//     workflow a privacy-conscious user shows up with ("redact a
//     screenshot, then export").
//
// Within each group the most-used tool sits first so a new user
// finds the workhorse without scrolling. Niche / vector / power-user
// tools (Levels, HSL, Pen, Place image) tail their group.
export const ALL_TOOLS: Tool[] = [
  // Select — orient and frame the image. Move is the always-available
  // selection mode; Crop is the most-used edit on any photo; Perspective
  // is the niche straighten-tilted-shot tool.
  { id: "move", name: "Move", icon: I.Move, group: "select" },
  { id: "crop", name: "Crop & rotate", icon: I.Crop, group: "select" },
  { id: "perspective", name: "Perspective", icon: I.Perspective, group: "select" },

  // Tone — colour and brightness. Adjust is the workhorse; Filters
  // is the one-click stylistic option; Levels and Selective colour
  // are the advanced precision tools. All four expose an
  // "Apply to: Whole / Subject / Background" scope inside the panel,
  // backed by the central subject-mask service.
  { id: "adjust", name: "Adjust", icon: I.Sliders, group: "tone" },
  { id: "filter", name: "Filters", icon: I.Wand, group: "tone" },
  { id: "levels", name: "Levels", icon: I.Levels, group: "tone" },
  { id: "hsl", name: "Selective color", icon: I.Hsl, group: "tone" },

  // Retouch — clean up the photo. Comes BEFORE Mark because users
  // fix imperfections / cut backgrounds before adding annotations on
  // top. Spot heal first (cheap, no model); then Portrait blur and
  // Remove BG which both consume the central subject-mask service.
  { id: "spot", name: "Spot heal", icon: I.Eraser, group: "retouch" },
  { id: "bgblur", name: "Portrait blur", icon: I.Focus, group: "retouch" },
  { id: "bgrm", name: "Remove BG", icon: I.Layers, group: "retouch" },

  // Privacy — Redact lives front-and-centre rather than at the rail
  // tail. For this app it's a primary tool: many users open the
  // editor *because* they want to redact a screenshot, and burying
  // it at the bottom adds friction for the most brand-aligned use
  // case.
  { id: "redact", name: "Redact", icon: I.EyeOff, group: "privacy" },

  // Mark — annotations and overlays, ordered by frequency:
  //   • Text first (screenshots, captions — the screenshot-annotation
  //     core).
  //   • Shapes next (arrows + boxes are the second-most-used
  //     screenshot tool).
  //   • Draw (freehand highlight) before Sticker (decorative).
  //   • Watermark / Pen / Place image tail because they're either
  //     niche, vector-power-user, or compositing-power-user.
  { id: "text", name: "Text", icon: I.Type, group: "mark" },
  { id: "shapes", name: "Shapes", icon: I.Square, group: "mark" },
  { id: "draw", name: "Draw", icon: I.Brush, group: "mark" },
  { id: "sticker", name: "Stickers", icon: I.Heart, group: "mark" },
  { id: "mark", name: "Watermark", icon: I.Stamp, group: "mark" },
  { id: "pen", name: "Pen", icon: I.Pen, group: "mark" },
  { id: "image", name: "Place image", icon: I.FileImage, group: "mark" },

  // Sampling — read pixel values mid-edit.
  { id: "color", name: "Color picker", icon: I.Pipette, group: "color" },

  // Output — finishing work before export. Resize first (every
  // export needs it); Frame and Border are decorative.
  { id: "resize", name: "Resize", icon: I.Resize, group: "output" },
  { id: "frame", name: "Frame", icon: I.Frame, group: "output" },
  { id: "border", name: "Border", icon: I.Border, group: "output" },
];

export function findTool(id: ToolId): Tool {
  const t = ALL_TOOLS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown tool: ${id}`);
  return t;
}
