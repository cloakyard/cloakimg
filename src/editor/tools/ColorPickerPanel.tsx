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
          className="h-14 w-14 shrink-0 rounded-xl border border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] dark:border-dark-border"
          style={{ background: swatch }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="t-mono truncate text-[12.5px] font-semibold">
              {swatch.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => toolState.pickedColor && copyHex(swatch)}
              disabled={!toolState.pickedColor}
              aria-label={pickerCopied ? "Copied" : "Copy hex code"}
              title={pickerCopied ? "Copied" : "Copy hex code"}
              className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                pickerCopied
                  ? "text-coral-600 dark:text-coral-400"
                  : "text-text-muted hover:text-text dark:text-dark-text-muted dark:hover:text-dark-text"
              }`}
            >
              {pickerCopied ? <I.Check size={13} stroke={2.5} /> : <I.Copy size={12} />}
            </button>
          </div>
          <span className="text-[11px] text-text-muted dark:text-dark-text-muted">
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
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-text-muted dark:text-dark-text-muted"
          >
            <I.Refresh size={12} />
          </button>
        </div>
        {/* Mirrors FilterPanel's preset grid: 3-col on desktop, single
            horizontally-scrolling row on mobile so the panel stays
            short. Wider cells let the full hex (with #) breathe instead
            of crowding the card edges. */}
        <div
          // `.no-scrollbar` on horizontal touch scrollers — see
          // FilterPanel for the rationale (no persistent scrollbar
          // noise + clean vertical-pan propagation to the parent).
          className={
            isMobile
              ? "no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              : "grid grid-cols-3 gap-1.5"
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
                className={`flex cursor-pointer flex-col overflow-hidden rounded-md bg-page-bg p-0 dark:bg-dark-page-bg ${
                  isMobile ? "w-18 shrink-0" : ""
                } ${
                  isCopied
                    ? "border-2 border-coral-500"
                    : "border border-border dark:border-dark-border"
                }`}
              >
                <span
                  aria-hidden
                  className="block aspect-square w-full"
                  style={{ background: c }}
                />
                <span className="t-mono flex items-center justify-center gap-0.5 px-1 py-0.75 text-center text-[10px] font-semibold">
                  {isCopied ? (
                    <>
                      <I.Check size={10} stroke={3} />
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

      <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click the canvas to sample any pixel, then tap the copy icon — or tap any palette swatch to
        copy its hex.
      </div>
    </div>
  );
}
