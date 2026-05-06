// FilterPanel.tsx — Filter presets + intensity + grain. Live preview
// happens inside FilterTool; the bake into history runs automatically
// when the user switches tools or opens Export (registerPendingApply
// hook), so there's no explicit Apply button — Undo/Redo recover.
//
// Each preset thumb is built from the user's actual working canvas
// (centre-cropped to a square) so the grid previews what each preset
// will do to *this* image rather than a canned sample.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropRow, Slider } from "../atoms";
import { copyInto, createCanvas, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { bakeAdjust, bakeAdjustAsync } from "./adjustments";
import { AiSectionHeader } from "./AiSectionHeader";
import { FILTER_PRESETS_RECIPES } from "./filterPresets";
import { MaskScopeRow } from "./MaskScopeRow";
import { ScopeGate } from "./ScopeGate";

const THUMB_PX = 96;

export function FilterPanel() {
  const toolState = useToolState();
  const { patchTool, commit, registerPendingApply } = useEditorActions();
  const { doc, layout } = useEditorReadOnly();
  const subjectMask = useSubjectMask();
  const isMobile = layout === "mobile";
  const scope = (toolState.filterScope as MaskScope) ?? 0;

  // Build a small square thumb from doc.working once per panel mount.
  // The Filter tool is usually opened mid-edit, so this captures the
  // current state of the image. Re-mounting (toggle tools and back)
  // refreshes the thumbs.
  const [sourceThumb, setSourceThumb] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc?.working) {
      setSourceThumb(null);
      return;
    }
    setSourceThumb(makeSquareThumb(doc.working, THUMB_PX));
  }, [doc?.working]);

  // Bake every preset against the source thumb. Intensity is fixed at
  // 1.0 here so the grid showcases each preset's full character; the
  // intensity slider below scales the bake at apply time.
  const presetThumbUrls = useMemo(() => {
    if (!sourceThumb) return null;
    return FILTER_PRESETS_RECIPES.map((recipe) => {
      const sliders = recipe.adjust.map((d) => Math.max(0, Math.min(1, 0.5 + d)));
      let baked = bakeAdjust(sourceThumb, sliders, 0);
      if (recipe.monochrome) baked = monochrome(baked);
      return baked.toDataURL("image/jpeg", 0.78);
    });
  }, [sourceThumb]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const preset = FILTER_PRESETS_RECIPES[toolState.filterPreset];
    if (!preset) return;
    const final = preset.adjust.map((delta, i) => {
      const base = toolState.adjust[i] ?? 0.5;
      return Math.min(1, Math.max(0, base + delta * toolState.filterIntensity));
    });
    // Async chunked bake yields between row batches so the busy
    // spinner overlay keeps animating during the full-resolution
    // pass — Android Chrome doesn't run CSS transform animations on
    // the compositor while the main thread is JS-busy, and the
    // periodic yields are what give the browser a chance to paint
    // new spinner frames.
    let out = await bakeAdjustAsync(doc.working, final, toolState.grain);
    if (preset.monochrome) out = monochrome(out);
    // Same scope-aware composite as Adjust — when the user picked
    // Subject / Background, splice the filter result against the
    // original so it only lands in-scope. Detection is awaited at
    // commit time so the bake is honest about what the user asked
    // for; preview already shows the scoped result.
    if (scope !== 0) {
      try {
        const mask = subjectMask.peek() ?? (await subjectMask.request());
        const scoped = applyMaskScope(doc.working, out, mask, scope);
        if (scoped !== out) {
          releaseCanvas(out);
          out = scoped;
        }
      } catch {
        // Fall through to whole-image bake.
      }
    }
    copyInto(doc.working, out);
    // bakeAdjustAsync acquires from the canvas pool; once copyInto has
    // mirrored the pixels into doc.working we can hand the bake canvas
    // back so the next preset apply reuses the same buffer.
    releaseCanvas(out);
    patchTool("filterPreset", 0);
    patchTool("filterIntensity", 0.65);
    patchTool("grain", 0);
    patchTool("filterScope", 0);
    commit("Filter");
  }, [commit, doc, patchTool, scope, subjectMask, toolState]);

  const dirty = toolState.filterPreset !== 0 || toolState.grain > 0;

  // Auto-flush the preview into history if the user switches tools
  // mid-edit instead of clicking Apply.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!dirty) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [dirty, registerPendingApply]);

  // Gate the preset grid + sliders while a non-Whole scope is picked
  // and the mask is still loading; otherwise tapping a preset would
  // bake whole-image (mask=null fallback) and the result wouldn't
  // match the user's "Subject" / "Background" intent.
  const gated = scope !== 0 && subjectMask.state.status !== "ready";

  return (
    <>
      <AiSectionHeader />
      <MaskScopeRow scope={toolState.filterScope} onScope={(i) => patchTool("filterScope", i)} />
      <ScopeGate disabled={gated}>
        <PropRow label="Preset">
          {/* On mobile the presets reflow into a single horizontally
              scrolling row so the panel stays short and the canvas above
              keeps its height. Desktop keeps the 3-up grid where vertical
              space is plentiful. */}
          <div
            className={
              isMobile
                ? "scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
                : "grid grid-cols-3 gap-1.5"
            }
          >
            {FILTER_PRESETS_RECIPES.map((preset, i) => {
              const active = i === toolState.filterPreset;
              const thumbUrl = presetThumbUrls?.[i];
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => patchTool("filterPreset", i)}
                  aria-pressed={active}
                  className={`cursor-pointer overflow-hidden rounded-md bg-page-bg p-0 dark:bg-dark-page-bg ${
                    isMobile ? "w-18 shrink-0" : ""
                  } ${
                    active
                      ? "border-2 border-coral-500"
                      : "border border-border dark:border-dark-border"
                  }`}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={preset.name}
                      className="block aspect-square w-full object-cover"
                    />
                  ) : (
                    <div
                      className="aspect-square w-full"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--page-bg) 0%, var(--surface) 100%)",
                      }}
                    />
                  )}
                  <div className="px-1 py-0.75 text-center text-[10px] font-semibold">
                    {preset.name}
                  </div>
                </button>
              );
            })}
          </div>
        </PropRow>
        <PropRow label="Intensity" value={`${Math.round(toolState.filterIntensity * 100)}%`}>
          <Slider
            value={toolState.filterIntensity}
            accent
            defaultValue={0.65}
            onChange={(v) => patchTool("filterIntensity", v)}
          />
        </PropRow>
        <PropRow label="Grain" value={`${Math.round(toolState.grain * 100)}%`}>
          <Slider
            value={toolState.grain}
            defaultValue={0}
            onChange={(v) => patchTool("grain", v)}
          />
        </PropRow>
      </ScopeGate>
    </>
  );
}

function monochrome(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d");
  if (!ctx) return src;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] ?? 0) * 0.2126 + (d[i + 1] ?? 0) * 0.7152 + (d[i + 2] ?? 0) * 0.0722;
    d[i] = lum;
    d[i + 1] = lum;
    d[i + 2] = lum;
  }
  ctx.putImageData(img, 0, 0);
  return src;
}

function makeSquareThumb(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const out = createCanvas(size, size);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.imageSmoothingQuality = "high";
  // Cover-fit centre crop.
  const ratio = Math.min(src.width, src.height) / size;
  const cw = size * ratio;
  const ch = size * ratio;
  const cx = (src.width - cw) / 2;
  const cy = (src.height - ch) / 2;
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, size, size);
  return out;
}
