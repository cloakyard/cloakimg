// ImageTool.tsx — Place an image as its own draggable, scalable layer
// on the canvas. Behaves like the Move tool while active so existing
// images can be selected, repositioned, or sent forward/back via the
// panel or the Layers list.

import { useStageProps } from "../StageHost";

export function ImageTool() {
  useStageProps({ fabricInteractive: true });
  return null;
}
