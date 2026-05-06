// ToolStage.tsx — Picks the right tool component based on the active
// tool. Tool components register their stage props via `useStageProps`;
// the persistent `<StageHost>` (mounted once in EditorShell) reads
// those props to drive the single live `<ImageCanvas>`. This keeps the
// Fabric canvas + scene alive across tool swaps so transitions are
// seamless instead of flashing.

import { useEditor } from "./EditorContext";
import { useStageProps } from "./StageHost";
import { AdjustTool } from "./tools/AdjustTool";
import { BgBlurTool } from "./tools/BgBlurTool";
import { BorderTool } from "./tools/BorderTool";
import { ColorPickerTool } from "./tools/ColorPickerTool";
import { CropTool } from "./tools/CropTool";
import { DrawTool } from "./tools/DrawTool";
import { FilterTool } from "./tools/FilterTool";
import { FrameTool } from "./tools/FrameTool";
import { HslTool } from "./tools/HslTool";
import { ImageTool } from "./tools/ImageTool";
import { LevelsTool } from "./tools/LevelsTool";
import { PenTool } from "./tools/PenTool";
import { PerspectiveTool } from "./tools/PerspectiveTool";
import { RedactTool } from "./tools/RedactTool";
import { RemoveBgTool } from "./tools/RemoveBgTool";
import { ShapesTool } from "./tools/ShapesTool";
import { SpotHealTool } from "./tools/SpotHealTool";
import { StickerTool } from "./tools/StickerTool";
import { TextTool } from "./tools/TextTool";

export function ToolStage() {
  const { toolState } = useEditor();
  switch (toolState.activeTool) {
    case "crop":
      return <CropTool />;
    case "adjust":
      return <AdjustTool />;
    case "levels":
      return <LevelsTool />;
    case "hsl":
      return <HslTool />;
    case "filter":
      return <FilterTool />;
    case "perspective":
      return <PerspectiveTool />;
    case "border":
      return <BorderTool />;
    case "redact":
      return <RedactTool />;
    case "draw":
      return <DrawTool />;
    case "text":
      return <TextTool />;
    case "color":
      return <ColorPickerTool />;
    case "spot":
      return <SpotHealTool />;
    case "bgblur":
      return <BgBlurTool />;
    case "shapes":
      return <ShapesTool />;
    case "pen":
      return <PenTool />;
    case "sticker":
      return <StickerTool />;
    case "image":
      return <ImageTool />;
    case "frame":
      return <FrameTool />;
    case "bgrm":
      return <RemoveBgTool />;
    case "move":
      return <MoveTool />;
    default:
      return <DefaultTool />;
  }
}

// Move = Fabric's selection / transform mode. The persistent stage
// owns the canvas; this component just toggles `fabricInteractive`
// while the Move tool is active.
function MoveTool() {
  useStageProps({ fabricInteractive: true });
  return null;
}

function DefaultTool() {
  useStageProps({});
  return null;
}
