// ToolControls.tsx — Top-level dispatcher: pick the right tool's
// property-panel component based on the active tool. Each tool owns its
// own panel module so this file stays small and easy to read.

import { useEditor } from "./EditorContext";
import { AdjustPanel } from "./tools/AdjustPanel";
import { CropPanel } from "./tools/CropTool";
import { DefaultPanel } from "./tools/DefaultPanel";
import { FilterPanel } from "./tools/FilterPanel";
import { FramePanel } from "./tools/FrameTool";
import { RedactPanel } from "./tools/RedactPanel";
import { ResizePanel } from "./tools/ResizePanel";
import { DrawPanel } from "./tools/DrawPanel";
import { PenPanel } from "./tools/PenPanel";
import { TextPanel } from "./tools/TextPanel";
import { WatermarkPanel } from "./tools/WatermarkPanel";
import { ColorPickerPanel } from "./tools/ColorPickerPanel";
import { ImagePanel } from "./tools/ImagePanel";
import { ShapesPanel } from "./tools/ShapesPanel";
import { StickerPanel } from "./tools/StickerPanel";
import { SpotHealPanel } from "./tools/SpotHealPanel";
import { RemoveBgPanel } from "./tools/RemoveBgPanel";

export function ToolControls() {
  const { toolState } = useEditor();
  switch (toolState.activeTool) {
    case "crop":
      return <CropPanel />;
    case "resize":
      return <ResizePanel />;
    case "adjust":
      return <AdjustPanel />;
    case "filter":
      return <FilterPanel />;
    case "redact":
      return <RedactPanel />;
    case "draw":
      return <DrawPanel />;
    case "text":
      return <TextPanel />;
    case "mark":
      return <WatermarkPanel />;
    case "shapes":
      return <ShapesPanel />;
    case "pen":
      return <PenPanel />;
    case "sticker":
      return <StickerPanel />;
    case "image":
      return <ImagePanel />;
    case "frame":
      return <FramePanel />;
    case "color":
      return <ColorPickerPanel />;
    case "spot":
      return <SpotHealPanel />;
    case "bgrm":
      return <RemoveBgPanel />;
    default:
      return <DefaultPanel />;
  }
}
