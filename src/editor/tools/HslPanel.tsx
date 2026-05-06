// HslPanel.tsx — Eight band swatches across the top, three sliders
// (Hue / Saturation / Luminance) for the active band underneath.
// Mirrors Lightroom's HSL panel structure so users coming from there
// don't have to relearn the workflow.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { I } from "../../components/icons";
import { NumericReadout, PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import {
  bakeHsl,
  HSL_BAND_CENTERS,
  HSL_BAND_COUNT,
  HSL_BAND_NAMES,
  hslIdentity,
  type HslParams,
  isHslIdentity,
} from "./hsl";
import { MaskScopeRow } from "./MaskScopeRow";

export function HslPanel() {
  const { toolState, patchTool, doc, commit, registerPendingApply } = useEditor();
  const subjectMask = useSubjectMask();
  const band = toolState.hslBand;
  const scope = (toolState.hslScope as MaskScope) ?? 0;

  const params = useMemo<HslParams>(
    () => ({
      hue: toolState.hslHue,
      sat: toolState.hslSat,
      lum: toolState.hslLum,
    }),
    [toolState.hslHue, toolState.hslSat, toolState.hslLum],
  );

  const dirty = !isHslIdentity(params);

  const reset = useCallback(() => {
    const id = hslIdentity();
    patchTool("hslHue", id.hue);
    patchTool("hslSat", id.sat);
    patchTool("hslLum", id.lum);
    patchTool("hslScope", 0);
  }, [patchTool]);

  const resetBand = useCallback(() => {
    const hue = toolState.hslHue.slice();
    const sat = toolState.hslSat.slice();
    const lum = toolState.hslLum.slice();
    hue[band] = 0.5;
    sat[band] = 0.5;
    lum[band] = 0.5;
    patchTool("hslHue", hue);
    patchTool("hslSat", sat);
    patchTool("hslLum", lum);
  }, [band, patchTool, toolState.hslHue, toolState.hslLum, toolState.hslSat]);

  const apply = useCallback(async () => {
    if (!doc || !dirty) return;
    let out = bakeHsl(doc.working, params);
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
    // bakeHsl pulls from the canvas pool; once copyInto has mirrored
    // the pixels we can return the bake canvas for reuse.
    releaseCanvas(out);
    reset();
    commit("Selective colour");
  }, [commit, dirty, doc, params, reset, scope, subjectMask]);

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

  const setBandValue = useCallback(
    (key: "hslHue" | "hslSat" | "hslLum", value: number) => {
      const cur = toolState[key].slice();
      cur[band] = value;
      patchTool(key, cur);
    },
    [band, patchTool, toolState],
  );

  const hueVal = toolState.hslHue[band] ?? 0.5;
  const satVal = toolState.hslSat[band] ?? 0.5;
  const lumVal = toolState.hslLum[band] ?? 0.5;

  return (
    <>
      <MaskScopeRow scope={toolState.hslScope} onScope={(i) => patchTool("hslScope", i)} />
      <PropRow label="Color band">
        <div className="grid grid-cols-8 gap-1">
          {HSL_BAND_NAMES.map((name, i) => {
            const active = i === band;
            const isDirty = bandIsDirty(toolState, i);
            const center = HSL_BAND_CENTERS[i] ?? 0;
            return (
              <button
                key={name}
                type="button"
                onClick={() => patchTool("hslBand", i)}
                aria-label={name}
                aria-pressed={active}
                title={name}
                className={`relative flex aspect-square cursor-pointer items-center justify-center rounded border p-0 ${
                  active
                    ? "border-coral-500 ring-2 ring-coral-500/40"
                    : "border-border-soft dark:border-dark-border-soft"
                }`}
                style={{ background: `hsl(${center}, 75%, 50%)` }}
              >
                {isDirty && (
                  <span
                    aria-hidden
                    className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-white"
                    style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 text-center text-[11px] font-semibold text-text-muted dark:text-dark-text-muted">
          {HSL_BAND_NAMES[band]}
        </div>
      </PropRow>

      <PropRow
        label="Hue"
        valueInput={
          <NumericReadout
            display={fmtSigned((hueVal - 0.5) * 120, 0)}
            normalized={hueVal}
            fromNormalized={(n) => (n - 0.5) * 120}
            toNormalized={(real) => real / 120 + 0.5}
            onCommit={(n) => setBandValue("hslHue", n)}
          />
        }
      >
        <Slider
          value={hueVal}
          accent={Math.abs(hueVal - 0.5) > 1e-3}
          defaultValue={0.5}
          onChange={(v) => setBandValue("hslHue", v)}
        />
      </PropRow>

      <PropRow
        label="Saturation"
        valueInput={
          <NumericReadout
            display={fmtSigned((satVal - 0.5) * 200, 0)}
            normalized={satVal}
            fromNormalized={(n) => (n - 0.5) * 200}
            toNormalized={(real) => real / 200 + 0.5}
            onCommit={(n) => setBandValue("hslSat", n)}
          />
        }
      >
        <Slider
          value={satVal}
          accent={Math.abs(satVal - 0.5) > 1e-3}
          defaultValue={0.5}
          onChange={(v) => setBandValue("hslSat", v)}
        />
      </PropRow>

      <PropRow
        label="Luminance"
        valueInput={
          <NumericReadout
            display={fmtSigned((lumVal - 0.5) * 100, 0)}
            normalized={lumVal}
            fromNormalized={(n) => (n - 0.5) * 100}
            toNormalized={(real) => real / 100 + 0.5}
            onCommit={(n) => setBandValue("hslLum", n)}
          />
        }
      >
        <Slider
          value={lumVal}
          accent={Math.abs(lumVal - 0.5) > 1e-3}
          defaultValue={0.5}
          onChange={(v) => setBandValue("hslLum", v)}
        />
      </PropRow>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-xs flex-1 justify-center"
          onClick={resetBand}
          disabled={!bandIsDirty(toolState, band)}
        >
          Reset {HSL_BAND_NAMES[band]}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-xs flex-1 justify-center"
          onClick={reset}
          disabled={!dirty}
        >
          <I.Refresh size={12} />
          Reset all
        </button>
      </div>
    </>
  );
}

function bandIsDirty(
  ts: { hslHue: number[]; hslSat: number[]; hslLum: number[] },
  i: number,
): boolean {
  return (
    Math.abs((ts.hslHue[i] ?? 0.5) - 0.5) > 1e-3 ||
    Math.abs((ts.hslSat[i] ?? 0.5) - 0.5) > 1e-3 ||
    Math.abs((ts.hslLum[i] ?? 0.5) - 0.5) > 1e-3
  );
}

void HSL_BAND_COUNT;

function fmtSigned(n: number, digits: number): string {
  const r = digits > 0 ? n.toFixed(digits) : Math.round(n).toString();
  return n >= 0 ? `+${r}` : r;
}
