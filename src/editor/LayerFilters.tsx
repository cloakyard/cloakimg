// LayerFilters.tsx — Phase F4.5. Inline per-image filter controls
// surfaced from the LayersList row when an Image-typed Fabric object
// is selected. Drives Fabric's built-in `Image.filters` array via the
// `applyFilters()` lifecycle.

import { type FabricImage, filters as FabricFilters } from "fabric";

type FabricFilter = FabricImage["filters"][number];
import { useCallback, useEffect, useState } from "react";
import { useEditor } from "./EditorContext";
import { PropRow, Slider, ToggleSwitch } from "./atoms";

interface ImageFilterState {
  brightness: number; // -1..+1
  contrast: number; // -1..+1
  saturation: number; // -1..+1
  blur: number; // 0..1
  hue: number; // -1..+1 (Fabric's HueRotation expects this range)
  grayscale: boolean;
  sepia: boolean;
}

const DEFAULTS: ImageFilterState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  hue: 0,
  grayscale: false,
  sepia: false,
};

interface FilterMetaTagged {
  cloakFilters?: ImageFilterState;
}

interface Props {
  /** The Fabric Image object whose filters we're editing. */
  image: FabricImage;
}

export function LayerFilters({ image }: Props) {
  const { commit } = useEditor();
  const [state, setState] = useState<ImageFilterState>(
    () => (image as FabricImage & FilterMetaTagged).cloakFilters ?? DEFAULTS,
  );

  // Re-sync if the user opens filters on a different image.
  useEffect(() => {
    setState((image as FabricImage & FilterMetaTagged).cloakFilters ?? DEFAULTS);
  }, [image]);

  const apply = useCallback(
    (next: ImageFilterState) => {
      setState(next);
      (image as FabricImage & FilterMetaTagged).cloakFilters = next;
      const fl: FabricFilter[] = [];
      if (next.brightness !== 0) {
        fl.push(new FabricFilters.Brightness({ brightness: next.brightness }));
      }
      if (next.contrast !== 0) fl.push(new FabricFilters.Contrast({ contrast: next.contrast }));
      if (next.saturation !== 0) {
        fl.push(new FabricFilters.Saturation({ saturation: next.saturation }));
      }
      if (next.blur > 0) fl.push(new FabricFilters.Blur({ blur: next.blur }));
      if (next.hue !== 0) fl.push(new FabricFilters.HueRotation({ rotation: next.hue }));
      if (next.grayscale) fl.push(new FabricFilters.Grayscale());
      if (next.sepia) fl.push(new FabricFilters.Sepia());
      image.filters = fl;
      image.applyFilters();
      image.canvas?.requestRenderAll();
    },
    [image],
  );

  const reset = useCallback(() => {
    apply(DEFAULTS);
    commit("Reset filters");
  }, [apply, commit]);

  const onCommit = useCallback(() => commit("Image filters"), [commit]);

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md border border-border-soft bg-page-bg px-1.5 py-2 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <PropRow
        label="Brightness"
        value={
          state.brightness === 0
            ? "0"
            : `${state.brightness > 0 ? "+" : ""}${(state.brightness * 100).toFixed(0)}%`
        }
      >
        <Slider
          value={(state.brightness + 1) / 2}
          accent
          onChange={(v) => apply({ ...state, brightness: v * 2 - 1 })}
        />
      </PropRow>
      <PropRow
        label="Contrast"
        value={
          state.contrast === 0
            ? "0"
            : `${state.contrast > 0 ? "+" : ""}${(state.contrast * 100).toFixed(0)}%`
        }
      >
        <Slider
          value={(state.contrast + 1) / 2}
          accent
          onChange={(v) => apply({ ...state, contrast: v * 2 - 1 })}
        />
      </PropRow>
      <PropRow
        label="Saturation"
        value={
          state.saturation === 0
            ? "0"
            : `${state.saturation > 0 ? "+" : ""}${(state.saturation * 100).toFixed(0)}%`
        }
      >
        <Slider
          value={(state.saturation + 1) / 2}
          accent
          onChange={(v) => apply({ ...state, saturation: v * 2 - 1 })}
        />
      </PropRow>
      <PropRow label="Blur" value={`${(state.blur * 100).toFixed(0)}%`}>
        <Slider value={state.blur} accent onChange={(v) => apply({ ...state, blur: v })} />
      </PropRow>
      <PropRow label="Hue" value={`${state.hue === 0 ? 0 : Math.round(state.hue * 180)}°`}>
        <Slider
          value={(state.hue + 1) / 2}
          accent
          onChange={(v) => apply({ ...state, hue: v * 2 - 1 })}
        />
      </PropRow>
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-text-muted dark:text-dark-text-muted">Grayscale</span>
        <ToggleSwitch on={state.grayscale} onChange={(on) => apply({ ...state, grayscale: on })} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-text-muted dark:text-dark-text-muted">Sepia</span>
        <ToggleSwitch on={state.sepia} onChange={(on) => apply({ ...state, sepia: on })} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="btn btn-secondary btn-xs flex-1" onClick={reset}>
          Reset
        </button>
        <button type="button" className="btn btn-primary btn-xs flex-1" onClick={onCommit}>
          Commit
        </button>
      </div>
    </div>
  );
}
