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

// Rail order follows the user's editing stages roughly left-to-right:
// select → tone → mark → retouch → sampling → output → privacy.
// Within each group the most-used tool sits first (Adjust before
// Filters, Text before Shapes, Resize before Frame), so a brand-new
// user finds the workhorse without scrolling. Advanced / niche tools
// (Levels, HSL, Pen, Watermark) tail their group. Privacy (redact)
// sits at the very end so it stays out of the way during normal
// editing but is still reachable in one click.
export const ALL_TOOLS: Tool[] = [
  // Select — work with the image as a whole.
  { id: "move", name: "Move", icon: I.Move, group: "select" },
  { id: "crop", name: "Crop & rotate", icon: I.Crop, group: "select" },
  { id: "perspective", name: "Perspective", icon: I.Perspective, group: "select" },

  // Tone — colour and brightness. Adjust is the workhorse; Filters
  // is the one-click stylistic option; Levels and Selective colour
  // are the advanced precision tools.
  { id: "adjust", name: "Adjust", icon: I.Sliders, group: "tone" },
  { id: "filter", name: "Filters", icon: I.Wand, group: "tone" },
  { id: "levels", name: "Levels", icon: I.Levels, group: "tone" },
  { id: "hsl", name: "Selective color", icon: I.Hsl, group: "tone" },

  // Mark — annotations and overlays. Text and Shapes lead since
  // they're the screenshot-annotation core; freehand (Draw, Pen)
  // sit in the middle; decorative / branding tools (Sticker, Place
  // image, Watermark) tail.
  { id: "text", name: "Text", icon: I.Type, group: "mark" },
  { id: "shapes", name: "Shapes", icon: I.Square, group: "mark" },
  { id: "draw", name: "Draw", icon: I.Brush, group: "mark" },
  { id: "pen", name: "Pen", icon: I.Pen, group: "mark" },
  { id: "sticker", name: "Stickers", icon: I.Heart, group: "mark" },
  { id: "image", name: "Place image", icon: I.FileImage, group: "mark" },
  { id: "mark", name: "Watermark", icon: I.Stamp, group: "mark" },

  // Retouch — fix imperfections.
  { id: "spot", name: "Spot heal", icon: I.Eraser, group: "retouch" },
  { id: "bgrm", name: "Remove BG", icon: I.Layers, group: "retouch" },

  // Sampling — read pixel values.
  { id: "color", name: "Color picker", icon: I.Pipette, group: "color" },

  // Output — finishing work before export. Resize first (every
  // export needs it); Frame and Border are decorative.
  { id: "resize", name: "Resize", icon: I.Resize, group: "output" },
  { id: "frame", name: "Frame", icon: I.Frame, group: "output" },
  { id: "border", name: "Border", icon: I.Border, group: "output" },

  // Privacy.
  { id: "redact", name: "Redact", icon: I.EyeOff, group: "privacy" },
];

export function findTool(id: ToolId): Tool {
  const t = ALL_TOOLS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown tool: ${id}`);
  return t;
}
