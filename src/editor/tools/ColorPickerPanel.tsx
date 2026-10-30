// ColorPickerPanel.tsx — The eyedropper sample plus the dominant
// colour palette, combined into a single panel. The two used to be
// separate tools, but they're functionally one workflow ("get a
// colour out of the image"), so collapsing them removes a redundant
// rail entry and keeps the colour-related affordances together.

import { useCallback, useEffect, useRef, useState } from "react";
import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";
import { extractPalette } from "./palette";

export function ColorPickerPanel() {
  const { toolState, doc, layout } = useEditor();
  const isMobile = layout === "mobile";
  const swatch = toolState.pickedColor ?? "#cccccc";
  const [colors, setColors] = useState<string[]>([]);
  // Tracks the most recently copied hex so we can flash a "Copied!"
  // affordance — silent clipboard writes leave the user wondering if
  // anything happened, especially on mobile where there's no toast.
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!doc) return;
    setColors(extractPalette(doc.working, 5));
  }, [doc]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyHex = useCallback((hex: string) => {
    void navigator.clipboard.writeText(hex.toUpperCase()).catch(() => {});
    setCopied(hex);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(null), 1200);
  }, []);

  const reExtract = () => {
    if (!doc) return;
    setColors(extractPalette(doc.working, 5));
  };

  const pickerCopied = !!toolState.pickedColor && copied === swatch;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div
          role="img"
          aria-label="Picked color swatch"
          className="h-14 w-14 shrink-0 rounded-lg border border-border shadow-[none]"
          style={{ background: swatch }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums truncate text-[0.8125rem] font-medium">
              {swatch.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => toolState.pickedColor && copyHex(swatch)}
              disabled={!toolState.pickedColor}
              aria-label={pickerCopied ? "Copied" : "Copy hex code"}
              title={pickerCopied ? "Copied" : "Copy hex code"}
              className="btn btn-ghost btn-icon"
            >
              {pickerCopied ? (
                <I.Check size={16} aria-hidden="true" />
              ) : (
                <I.Copy size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          <span className="text-[0.8125rem] text-text-muted">
            {pickerCopied
              ? "Hex copied to clipboard"
              : toolState.pickedColor
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
            className="btn btn-ghost btn-icon"
          >
            <I.Refresh size={16} aria-hidden="true" />
          </button>
        </div>
        {/* Shared responsive tiles; mobile keeps a short horizontal strip. */}
        <div
          // `.no-scrollbar` on horizontal touch scrollers — see
          // FilterPanel for the rationale (no persistent scrollbar
          // noise + clean vertical-pan propagation to the parent).
          className={
            isMobile
              ? "air-segments img-presets img-presets--strip no-scrollbar overflow-x-auto"
              : "air-segments img-presets"
          }
        >
          {colors.map((c) => {
            const isCopied = copied === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => copyHex(c)}
                title={isCopied ? "Copied" : `Copy ${c.toUpperCase()}`}
                aria-label={isCopied ? `${c.toUpperCase()} copied` : `Copy ${c.toUpperCase()}`}
                className="img-preset"
                data-copied={isCopied || undefined}
              >
                <span
                  aria-hidden
                  className="block aspect-square w-full"
                  style={{ background: c }}
                />
                <span className="img-preset-label tabular-nums">
                  {isCopied ? (
                    <>
                      <I.Check size={16} />
                      Copied
                    </>
                  ) : (
                    c.toUpperCase()
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[0.8125rem] leading-relaxed text-text-muted">
        Click the canvas to sample any pixel, then tap the copy icon — or tap any palette swatch to
        copy its hex.
      </div>
    </div>
  );
}
