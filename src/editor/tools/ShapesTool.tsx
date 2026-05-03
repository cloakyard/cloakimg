// ShapesTool.tsx — Phase F4 / F4.5. Drag-to-create shapes with 26
// sub-modes: Rect, RoundedRect, Ellipse, Line, Arrow, Triangle,
// Polygon (n sides), Star (n points), Heart, SpeechBubble, Cloud,
// Diamond, Cross, RightTriangle, Parallelogram, Lightning, Teardrop,
// Octagon, Pentagon, Trapezoid, Pie, Sunburst, Bookmark, Ribbon,
// Donut, Crescent.
//
// While the Shapes tool is active, Fabric is interactive
// (`fabricInteractive`):
//
//   • Empty-canvas drag → create a new shape sized to the drag.
//   • Click an existing shape → Fabric selects it (drag, scale,
//     rotate via native handles).
//
// Shapes are tagged `cloak:shape` so the Layers panel and future
// per-shape behaviour can find them.

import {
  Ellipse,
  type FabricObject,
  Line,
  Path,
  Polygon,
  Rect as FabricRect,
  type TPointerEventInfo,
  Triangle,
} from "fabric";
import { useEffect, useRef } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";

export const SHAPE_TAG = "cloak:shape";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

// Indices match SHAPE_KINDS in ShapesPanel.tsx.
const KIND = {
  RECT: 0,
  ROUNDED_RECT: 1,
  ELLIPSE: 2,
  LINE: 3,
  ARROW: 4,
  TRIANGLE: 5,
  POLYGON: 6,
  STAR: 7,
  HEART: 8,
  SPEECH: 9,
  CLOUD: 10,
  DIAMOND: 11,
  CROSS: 12,
  RIGHT_TRIANGLE: 13,
  PARALLELOGRAM: 14,
  LIGHTNING: 15,
  TEARDROP: 16,
  OCTAGON: 17,
  PENTAGON: 18,
  TRAPEZOID: 19,
  PIE: 20,
  SUNBURST: 21,
  BOOKMARK: 22,
  RIBBON: 23,
  DONUT: 24,
  CRESCENT: 25,
} as const;

// Path d-strings normalised to a 100×100 bbox so we can scale via
// scaleX / scaleY during drag.
const HEART_D =
  "M 50,90 C 20,70 0,40 10,20 C 25,0 45,0 50,20 C 55,0 75,0 90,20 C 100,40 80,70 50,90 Z";
const SPEECH_D =
  "M 10,5 H 90 Q 100,5 100,15 V 50 Q 100,60 90,60 H 60 L 50,80 L 50,60 H 10 Q 0,60 0,50 V 15 Q 0,5 10,5 Z";
const CLOUD_D =
  "M 25,80 A 25,25 0 0 1 25,40 A 30,30 0 0 1 70,30 A 25,25 0 0 1 90,55 A 20,20 0 0 1 75,80 Z";
const LIGHTNING_D = "M 55,5 L 20,55 L 45,55 L 35,95 L 80,40 L 55,40 L 65,5 Z";
const TEARDROP_D = "M 50,5 C 80,40 95,65 50,95 C 5,65 20,40 50,5 Z";
// Pie wedge: a 270° wedge from the top, sweeping clockwise back to centre.
const PIE_D = "M 50,50 L 50,5 A 45,45 0 1 1 5,50 Z";
// Bookmark: tag with a notched bottom.
const BOOKMARK_D = "M 20,5 H 80 V 95 L 50,75 L 20,95 Z";
// Ribbon: a horizontal banner with symmetric concave V-notches cut
// into both ends. Matches the icon (which also notches both ends
// inward) — the previous shape was asymmetric (right-pointed,
// left-notched) and didn't read as a banner.
const RIBBON_D = "M 5,20 H 95 L 80,50 L 95,80 H 5 L 20,50 Z";
// Donut: outer circle minus inner circle (evenodd fill).
const DONUT_D =
  "M 50,5 A 45,45 0 1 1 50,95 A 45,45 0 1 1 50,5 Z M 50,30 A 20,20 0 1 0 50,70 A 20,20 0 1 0 50,30 Z";
// Crescent moon — a circle with a smaller offset circle subtracted.
const CRESCENT_D = "M 75,15 A 45,45 0 1 0 75,85 A 38,38 0 1 1 75,15 Z";
// Sunburst: 8-spoke sun with center disc.
const SUNBURST_D =
  "M 50,5 L 56,28 L 75,12 L 67,33 L 92,28 L 72,45 L 95,55 L 72,57 L 88,75 L 67,68 L 70,90 L 56,72 L 50,95 L 44,72 L 30,90 L 33,68 L 12,75 L 28,57 L 5,55 L 28,45 L 8,28 L 33,33 L 25,12 L 44,28 Z";

// Arrow path — a horizontal arrow pointing right, normalised to a
// 100×100 bbox so it can be rotated + scaled to match the drag. The
// origin sits at the left-edge / vertical-centre so we anchor on the
// drag's start point and rotate around it. Body runs from x=0 to
// x=70; head fans out from y=30 to y=70 ending at x=100.
const ARROW_D = "M 0,42 L 70,42 L 70,28 L 100,50 L 70,72 L 70,58 L 0,58 Z";

// Polygon-based simple shapes (point arrays in 100×100 bbox).
const DIAMOND_POINTS = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];
const CROSS_POINTS = [
  { x: 35, y: 0 },
  { x: 65, y: 0 },
  { x: 65, y: 35 },
  { x: 100, y: 35 },
  { x: 100, y: 65 },
  { x: 65, y: 65 },
  { x: 65, y: 100 },
  { x: 35, y: 100 },
  { x: 35, y: 65 },
  { x: 0, y: 65 },
  { x: 0, y: 35 },
  { x: 35, y: 35 },
];
const RIGHT_TRIANGLE_POINTS = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
];
const PARALLELOGRAM_POINTS = [
  { x: 25, y: 0 },
  { x: 100, y: 0 },
  { x: 75, y: 100 },
  { x: 0, y: 100 },
];
const OCTAGON_POINTS = [
  { x: 30, y: 0 },
  { x: 70, y: 0 },
  { x: 100, y: 30 },
  { x: 100, y: 70 },
  { x: 70, y: 100 },
  { x: 30, y: 100 },
  { x: 0, y: 70 },
  { x: 0, y: 30 },
];
const PENTAGON_POINTS = [
  { x: 50, y: 0 },
  { x: 100, y: 38 },
  { x: 82, y: 100 },
  { x: 18, y: 100 },
  { x: 0, y: 38 },
];
const TRAPEZOID_POINTS = [
  { x: 25, y: 0 },
  { x: 75, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

interface ShapeStyle {
  shapeFill: string;
  shapeStroke: string;
  shapeStrokeWidth: number;
  shapeOpacity: number;
  shapeCornerRadius: number;
  shapeSides: number;
  shapeStarPoints: number;
}

type Drag = {
  obj: FabricObject;
  startX: number;
  startY: number;
  kind: number;
};

export function ShapesTool() {
  const { getFabricCanvas, doc, toolState, commit } = useEditor();
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    const onMouseDown = (opt: TPointerEventInfo) => {
      // Click on an existing object → let Fabric handle
      // selection / transform.
      if (opt.target) return;

      const p = fc.getScenePoint(opt.e);
      if (p.x < 0 || p.y < 0 || p.x > doc.width || p.y > doc.height) return;

      const obj = makeShape(toolState.shapeKind, toolState, p.x, p.y);
      if (!obj) return;
      (obj as TaggedFabricObject).cloakKind = SHAPE_TAG;
      fc.add(obj);
      fc.setActiveObject(obj);
      dragRef.current = { obj, startX: p.x, startY: p.y, kind: toolState.shapeKind };
      fc.requestRenderAll();
    };

    const onMouseMove = (opt: TPointerEventInfo) => {
      const d = dragRef.current;
      if (!d) return;
      const p = fc.getScenePoint(opt.e);
      const e = opt.e as MouseEvent | TouchEvent;
      const shift = "shiftKey" in e && e.shiftKey === true;
      const lock = toolState.shapeLockAspect || shift;
      growShape(d, p.x, p.y, lock);
      fc.requestRenderAll();
    };

    const onMouseUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      const bbox = d.obj.getBoundingRect();
      if (bbox.width < 4 || bbox.height < 4) {
        fc.remove(d.obj);
        fc.requestRenderAll();
        return;
      }
      commit("Add shape");
    };

    fc.on("mouse:down", onMouseDown);
    fc.on("mouse:move", onMouseMove);
    fc.on("mouse:up", onMouseUp);
    return () => {
      fc.off("mouse:down", onMouseDown);
      fc.off("mouse:move", onMouseMove);
      fc.off("mouse:up", onMouseUp);
    };
  }, [commit, doc, getFabricCanvas, toolState]);

  useStageProps({ fabricInteractive: true, cursor: "crosshair" });
  return null;
}

function buildPolygonPoints(sides: number): { x: number; y: number }[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * 2 * Math.PI - Math.PI / 2;
    return { x: 50 + 50 * Math.cos(a), y: 50 + 50 * Math.sin(a) };
  });
}

function buildStarPoints(points: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? 50 : 22;
    const a = (i / total) * 2 * Math.PI - Math.PI / 2;
    pts.push({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
  }
  return pts;
}

function makeShape(kind: number, s: ShapeStyle, x: number, y: number): FabricObject | null {
  const common = {
    left: x,
    top: y,
    fill: s.shapeFill,
    stroke: s.shapeStroke,
    strokeWidth: s.shapeStrokeWidth,
    strokeUniform: true,
    opacity: s.shapeOpacity,
    originX: "left" as const,
    originY: "top" as const,
    selectable: true,
    hasControls: true,
    hasBorders: true,
  };
  switch (kind) {
    case KIND.RECT:
      return new FabricRect({ ...common, width: 1, height: 1 });
    case KIND.ROUNDED_RECT:
      return new FabricRect({
        ...common,
        width: 1,
        height: 1,
        rx: s.shapeCornerRadius,
        ry: s.shapeCornerRadius,
      });
    case KIND.ELLIPSE:
      return new Ellipse({ ...common, rx: 1, ry: 1 });
    case KIND.LINE:
      return new Line([x, y, x + 1, y + 1], { ...common, fill: undefined });
    case KIND.ARROW: {
      // Filled arrow path — uses the panel's fill colour. The drag
      // handler later sets `angle`, `scaleX`, and `scaleY` to orient +
      // size it from the drag vector. The picker icon also shows a
      // proper arrow with a head, so this matches what the user sees.
      const arrow = new Path(ARROW_D, {
        ...common,
        originX: "left",
        originY: "center",
      });
      return arrow;
    }
    case KIND.TRIANGLE:
      return new Triangle({ ...common, width: 1, height: 1 });
    case KIND.POLYGON:
      return new Polygon(buildPolygonPoints(Math.max(3, Math.min(12, s.shapeSides))), common);
    case KIND.STAR:
      return new Polygon(buildStarPoints(Math.max(4, Math.min(12, s.shapeStarPoints))), common);
    case KIND.HEART:
      return new Path(HEART_D, common);
    case KIND.SPEECH:
      return new Path(SPEECH_D, common);
    case KIND.CLOUD:
      return new Path(CLOUD_D, common);
    case KIND.DIAMOND:
      return new Polygon([...DIAMOND_POINTS], common);
    case KIND.CROSS:
      return new Polygon([...CROSS_POINTS], common);
    case KIND.RIGHT_TRIANGLE:
      return new Polygon([...RIGHT_TRIANGLE_POINTS], common);
    case KIND.PARALLELOGRAM:
      return new Polygon([...PARALLELOGRAM_POINTS], common);
    case KIND.LIGHTNING:
      return new Path(LIGHTNING_D, common);
    case KIND.TEARDROP:
      return new Path(TEARDROP_D, common);
    case KIND.OCTAGON:
      return new Polygon([...OCTAGON_POINTS], common);
    case KIND.PENTAGON:
      return new Polygon([...PENTAGON_POINTS], common);
    case KIND.TRAPEZOID:
      return new Polygon([...TRAPEZOID_POINTS], common);
    case KIND.PIE:
      return new Path(PIE_D, common);
    case KIND.SUNBURST:
      return new Path(SUNBURST_D, common);
    case KIND.BOOKMARK:
      return new Path(BOOKMARK_D, common);
    case KIND.RIBBON:
      return new Path(RIBBON_D, common);
    case KIND.DONUT:
      // Use evenodd so the inner sub-path punches a hole through the
      // outer ring. Without it Fabric fills the whole disc.
      return new Path(DONUT_D, { ...common, fillRule: "evenodd" });
    case KIND.CRESCENT:
      return new Path(CRESCENT_D, { ...common, fillRule: "evenodd" });
    default:
      return null;
  }
}

function growShape(d: Drag, x: number, y: number, lockAspect: boolean) {
  const obj = d.obj;
  let w = x - d.startX;
  let h = y - d.startY;

  // 1:1 bbox for filled shapes; for lines / arrows lock snaps the
  // angle to the nearest 45° increment so straight horizontals,
  // verticals, and diagonals are easy to draw.
  if (lockAspect && d.kind !== KIND.LINE && d.kind !== KIND.ARROW) {
    const m = Math.max(Math.abs(w), Math.abs(h));
    w = (w < 0 ? -1 : 1) * m;
    h = (h < 0 ? -1 : 1) * m;
  }

  const left = Math.min(d.startX, d.startX + w);
  const top = Math.min(d.startY, d.startY + h);

  switch (d.kind) {
    case KIND.RECT:
    case KIND.ROUNDED_RECT:
    case KIND.TRIANGLE: {
      obj.set({
        left,
        top,
        width: Math.max(1, Math.abs(w)),
        height: Math.max(1, Math.abs(h)),
        scaleX: 1,
        scaleY: 1,
      });
      obj.setCoords();
      return;
    }
    case KIND.ELLIPSE: {
      obj.set({
        left,
        top,
        rx: Math.max(1, Math.abs(w) / 2),
        ry: Math.max(1, Math.abs(h) / 2),
        scaleX: 1,
        scaleY: 1,
      });
      obj.setCoords();
      return;
    }
    case KIND.LINE: {
      const line = obj as Line;
      let ex = x;
      let ey = y;
      if (lockAspect) {
        const dx = x - d.startX;
        const dy = y - d.startY;
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        ex = d.startX + Math.cos(snapped) * len;
        ey = d.startY + Math.sin(snapped) * len;
      }
      line.set({ x2: ex, y2: ey });
      line.setCoords();
      return;
    }
    case KIND.ARROW: {
      // Anchor at the drag's start point and rotate the normalised
      // (0,50)-anchored arrow path so its tip lands under the cursor.
      // scaleY tracks scaleX with a soft cap so very long arrows don't
      // get visually fat heads. Shift-snaps the angle to 45° steps.
      let dx = x - d.startX;
      let dy = y - d.startY;
      if (lockAspect) {
        const a = Math.atan2(dy, dx);
        const snapped = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        dx = Math.cos(snapped) * len;
        dy = Math.sin(snapped) * len;
      }
      const length = Math.max(8, Math.hypot(dx, dy));
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const sx = length / 100;
      // Cap the head height for arrows longer than ~3× the head — keeps
      // drag-stretched arrows looking like arrows rather than darts.
      const sy = Math.min(sx, Math.max(0.4, sx * 0.35 + 0.4));
      obj.set({
        left: d.startX,
        top: d.startY,
        angle: angleDeg,
        scaleX: sx,
        scaleY: sy,
      });
      obj.setCoords();
      return;
    }
    case KIND.POLYGON:
    case KIND.STAR:
    case KIND.HEART:
    case KIND.SPEECH:
    case KIND.CLOUD:
    case KIND.DIAMOND:
    case KIND.CROSS:
    case KIND.RIGHT_TRIANGLE:
    case KIND.PARALLELOGRAM:
    case KIND.LIGHTNING:
    case KIND.TEARDROP:
    case KIND.OCTAGON:
    case KIND.PENTAGON:
    case KIND.TRAPEZOID:
    case KIND.PIE:
    case KIND.SUNBURST:
    case KIND.BOOKMARK:
    case KIND.RIBBON:
    case KIND.DONUT:
    case KIND.CRESCENT: {
      obj.set({
        left,
        top,
        scaleX: Math.max(0.01, Math.abs(w) / 100),
        scaleY: Math.max(0.01, Math.abs(h) / 100),
      });
      obj.setCoords();
      return;
    }
  }
}
