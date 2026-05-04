// tools.ts — The 15 tools the unified editor exposes, plus their group
// metadata for separators in the rail and mobile toolbar.

import type { ComponentType } from "react";
import { I } from "../components/icons";

export type ToolId =
  | "move"
  | "crop"
  | "adjust"
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
  | "resize";

export type ToolGroup = "select" | "tone" | "privacy" | "retouch" | "mark" | "color" | "output";

export interface Tool {
  id: ToolId;
  name: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
  group: ToolGroup;
}

// Rail order is roughly the user's editing stages: select → tone →
// annotations → retouch → sampling → output → privacy. Privacy
// (redact) sits at the very end so it stays out of the way during
// normal editing but is still reachable in one click.
export const ALL_TOOLS: Tool[] = [
  { id: "move", name: "Move", icon: I.Move, group: "select" },
  { id: "crop", name: "Crop & rotate", icon: I.Crop, group: "select" },
  { id: "adjust", name: "Adjust", icon: I.Sliders, group: "tone" },
  { id: "filter", name: "Filters", icon: I.Wand, group: "tone" },
  { id: "text", name: "Text", icon: I.Type, group: "mark" },
  { id: "shapes", name: "Shapes", icon: I.Square, group: "mark" },
  { id: "image", name: "Place image", icon: I.FileImage, group: "mark" },
  { id: "sticker", name: "Stickers", icon: I.Heart, group: "mark" },
  { id: "mark", name: "Watermark", icon: I.Stamp, group: "mark" },
  { id: "draw", name: "Draw", icon: I.Brush, group: "mark" },
  { id: "pen", name: "Pen", icon: I.Pen, group: "mark" },
  { id: "spot", name: "Spot heal", icon: I.Eraser, group: "retouch" },
  { id: "bgrm", name: "Remove BG", icon: I.Layers, group: "retouch" },
  { id: "color", name: "Color picker", icon: I.Pipette, group: "color" },
  { id: "frame", name: "Frame", icon: I.Frame, group: "output" },
  { id: "resize", name: "Resize", icon: I.Resize, group: "output" },
  { id: "redact", name: "Redact", icon: I.EyeOff, group: "privacy" },
];

export function findTool(id: ToolId): Tool {
  const t = ALL_TOOLS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown tool: ${id}`);
  return t;
}
