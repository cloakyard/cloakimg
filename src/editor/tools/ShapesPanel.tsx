// ShapesPanel.tsx — Phase F4.5. Icon-driven sub-mode picker plus
// stroke / fill / opacity / per-kind parameter controls. 26 shape
// kinds: Rect, RoundedRect, Ellipse, Line, Arrow, Triangle, Polygon,
// Star, Heart, SpeechBubble, Cloud, Diamond, Cross, RightTriangle,
// Parallelogram, Lightning, Teardrop, Octagon, Pentagon, Trapezoid,
// Pie, Sunburst, Bookmark, Ribbon, Donut, Crescent.

import type { ComponentType } from "react";
import { I } from "../../components/icons";
import { ColorPicker } from "../ColorPicker";
import { useEditorActions, useToolState } from "../EditorContext";
import { PropRow, Slider, ToggleSwitch } from "../atoms";

interface ShapeDef {
  name: string;
  Icon: ComponentType<{ size?: number }>;
}

export const SHAPE_KINDS: readonly ShapeDef[] = [
  { name: "Rectangle", Icon: I.Square },
  { name: "Rounded rectangle", Icon: I.RoundedSquare },
  { name: "Ellipse", Icon: I.Circle },
  { name: "Line", Icon: I.Slash },
  { name: "Arrow", Icon: I.ArrowGlyph },
  { name: "Triangle", Icon: I.Triangle },
  { name: "Polygon", Icon: I.Hexagon },
  { name: "Star", Icon: I.Star },
  { name: "Heart", Icon: I.Heart },
  { name: "Speech bubble", Icon: I.SpeechBubble },
  { name: "Cloud", Icon: I.Cloud },
  { name: "Diamond", Icon: I.Diamond },
  { name: "Cross", Icon: I.Cross },
  { name: "Right triangle", Icon: I.RightTriangle },
  { name: "Parallelogram", Icon: I.Parallelogram },
  { name: "Lightning", Icon: I.Lightning },
  { name: "Teardrop", Icon: I.Teardrop },
  { name: "Octagon", Icon: I.Octagon },
  { name: "Pentagon", Icon: I.Pentagon },
  { name: "Trapezoid", Icon: I.Trapezoid },
  { name: "Pie", Icon: I.Pie },
  { name: "Sunburst", Icon: I.Sunburst },
  { name: "Bookmark", Icon: I.Bookmark },
  { name: "Ribbon", Icon: I.Ribbon },
  { name: "Donut", Icon: I.Donut },
  { name: "Crescent", Icon: I.Crescent },
] as const;

export function ShapesPanel() {
  const toolState = useToolState();
  const { patchTool } = useEditorActions();
  const kind = toolState.shapeKind;
  return (
    <>
      <PropRow label="Shape">
        <div className="grid grid-cols-5 gap-1 rounded-md border border-border-soft bg-page-bg p-0.75 dark:border-dark-border-soft dark:bg-dark-page-bg sm:grid-cols-6">
          {SHAPE_KINDS.map((s, i) => {
            const Ic = s.Icon;
            const active = i === kind;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => patchTool("shapeKind", i)}
                title={s.name}
                aria-label={s.name}
                aria-pressed={active}
                className={`flex h-8 cursor-pointer items-center justify-center rounded border-none p-0 sm:h-7 ${
                  active
                    ? "bg-surface text-coral-600 shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-dark-surface dark:text-coral-400"
                    : "bg-transparent text-text-muted dark:text-dark-text-muted"
                }`}
              >
                <Ic size={15} />
              </button>
            );
          })}
        </div>
      </PropRow>
      <PropRow label="Fill">
        <ColorPicker value={toolState.shapeFill} onChange={(c) => patchTool("shapeFill", c)} />
      </PropRow>
      <PropRow label="Stroke">
        <ColorPicker value={toolState.shapeStroke} onChange={(c) => patchTool("shapeStroke", c)} />
      </PropRow>
      <PropRow label="Stroke width" value={`${toolState.shapeStrokeWidth.toFixed(0)} px`}>
        <Slider
          value={Math.min(1, toolState.shapeStrokeWidth / 32)}
          accent
          onChange={(v) => patchTool("shapeStrokeWidth", Math.max(0, v * 32))}
        />
      </PropRow>
      <PropRow label="Opacity" value={`${Math.round(toolState.shapeOpacity * 100)}%`}>
        <Slider
          value={toolState.shapeOpacity}
          accent
          onChange={(v) => patchTool("shapeOpacity", v)}
        />
      </PropRow>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-text-muted dark:text-dark-text-muted">
          Lock aspect
        </span>
        <ToggleSwitch
          on={toolState.shapeLockAspect}
          onChange={(next) => patchTool("shapeLockAspect", next)}
        />
      </div>

      {kind === 1 && (
        <PropRow label="Corner radius" value={`${toolState.shapeCornerRadius.toFixed(0)} px`}>
          <Slider
            value={Math.min(1, toolState.shapeCornerRadius / 80)}
            accent
            onChange={(v) => patchTool("shapeCornerRadius", Math.max(0, v * 80))}
          />
        </PropRow>
      )}

      {kind === 6 && (
        <PropRow label="Sides" value={`${toolState.shapeSides}`}>
          <Slider
            value={(toolState.shapeSides - 3) / 9}
            accent
            onChange={(v) =>
              patchTool("shapeSides", Math.max(3, Math.min(12, Math.round(3 + v * 9))))
            }
          />
        </PropRow>
      )}

      {kind === 7 && (
        <PropRow label="Points" value={`${toolState.shapeStarPoints}`}>
          <Slider
            value={(toolState.shapeStarPoints - 4) / 8}
            accent
            onChange={(v) =>
              patchTool("shapeStarPoints", Math.max(4, Math.min(12, Math.round(4 + v * 8))))
            }
          />
        </PropRow>
      )}

      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Drag on the canvas to create. Click a shape to select; corners scale, the rotation handle
        rotates.
      </div>
    </>
  );
}
