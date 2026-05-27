// ToolControls.tsx — Top-level dispatcher: pick the right tool's
// property-panel component based on the active tool. Each tool owns its
// own panel module so this file stays small and easy to read.

import { useEditor } from "./EditorContext";
import { AdjustPanel } from "./tools/AdjustPanel";
import { BgBlurPanel } from "./tools/BgBlurPanel";
import { BorderPanel } from "./tools/BorderPanel";
import { CropPanel } from "./tools/CropTool";
import { DefaultPanel } from "./tools/DefaultPanel";
import { FilterPanel } from "./tools/FilterPanel";
import { FramePanel } from "./tools/FrameTool";
import { HslPanel } from "./tools/HslPanel";
import { LevelsPanel } from "./tools/LevelsPanel";
import { PerspectivePanel } from "./tools/PerspectivePanel";
import { RedactPanel } from "./tools/RedactPanel";
import { ResizePanel } from "./tools/ResizePanel";
import { DrawPanel } from "./tools/DrawPanel";
import { PenPanel } from "./tools/PenPanel";
import { TextPanel } from "./tools/TextPanel";
import { WatermarkPanel } from "./tools/WatermarkPanel";
import { ColorPickerPanel } from "./tools/ColorPickerPanel";
import { ImagePanel } from "./tools/ImagePanel";
import { MovePanel } from "./tools/MovePanel";
import { ShapesPanel } from "./tools/ShapesPanel";
import { EmojiPanel } from "./tools/EmojiPanel";
import { SpotHealPanel } from "./tools/SpotHealPanel";
import { TapFixPanel } from "./tools/TapFixPanel";
import { TimeOfDayPanel } from "./tools/TimeOfDayPanel";
import { RelightPanel } from "./tools/RelightPanel";
import { RemoveBgPanel } from "./tools/RemoveBgPanel";

export function ToolControls() {
  const { toolState } = useEditor();
  switch (toolState.activeTool) {
    case "move":
      return <MovePanel />;
    case "tapfix":
      return <TapFixPanel />;
    case "crop":
      return <CropPanel />;
    case "resize":
      return <ResizePanel />;
    case "adjust":
      return <AdjustPanel />;
    case "tod":
      return <TimeOfDayPanel />;
    case "relight":
      return <RelightPanel />;
    case "levels":
      return <LevelsPanel />;
    case "hsl":
      return <HslPanel />;
    case "filter":
      return <FilterPanel />;
    case "perspective":
      return <PerspectivePanel />;
    case "border":
      return <BorderPanel />;
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
    case "emoji":
      return <EmojiPanel />;
    case "image":
      return <ImagePanel />;
    case "frame":
      return <FramePanel />;
    case "color":
      return <ColorPickerPanel />;
    case "spot":
      return <SpotHealPanel />;
    case "bgblur":
      return <BgBlurPanel />;
    case "bgrm":
      return <RemoveBgPanel />;
    default:
      return <DefaultPanel />;
  }
}
