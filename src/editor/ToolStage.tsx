// ToolStage.tsx — Picks the right tool component based on the active
// tool. Tool components register their stage props via `useStageProps`;
// the persistent `<StageHost>` (mounted once in EditorShell) reads
// those props to drive the single live `<ImageCanvas>`. This keeps the
// Fabric canvas + scene alive across tool swaps so transitions are
// seamless instead of flashing.
//
// The workhorse tools (move / crop / adjust / filter) are imported
// eagerly so the common flows never wait on a chunk. The long tail is
// `React.lazy`-loaded so its code lands in on-demand chunks instead of
// the initial editor bundle — each tool returns null and only registers
// stage props via an effect, so the null Suspense fallback during a
// first-open chunk fetch is invisible (the persistent StageHost keeps
// the canvas painted).

import { lazy, Suspense } from "react";
import { useActiveTool } from "./EditorContext";
import { useStageProps } from "./StageHost";
import type { ToolState } from "./toolState";
import { AdjustTool } from "./tools/AdjustTool";
import { CropTool } from "./tools/CropTool";
import { FilterTool } from "./tools/FilterTool";

const BgBlurTool = lazy(() =>
  import("./tools/BgBlurTool").then((m) => ({ default: m.BgBlurTool })),
);
const BorderTool = lazy(() =>
  import("./tools/BorderTool").then((m) => ({ default: m.BorderTool })),
);
const ColorPickerTool = lazy(() =>
  import("./tools/ColorPickerTool").then((m) => ({ default: m.ColorPickerTool })),
);
const DrawTool = lazy(() => import("./tools/DrawTool").then((m) => ({ default: m.DrawTool })));
const EmojiTool = lazy(() => import("./tools/EmojiTool").then((m) => ({ default: m.EmojiTool })));
const FrameTool = lazy(() => import("./tools/FrameTool").then((m) => ({ default: m.FrameTool })));
const HslTool = lazy(() => import("./tools/HslTool").then((m) => ({ default: m.HslTool })));
const ImageTool = lazy(() => import("./tools/ImageTool").then((m) => ({ default: m.ImageTool })));
const LevelsTool = lazy(() =>
  import("./tools/LevelsTool").then((m) => ({ default: m.LevelsTool })),
);
const PenTool = lazy(() => import("./tools/PenTool").then((m) => ({ default: m.PenTool })));
const PerspectiveTool = lazy(() =>
  import("./tools/PerspectiveTool").then((m) => ({ default: m.PerspectiveTool })),
);
const RedactTool = lazy(() =>
  import("./tools/RedactTool").then((m) => ({ default: m.RedactTool })),
);
const RemoveBgTool = lazy(() =>
  import("./tools/RemoveBgTool").then((m) => ({ default: m.RemoveBgTool })),
);
const ShapesTool = lazy(() =>
  import("./tools/ShapesTool").then((m) => ({ default: m.ShapesTool })),
);
const SpotHealTool = lazy(() =>
  import("./tools/SpotHealTool").then((m) => ({ default: m.SpotHealTool })),
);
const TapFixTool = lazy(() =>
  import("./tools/TapFixTool").then((m) => ({ default: m.TapFixTool })),
);
const TextTool = lazy(() => import("./tools/TextTool").then((m) => ({ default: m.TextTool })));
const TimeOfDayTool = lazy(() =>
  import("./tools/TimeOfDayTool").then((m) => ({ default: m.TimeOfDayTool })),
);
const RelightTool = lazy(() =>
  import("./tools/RelightTool").then((m) => ({ default: m.RelightTool })),
);
const IdPhotoTool = lazy(() =>
  import("./tools/IdPhotoTool").then((m) => ({ default: m.IdPhotoTool })),
);

export function ToolStage() {
  // Only the active tool id matters here — the `activeTool` slice changes
  // solely on a tool switch, so this dispatcher no longer re-renders on
  // every slider tick the way the omnibus `useEditor()` did.
  const activeTool = useActiveTool();
  return <Suspense fallback={null}>{renderTool(activeTool)}</Suspense>;
}

function renderTool(activeTool: ToolState["activeTool"]) {
  switch (activeTool) {
    case "crop":
      return <CropTool />;
    case "idphoto":
      return <IdPhotoTool />;
    case "adjust":
      return <AdjustTool />;
    case "tod":
      return <TimeOfDayTool />;
    case "relight":
      return <RelightTool />;
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
    case "emoji":
      return <EmojiTool />;
    case "image":
      return <ImageTool />;
    case "frame":
      return <FrameTool />;
    case "bgrm":
      return <RemoveBgTool />;
    case "move":
      return <MoveTool />;
    case "tapfix":
      return <TapFixTool />;
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
