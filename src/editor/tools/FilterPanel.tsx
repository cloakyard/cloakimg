// FilterPanel.tsx — Filter presets + intensity + grain. Live preview
// happens inside FilterTool; the bake into history runs automatically
// when the user switches tools or opens Export (registerPendingApply
// hook), so there's no explicit Apply button — Undo/Redo recover.
//
// Each preset thumb is built from the user's actual working canvas
// (centre-cropped to a square) so the grid previews what each preset
// will do to *this* image rather than a canned sample.

import { useCallback, useEffect, useMemo, useState } from "react";
import { PropRow, Slider } from "../atoms";
import { copyInto, createCanvas, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { applyScopedBake, type MaskScope } from "../ai/subjectMask";
import { useSubjectMask } from "../ai/useSubjectMask";
import { bakeAdjust, bakeAdjustAsync } from "./adjustments";
import { AiSectionHeader } from "../ai/ui/AiSectionHeader";
import { FILTER_PRESETS_RECIPES, groupRecipesByCategory } from "./filterPresets";
import { MaskScopeRow } from "../ai/ui/MaskScopeRow";
import { ScopeGate } from "../ai/ui/ScopeGate";

const THUMB_PX = 96;

export function FilterPanel() {
  const toolState = useToolState();
  const { patchTool, commit } = useEditorActions();
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
  //
  // `bakeAdjust` acquires from the canvas pool — without releasing the
  // intermediate canvas after `toDataURL`, every panel mount leaks a
  // canvas per preset (~12 today). On a phone with a small pool that
  // exhausts the pool quickly: subsequent live-preview hooks then
  // start allocating fresh canvases per slider tick, undoing the
  // pool's whole point. Capture the canvas, encode, release.
  const presetThumbUrls = useMemo(() => {
    if (!sourceThumb) return null;
    return FILTER_PRESETS_RECIPES.map((recipe) => {
      const sliders = recipe.adjust.map((d) => Math.max(0, Math.min(1, 0.5 + d)));
      let baked = bakeAdjust(sourceThumb, sliders, 0);
      // monochrome() mutates in place and returns the same canvas, so
      // we release once at the end. Reassigning `baked` is just for
      // type clarity.
      if (recipe.monochrome) baked = monochrome(baked);
      const dataUrl = baked.toDataURL("image/jpeg", 0.78);
      releaseCanvas(baked);
      return dataUrl;
    });
  }, [sourceThumb]);

  // Group recipes by category for the rendered sections. The grouping
  // is purely registry-driven (no inputs) so it's safe to memoise with
  // an empty dep list — a hot reload that adds a category would force
  // a full module reload anyway.
  const presetGroups = useMemo(() => groupRecipesByCategory(), []);

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
    // Same scope-aware composite as Adjust — see applyScopedBake's
    // header for the contract (degrades to whole-image on detection
    // failure rather than dropping the user's edit).
    out = await applyScopedBake(out, doc.working, scope, subjectMask);
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
  useApplyOnToolSwitch(apply, dirty);

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
        {/* Categorised sections. The `groupRecipesByCategory()` helper
            preserves registry order inside each group and skips empty
            categories, so the rendered structure is data-driven and
            stays in sync if a future preset is re-categorised. Each
            section gets its own scroll container on mobile (one
            horizontal row per category) or a 3-col grid on desktop.
            Section headers (`t-section-label`) match the existing
            panel typography (Adjust, Levels) so the Filter panel
            doesn't introduce a one-off heading style.

            We deliberately do NOT use `<PropRow label="Preset">` here:
            PropRow is for single-row controls (label-on-left, control
            on the right). A multi-section preset grid sits at the top
            level so each section's own header reads as the label. */}
        <div className="flex flex-col gap-3">
          {presetGroups.map(({ category, items }) => (
            <div key={category} className="flex flex-col gap-1.5">
              <div className="t-section-label">{category}</div>
              <div
                // `.no-scrollbar` (not `.scroll-thin`): horizontal
                // preset rows on touch don't benefit from a persistent
                // 6 px scrollbar track — it just adds visual noise
                // under every category. Matches ToolRail's bottom
                // toolbar pattern (also a horizontal touch scroller).
                // No `touch-pan-x` either: per spec, `pan-x` *disables*
                // vertical pans on the element rather than chaining
                // them up. Default `touch-action: auto` lets vertical
                // pans propagate to the parent panel naturally.
                className={
                  isMobile
                    ? "no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
                    : "grid grid-cols-3 gap-1.5"
                }
              >
                {items.map(({ recipe, index }) => {
                  const active = index === toolState.filterPreset;
                  const thumbUrl = presetThumbUrls?.[index];
                  return (
                    <button
                      key={recipe.name}
                      type="button"
                      onClick={() => patchTool("filterPreset", index)}
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
                          alt={recipe.name}
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
                        {recipe.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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
