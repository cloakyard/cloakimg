// TextPanel.tsx — Caption text + font/weight/alignment/size/colour
// controls. Phase F2-B-3: text layers are Fabric `IText` objects, so
// the panel reads/writes the active selection live.
//
// When no IText is selected, panel values feed the *next* IText created
// by clicking on the canvas (via TextTool). When one is selected, panel
// changes apply to that object immediately.

import { type IText, Path } from "fabric";
import { useCallback, useEffect, useState } from "react";
import { ColorPicker } from "../ColorPicker";
import { useEditor } from "../EditorContext";
import { PropRow, Segment, Slider } from "../atoms";
import { TEXT_TAG } from "./TextTool";

export const FONT_OPTIONS = [
  { label: "Inter", stack: "Inter, system-ui, sans-serif" },
  { label: "Serif", stack: '"Instrument Serif", Georgia, ui-serif, serif' },
  { label: "Sans", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: "Mono", stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
] as const;

export const WEIGHT_OPTIONS = [400, 600, 700] as const;

export const ALIGN_OPTIONS = ["left", "center", "right"] as const;

interface TaggedFabricObject {
  cloakKind?: string;
}

export function TextPanel() {
  const { toolState, patchTool, getFabricCanvas } = useEditor();
  const [selected, setSelected] = useState<IText | null>(null);
  const [, force] = useState(0);

  // Subscribe to Fabric selection events so the panel reflects the
  // currently active text layer.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const sync = () => {
      const obj = fc.getActiveObject();
      if (
        obj &&
        (obj as TaggedFabricObject).cloakKind === TEXT_TAG &&
        (obj as IText).type === "i-text"
      ) {
        setSelected(obj as IText);
      } else {
        setSelected(null);
      }
    };
    sync();
    fc.on("selection:created", sync);
    fc.on("selection:updated", sync);
    fc.on("selection:cleared", sync);
    fc.on("text:changed", () => force((n) => n + 1));
    return () => {
      fc.off("selection:created", sync);
      fc.off("selection:updated", sync);
      fc.off("selection:cleared", sync);
    };
  }, [getFabricCanvas]);

  const setOnSelected = <K extends string>(key: K, value: unknown) => {
    if (!selected) return;
    selected.set({ [key]: value });
    selected.canvas?.requestRenderAll();
    force((n) => n + 1);
  };

  // Build / clear the IText's `path` so the glyphs follow an arc.
  // `amount` is in [-1, 1]; 0 clears the path. Recomputes with the
  // *effective* width (`width × scaleX`) so the arc length still
  // matches the rendered text after the user scales via Fabric handles.
  const applyCurve = useCallback((target: IText | null, amount: number) => {
    if (!target) return;
    const effectiveWidth = Math.max(40, (target.width ?? 200) * (target.scaleX ?? 1));
    if (Math.abs(amount) < 0.02) {
      target.set({ path: undefined });
      target.canvas?.requestRenderAll();
      return;
    }
    target.set({ path: buildArcPath(effectiveWidth, amount) });
    target.canvas?.requestRenderAll();
  }, []);

  // Re-fit the curve when text content / size / curve amount changes.
  useEffect(() => {
    if (!selected) return;
    applyCurve(selected, toolState.textCurve);
  }, [
    applyCurve,
    selected,
    toolState.textCurve,
    selected?.text,
    selected?.fontSize,
    selected?.charSpacing,
  ]);

  // Live-rebuild the curve while the user drags Fabric's transform
  // handles — `width × scaleX` changes and the path needs to follow.
  // Without this the glyphs scroll past the end of the arc.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !selected) return;
    if (Math.abs(toolState.textCurve) < 0.02) return;
    const onChange = (opt: { target?: unknown }) => {
      if (opt.target !== selected) return;
      applyCurve(selected, toolState.textCurve);
    };
    fc.on("object:scaling", onChange);
    fc.on("object:modified", onChange);
    return () => {
      fc.off("object:scaling", onChange);
      fc.off("object:modified", onChange);
    };
  }, [applyCurve, getFabricCanvas, selected, toolState.textCurve]);

  return (
    <>
      <PropRow label="Caption">
        <textarea
          value={selected ? selected.text : toolState.textValue}
          onChange={(e) => {
            if (selected) setOnSelected("text", e.target.value);
            else patchTool("textValue", e.target.value);
          }}
          rows={2}
          className="w-full resize-y rounded-lg border border-border bg-page-bg px-2.5 py-2 font-[inherit] text-[12.5px] text-text dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text"
        />
      </PropRow>
      <PropRow label="Font">
        <Segment
          options={FONT_OPTIONS.map((f) => f.label)}
          active={selected ? indexOfFont(selected.fontFamily ?? "") : toolState.textFont}
          onChange={(i) => {
            const stack = FONT_OPTIONS[i]?.stack ?? FONT_OPTIONS[0].stack;
            if (selected) setOnSelected("fontFamily", stack);
            else patchTool("textFont", i);
          }}
        />
      </PropRow>
      <PropRow label="Weight">
        <Segment
          options={["Regular", "Semibold", "Bold"]}
          active={
            selected ? indexOfWeight(numericWeight(selected.fontWeight)) : toolState.textWeight
          }
          onChange={(i) => {
            const w = WEIGHT_OPTIONS[i] ?? 600;
            if (selected) setOnSelected("fontWeight", w);
            else patchTool("textWeight", i);
          }}
        />
      </PropRow>
      <PropRow label="Align">
        <Segment
          options={["Left", "Center", "Right"]}
          active={
            selected
              ? Math.max(
                  0,
                  ALIGN_OPTIONS.indexOf(
                    (selected.textAlign ?? "left") as (typeof ALIGN_OPTIONS)[number],
                  ),
                )
              : toolState.textAlign
          }
          onChange={(i) => {
            const a = ALIGN_OPTIONS[i] ?? "left";
            if (selected) setOnSelected("textAlign", a);
            else patchTool("textAlign", i);
          }}
        />
      </PropRow>
      <PropRow label="Size" value={`${(selected?.fontSize ?? toolState.textSize).toFixed(0)} px`}>
        <Slider
          value={Math.min(1, (selected?.fontSize ?? toolState.textSize) / 256)}
          accent
          onChange={(v) => {
            const next = Math.max(8, v * 256);
            if (selected) setOnSelected("fontSize", next);
            else patchTool("textSize", next);
          }}
        />
      </PropRow>
      <PropRow label="Color">
        <ColorPicker
          value={typeof selected?.fill === "string" ? selected.fill : toolState.textColor}
          onChange={(c) => {
            if (selected) setOnSelected("fill", c);
            else patchTool("textColor", c);
          }}
        />
      </PropRow>
      <PropRow label="Style">
        <div className="flex gap-1">
          <StyleToggle
            label="I"
            italic
            on={selected ? selected.fontStyle === "italic" : toolState.textItalic}
            onChange={(next) => {
              if (selected) setOnSelected("fontStyle", next ? "italic" : "normal");
              else patchTool("textItalic", next);
            }}
          />
          <StyleToggle
            label="U"
            underline
            on={selected ? !!selected.underline : toolState.textUnderline}
            onChange={(next) => {
              if (selected) setOnSelected("underline", next);
              else patchTool("textUnderline", next);
            }}
          />
        </div>
      </PropRow>
      <PropRow
        label="Letter spacing"
        value={`${Math.round((selected?.charSpacing ?? toolState.textCharSpacing) / 10)}`}
      >
        <Slider
          value={Math.min(1, ((selected?.charSpacing ?? toolState.textCharSpacing) + 200) / 1200)}
          accent={(selected?.charSpacing ?? toolState.textCharSpacing) !== 0}
          onChange={(v) => {
            const next = Math.round(v * 1200 - 200);
            if (selected) setOnSelected("charSpacing", next);
            else patchTool("textCharSpacing", next);
          }}
        />
      </PropRow>
      <PropRow
        label="Curve"
        value={curveLabel(selected ? readCurveAmount(selected) : toolState.textCurve)}
      >
        <Slider
          value={((selected ? readCurveAmount(selected) : toolState.textCurve) + 1) / 2}
          accent={Math.abs(selected ? readCurveAmount(selected) : toolState.textCurve) > 0.02}
          onChange={(v) => {
            const next = Math.round((v * 2 - 1) * 100) / 100;
            patchTool("textCurve", next);
            if (selected) applyCurve(selected, next);
          }}
        />
      </PropRow>
      <PropRow
        label="Outline"
        value={`${(selected?.strokeWidth ?? toolState.textStrokeWidth).toFixed(1)} px`}
      >
        <Slider
          value={Math.min(1, (selected?.strokeWidth ?? toolState.textStrokeWidth) / 12)}
          accent={(selected?.strokeWidth ?? toolState.textStrokeWidth) > 0}
          onChange={(v) => {
            const next = Math.round(v * 12 * 10) / 10;
            if (selected) setOnSelected("strokeWidth", next);
            else patchTool("textStrokeWidth", next);
          }}
        />
      </PropRow>
      {(selected?.strokeWidth ?? toolState.textStrokeWidth) > 0 && (
        <PropRow label="Outline color">
          <ColorPicker
            value={
              typeof selected?.stroke === "string" ? selected.stroke : toolState.textStrokeColor
            }
            onChange={(c) => {
              if (selected) setOnSelected("stroke", c);
              else patchTool("textStrokeColor", c);
            }}
          />
        </PropRow>
      )}
      <div className="grid grid-cols-3 gap-1">
        <PresetButton
          label="Straight"
          active={Math.abs(toolState.textCurve) < 0.02}
          onClick={() => {
            patchTool("textCurve", 0);
            if (selected) applyCurve(selected, 0);
          }}
        />
        <PresetButton
          label="Arc up"
          active={toolState.textCurve <= -0.5}
          onClick={() => {
            patchTool("textCurve", -0.7);
            if (selected) applyCurve(selected, -0.7);
          }}
        />
        <PresetButton
          label="Arc down"
          active={toolState.textCurve >= 0.5}
          onClick={() => {
            patchTool("textCurve", 0.7);
            if (selected) applyCurve(selected, 0.7);
          }}
        />
      </div>
      {!selected && (
        <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          Click on the canvas to drop a text layer — it lands selected so you can drag immediately.
          Double-click to edit inline.
        </div>
      )}
      {selected && (
        <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          Editing the selected text. Esc exits inline edit; Delete removes the layer (via the Layers
          panel).
        </div>
      )}
    </>
  );
}

interface StyleToggleProps {
  label: string;
  on: boolean;
  italic?: boolean;
  underline?: boolean;
  onChange: (next: boolean) => void;
}

function StyleToggle({ label, on, italic, underline, onChange }: StyleToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none font-[inherit] text-[12px] font-semibold ${
        on
          ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
          : "bg-page-bg text-text-muted dark:bg-dark-page-bg dark:text-dark-text-muted"
      }`}
      style={{
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
      }}
    >
      {label}
    </button>
  );
}

interface PresetButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function PresetButton({ label, active, onClick }: PresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-md border-none px-2 py-1.5 font-[inherit] text-[11px] font-semibold ${
        active
          ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
          : "bg-page-bg text-text-muted dark:bg-dark-page-bg dark:text-dark-text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function curveLabel(amount: number): string {
  if (Math.abs(amount) < 0.02) return "none";
  const pct = Math.round(Math.abs(amount) * 100);
  return amount < 0 ? `up ${pct}%` : `down ${pct}%`;
}

/** Read the current curve amount back out of the IText's attached path
 *  metadata, falling back to 0 when no path is set. */
function readCurveAmount(text: IText): number {
  const path = (text as IText & { path?: Path }).path;
  if (!path) return 0;
  const meta = (path as Path & { _cloakCurve?: number })._cloakCurve;
  return typeof meta === "number" ? meta : 0;
}

/** Build an SVG arc path that spans `width` image-space pixels with a
 *  curvature controlled by `amount` in [-1, 1]. The path is placed at
 *  origin (0, 0) → (width, 0) so Fabric IText can lay glyphs along it. */
function buildArcPath(width: number, amount: number): Path {
  const angle = amount * Math.PI; // ±π = half circle
  const sweep = angle > 0 ? 1 : 0;
  // Arc length L = r * |angle| → r = L / |angle|.
  const r = Math.max(20, Math.abs(width / angle));
  // Chord length between the two endpoints.
  const chord = 2 * r * Math.sin(Math.abs(angle) / 2);
  const largeArc = Math.abs(angle) > Math.PI ? 1 : 0;
  const d = `M 0 0 A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweep} ${chord.toFixed(2)} 0`;
  const path = new Path(d, {
    fill: "",
    stroke: "",
    strokeWidth: 0,
    visible: false,
    selectable: false,
    evented: false,
  });
  // Stash the source amount so we can read it back when re-rendering
  // the panel against an existing selection.
  (path as Path & { _cloakCurve?: number })._cloakCurve = amount;
  return path;
}

function indexOfFont(stack: string): number {
  const i = FONT_OPTIONS.findIndex((f) => f.stack === stack);
  return i === -1 ? 0 : i;
}

function indexOfWeight(weight: number): number {
  const i = (WEIGHT_OPTIONS as readonly number[]).indexOf(weight);
  return i === -1 ? 1 : i;
}

function numericWeight(w: string | number | undefined): number {
  if (typeof w === "number") return w;
  if (typeof w === "string") {
    const n = parseInt(w, 10);
    if (Number.isFinite(n)) return n;
    if (w === "bold") return 700;
    if (w === "normal") return 400;
  }
  return 600;
}
