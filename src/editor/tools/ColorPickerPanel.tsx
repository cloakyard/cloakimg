// ColorPickerPanel.tsx — The eyedropper sample plus the dominant
// colour palette, combined into a single panel. The two used to be
// separate tools, but they're functionally one workflow ("get a
// colour out of the image"), so collapsing them removes a redundant
// rail entry and keeps the colour-related affordances together.

import { useEffect, useState } from "react";
import { I } from "../../icons";
import { useEditor } from "../EditorContext";
import { extractPalette } from "./palette";

export function ColorPickerPanel() {
  const { toolState, doc } = useEditor();
  const swatch = toolState.pickedColor ?? "#cccccc";
  const [colors, setColors] = useState<string[]>([]);

  useEffect(() => {
    if (!doc) return;
    setColors(extractPalette(doc.working, 5));
  }, [doc]);

  const reExtract = () => {
    if (!doc) return;
    setColors(extractPalette(doc.working, 5));
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div
          aria-label="Picked color swatch"
          className="h-14 w-14 rounded-xl border border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] dark:border-dark-border"
          style={{ background: swatch }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="t-mono text-[12.5px] font-semibold">{swatch.toUpperCase()}</span>
          <span className="text-[11px] text-text-muted dark:text-dark-text-muted">
            {toolState.pickedColor
              ? "Click on the canvas to sample again"
              : "Click on the canvas to sample a pixel"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="t-section-label">Palette</span>
          <button
            type="button"
            onClick={reExtract}
            aria-label="Re-extract palette"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-text-muted dark:text-dark-text-muted"
          >
            <I.Refresh size={12} />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(c).catch(() => {});
              }}
              title={`Copy ${c}`}
              className="relative aspect-square cursor-pointer rounded-lg border border-border-soft p-0 dark:border-dark-border-soft"
              style={{ background: c }}
            >
              <span className="t-mono absolute right-1 bottom-1 left-1 rounded-sm bg-black/40 px-1 py-px text-center text-[9px] font-semibold text-white">
                {c.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click the canvas to sample any pixel, or tap a palette swatch to copy its hex.
      </div>
    </div>
  );
}
