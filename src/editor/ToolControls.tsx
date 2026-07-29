// ToolControls.tsx — Top-level dispatcher: pick the right tool's
// property-panel component based on the active tool. Each tool owns its
// own panel module so this file stays small and easy to read.
//
// Workhorse panels (move / crop / resize / adjust / filter) are eager so
// the common flows never wait on a chunk; the long tail is
// `React.lazy`-loaded into on-demand chunks to keep the initial editor
// bundle small. The shared fallback gives those first-open chunks a
// stable measured surface instead of flashing an empty mobile sheet.

import { lazy, Suspense } from "react";
import { Spinner } from "./atoms";
import { useActiveTool } from "./EditorContext";
import { AdjustPanel } from "./tools/AdjustPanel";
import { CropPanel } from "./tools/CropTool";
import { DefaultPanel } from "./tools/DefaultPanel";
import { FilterPanel } from "./tools/FilterPanel";
import { MovePanel } from "./tools/MovePanel";
import { ResizePanel } from "./tools/ResizePanel";
import type { ToolState } from "./toolState";

const BgBlurPanel = lazy(() =>
  import("./tools/BgBlurPanel").then((m) => ({ default: m.BgBlurPanel })),
);
const BorderPanel = lazy(() =>
  import("./tools/BorderPanel").then((m) => ({ default: m.BorderPanel })),
);
const FramePanel = lazy(() => import("./tools/FrameTool").then((m) => ({ default: m.FramePanel })));
const HslPanel = lazy(() => import("./tools/HslPanel").then((m) => ({ default: m.HslPanel })));
const LevelsPanel = lazy(() =>
  import("./tools/LevelsPanel").then((m) => ({ default: m.LevelsPanel })),
);
const PerspectivePanel = lazy(() =>
  import("./tools/PerspectivePanel").then((m) => ({ default: m.PerspectivePanel })),
);
const RedactPanel = lazy(() =>
  import("./tools/RedactPanel").then((m) => ({ default: m.RedactPanel })),
);
const DrawPanel = lazy(() => import("./tools/DrawPanel").then((m) => ({ default: m.DrawPanel })));
const PenPanel = lazy(() => import("./tools/PenPanel").then((m) => ({ default: m.PenPanel })));
const TextPanel = lazy(() => import("./tools/TextPanel").then((m) => ({ default: m.TextPanel })));
const WatermarkPanel = lazy(() =>
  import("./tools/WatermarkPanel").then((m) => ({ default: m.WatermarkPanel })),
);
const ColorPickerPanel = lazy(() =>
  import("./tools/ColorPickerPanel").then((m) => ({ default: m.ColorPickerPanel })),
);
const ImagePanel = lazy(() =>
  import("./tools/ImagePanel").then((m) => ({ default: m.ImagePanel })),
);
const ShapesPanel = lazy(() =>
  import("./tools/ShapesPanel").then((m) => ({ default: m.ShapesPanel })),
);
const EmojiPanel = lazy(() =>
  import("./tools/EmojiPanel").then((m) => ({ default: m.EmojiPanel })),
);
const SpotHealPanel = lazy(() =>
  import("./tools/SpotHealPanel").then((m) => ({ default: m.SpotHealPanel })),
);
const TapFixPanel = lazy(() =>
  import("./tools/TapFixPanel").then((m) => ({ default: m.TapFixPanel })),
);
const TimeOfDayPanel = lazy(() =>
  import("./tools/TimeOfDayPanel").then((m) => ({ default: m.TimeOfDayPanel })),
);
const RelightPanel = lazy(() =>
  import("./tools/RelightPanel").then((m) => ({ default: m.RelightPanel })),
);
const RemoveBgPanel = lazy(() =>
  import("./tools/RemoveBgPanel").then((m) => ({ default: m.RemoveBgPanel })),
);

export function ToolControls() {
  const activeTool = useActiveTool();
  return <Suspense fallback={<ToolPanelFallback />}>{renderPanel(activeTool)}</Suspense>;
}

function ToolPanelFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-tool-panel-loading
      className="flex min-h-32 items-center justify-center text-text-muted"
    >
      <Spinner size={20} label="Loading controls…" />
    </div>
  );
}

function renderPanel(activeTool: ToolState["activeTool"]) {
  switch (activeTool) {
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
