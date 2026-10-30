// CurveEditor.tsx — Interactive tone curve widget for the Adjust panel.
//
// Background: a faded RGB+luma histogram of the working canvas plus a
// diagonal identity reference line so users can see where they are
// relative to the original tones. Foreground: a smooth Catmull-Rom
// curve through the user's control points, with draggable point
// handles. Click empty space to add a point; drag a point to move
// it; drag a point off the editor (past `OFF_EDGE_DELETE`) and
// release to remove it. The two endpoints (x=0 and x=255) are
// sticky on x — they can move on y, but never disappear, so the
// curve always covers the full input range.
//
// On coarse pointers the geometry scales up — handle radius, hit
// radius, drag-off-edge margin all grow so the widget stays usable
// with a fingertip. The SVG aspect-ratio is locked to 1:1 so circles
// stay round and the diagonal is a true 45°, regardless of the panel
// width on whatever device the user has open.
//
// Pointer events land on the parent SVG (not on the circles), so the
// drag gesture is identical for desktop and mobile and the lint stays
// happy about static SVG nodes — the circles are decoration.

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NumberField } from "../NumberField";
import { useEditorReadOnly } from "../EditorContext";
import { type CurvePoint, IDENTITY_CURVE } from "../toolState";
import { buildCurveLUT } from "./adjustments";

const SAMPLE_LONG_EDGE = 240;
const POINT_RADIUS = 5;
const OFF_EDGE_DELETE = 24;
const PLOT_INSET = 16;
const PLOT_SIZE = 255 + PLOT_INSET * 2;

interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  max: number;
}

interface Props {
  curve: CurvePoint[];
  onChange: (next: CurvePoint[]) => void;
  /** When true the widget grows to fill the parent's remaining space
   *  (height-driven, still square). Used by the mobile drawer's
   *  Histogram tab so the curve fills the sheet without scrolling. */
  fit?: boolean;
}

export function CurveEditor({ curve, onChange, fit = false }: Props) {
  const { doc, historyVersion } = useEditorReadOnly();
  const svgRef = useRef<SVGSVGElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  // We track the *index* of the point being dragged rather than the
  // point object itself — every drag tick produces a new sorted array,
  // so the index can shift if the user pulls past a neighbour. We
  // re-resolve it from the latest array on each move event.
  const dragRef = useRef<{ index: number; before: CurvePoint[] } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = Math.min(selectedIndex, curve.length - 1);
  const selectedPoint = curve[selected];

  const [hist, setHist] = useState<HistogramData | null>(null);
  // The index of the point currently being dragged outside the SVG
  // bounds — UI fades it to half opacity so the user knows the lift
  // will remove it. Endpoints never enter this state.
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);
  // Recompute the histogram on every history mutation (commit / undo /
  // redo). Debounced so a quick burst of undos doesn't churn — the
  // curve is still readable against a slightly-stale histogram.
  useEffect(() => {
    // historyVersion isn't read in the body, but it's the trigger:
    // the working canvas reference is stable across commits while
    // its bitmap mutates in place, so the dep is what flags "redraw".
    void historyVersion;
    const working = doc?.working;
    if (!working) {
      setHist(null);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      setHist(computeHistogram(working, scratchRef));
    }, 32);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [doc, historyVersion]);

  const lut = useMemo(() => buildCurveLUT(curve), [curve]);

  // Curve path: walk the LUT once and emit a polyline. With 256 short
  // segments the visual is indistinguishable from a true bezier, and
  // the LUT is already what every pixel will see at bake time.
  const curvePath = useMemo(() => {
    if (lut.length === 0) return "";
    let d = `M 0 ${255 - (lut[0] ?? 0)}`;
    for (let x = 1; x < 256; x++) {
      d += ` L ${x} ${255 - (lut[x] ?? x)}`;
    }
    return d;
  }, [lut]);

  const histPaths = useMemo(() => {
    if (!hist) return null;
    return {
      r: histPath(hist.r, hist.max),
      g: histPath(hist.g, hist.max),
      b: histPath(hist.b, hist.max),
      l: histPath(hist.l, hist.max),
    };
  }, [hist]);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // Raw values are unclamped so the move handler can detect
    // drag-off-edge for delete; the clamped pair is what actually
    // updates the curve.
    const rawX = ((clientX - rect.left) / rect.width) * PLOT_SIZE - PLOT_INSET;
    const rawY = 255 - (((clientY - rect.top) / rect.height) * PLOT_SIZE - PLOT_INSET);
    return {
      x: Math.max(0, Math.min(255, rawX)),
      y: Math.max(0, Math.min(255, rawY)),
      rawX,
      rawY,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const local = toLocal(e.clientX, e.clientY);
      if (!local) return;
      // Did the click land on an existing point?
      let idx = -1;
      for (let i = 0; i < curve.length; i++) {
        const p = curve[i];
        if (!p) continue;
        const dx = p.x - local.x;
        const dy = p.y - local.y;
        if (Math.hypot(dx, dy) < (22 * PLOT_SIZE) / e.currentTarget.getBoundingClientRect().width) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        // Insert a new point — snap x to integer so two points can't
        // coincide, and so the sorted-array invariant is easy to
        // reason about.
        const insertX = Math.round(local.x);
        const next = curve.filter((p) => p.x !== insertX);
        next.push({ x: insertX, y: Math.round(local.y) });
        next.sort((a, b) => a.x - b.x);
        idx = next.findIndex((p) => p.x === insertX);
        onChange(next);
      }
      dragRef.current = { index: idx, before: curve.map((point) => ({ ...point })) };
      setSelectedIndex(idx);
      e.currentTarget.focus({ preventScroll: true });
    },
    [curve, onChange, toLocal],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const local = toLocal(e.clientX, e.clientY);
      if (!local) return;
      const next = curve.slice();
      const at = next[drag.index];
      if (!at) return;
      const isFirst = drag.index === 0;
      const isLast = drag.index === curve.length - 1;
      const isInterior = !isFirst && !isLast;
      // Endpoints are sticky on x — they always cover the full input
      // range, so users can't accidentally chop off the highlights or
      // shadows by dragging an endpoint inward.
      let nx: number;
      if (isFirst) nx = 0;
      else if (isLast) nx = 255;
      else {
        const prev = next[drag.index - 1];
        const after = next[drag.index + 1];
        const lo = prev ? prev.x + 1 : 0;
        const hi = after ? after.x - 1 : 255;
        nx = Math.max(lo, Math.min(hi, Math.round(local.x)));
      }
      next[drag.index] = { x: nx, y: Math.round(local.y) };
      onChange(next);
      // Drag-off-edge detection runs on the *unclamped* pointer so we
      // can tell that the finger has moved past the editor's bounds
      // even though the visual point is pinned at the edge. Only
      // arms for interior points — endpoints can't be deleted.
      if (isInterior) {
        const off =
          local.rawY < -OFF_EDGE_DELETE ||
          local.rawY > 255 + OFF_EDGE_DELETE ||
          local.rawX < -OFF_EDGE_DELETE ||
          local.rawX > 255 + OFF_EDGE_DELETE;
        setPendingDeleteIdx(off ? drag.index : null);
      } else {
        setPendingDeleteIdx(null);
      }
    },
    [curve, onChange, toLocal],
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    // If the finger lifted while still off-edge and the dragged point
    // is interior, treat the lift as a delete.
    if (drag && pendingDeleteIdx !== null && curve.length > 2) {
      const idx = pendingDeleteIdx;
      const isFirst = idx === 0;
      const isLast = idx === curve.length - 1;
      if (!isFirst && !isLast) {
        const trimmed = curve.filter((_, j) => j !== idx);
        onChange(trimmed);
      }
    }
    setPendingDeleteIdx(null);
  }, [curve, onChange, pendingDeleteIdx]);

  const reset = () => {
    setSelectedIndex(0);
    onChange(IDENTITY_CURVE);
  };
  const movePoint = (x: number, y: number) => {
    if (!selectedPoint) return;
    const first = selected === 0,
      last = selected === curve.length - 1;
    const lo = first ? 0 : curve[selected - 1]!.x + 1,
      hi = last ? 255 : curve[selected + 1]!.x - 1;
    const next = curve.map((point, i) =>
      i === selected
        ? {
            x: first ? 0 : last ? 255 : Math.max(lo, Math.min(hi, Math.round(x))),
            y: Math.max(0, Math.min(255, Math.round(y))),
          }
        : point,
    );
    onChange(next);
  };
  const removePoint = () => {
    if (selected === 0 || selected === curve.length - 1) return;
    onChange(curve.filter((_, i) => i !== selected));
    setSelectedIndex(selected - 1);
  };
  const addPoint = () => {
    let gap = 0,
      index = 0;
    for (let i = 1; i < curve.length; i++) {
      const nextGap = curve[i]!.x - curve[i - 1]!.x;
      if (nextGap > gap) {
        gap = nextGap;
        index = i;
      }
    }
    if (gap < 2) return;
    const x = Math.round((curve[index - 1]!.x + curve[index]!.x) / 2);
    const next = [...curve];
    next.splice(index, 0, { x, y: lut[x] ?? x });
    onChange(next);
    setSelectedIndex(index);
  };
  const keys = (event: React.KeyboardEvent) => {
    if (!selectedPoint) return;
    const step = event.shiftKey ? 10 : 1;
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
    } else return;
    if (event.key === "Delete" || event.key === "Backspace") removePoint();
    else
      movePoint(
        selectedPoint.x +
          (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
        selectedPoint.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
      );
  };

  return (
    <div className="img-curve" data-compact={fit}>
      <p className="air-label">RGB tone curve</p>
      <svg
        ref={svgRef}
        viewBox={`-${PLOT_INSET} -${PLOT_INSET} ${PLOT_SIZE} ${PLOT_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="img-curve-plot"
        tabIndex={0}
        onKeyDown={keys}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (dragRef.current) onChange(dragRef.current.before);
          dragRef.current = null;
          setPendingDeleteIdx(null);
        }}
        role="application"
        aria-label="Tone curve editor"
      >
        {/* Quartile grid — four faint vertical + horizontal lines so
            users can eyeball where the shadow / midtone / highlight
            regions sit. */}
        <g stroke="currentColor" strokeWidth="0.5" opacity="0.15">
          <line x1="63.75" y1="0" x2="63.75" y2="255" />
          <line x1="127.5" y1="0" x2="127.5" y2="255" />
          <line x1="191.25" y1="0" x2="191.25" y2="255" />
          <line x1="0" y1="63.75" x2="255" y2="63.75" />
          <line x1="0" y1="127.5" x2="255" y2="127.5" />
          <line x1="0" y1="191.25" x2="255" y2="191.25" />
        </g>
        {histPaths && (
          <>
            <path d={histPaths.l} fill="rgba(120,120,120,0.45)" />
            <g style={{ mixBlendMode: "screen" }}>
              <path d={histPaths.r} fill="rgba(245,97,58,0.65)" />
              <path d={histPaths.g} fill="rgba(95,210,140,0.65)" />
              <path d={histPaths.b} fill="rgba(80,160,255,0.65)" />
            </g>
          </>
        )}
        {/* Identity reference. */}
        <line
          x1="0"
          y1="255"
          x2="255"
          y2="0"
          stroke="rgba(127,127,127,0.6)"
          strokeWidth="0.75"
          strokeDasharray="3 4"
        />
        {/* Curve. */}
        <path d={curvePath} stroke="var(--air-accent)" strokeWidth="1.5" fill="none" />
        {/* Control points — drawn last so they sit on top of the line.
            x is unique within the sorted curve (we dedupe on insert),
            so it makes a stable React key without falling back to
            array index. The handles are decorative; pointer events
            land on the parent SVG and we hit-test against the curve
            list, which keeps the lint happy and the delete gesture
            (drag off the editor) unified across desktop and mobile. */}
        {curve.map((p, i) => {
          const isEndpoint = i === 0 || i === curve.length - 1;
          const fading = pendingDeleteIdx === i;
          return (
            <circle
              key={`pt-${p.x}`}
              cx={p.x}
              cy={255 - p.y}
              r={POINT_RADIUS}
              fill={selected === i ? "var(--air-accent)" : "var(--air-surface)"}
              stroke="var(--air-accent)"
              strokeWidth="1.5"
              opacity={fading ? 0.35 : 1}
              style={{ cursor: isEndpoint ? "ns-resize" : "move" }}
            />
          );
        })}
      </svg>
      <p className="img-curve-hint">
        Red, green, blue and luminance histogram. Select a point, then use arrow keys or enter
        input/output. Shift moves 10 levels.
      </p>
      <div className="img-curve-points" role="group" aria-label="Curve points">
        {curve.map((point, i) => (
          <button
            type="button"
            key={i}
            className="btn btn-secondary btn-sm"
            aria-pressed={selected === i}
            aria-label={`Point ${i + 1}: input ${point.x}, output ${point.y}`}
            onClick={() => setSelectedIndex(i)}
            onKeyDown={keys}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {selectedPoint && (
        <div className="img-curve-values">
          <label>
            Input
            <NumberField
              label="Curve input"
              value={selectedPoint.x}
              min={selected === 0 ? 0 : curve[selected - 1]!.x + 1}
              max={selected === curve.length - 1 ? 255 : curve[selected + 1]!.x - 1}
              disabled={selected === 0 || selected === curve.length - 1}
              onCommit={(x) => movePoint(x, selectedPoint.y)}
            />
          </label>
          <label>
            Output
            <NumberField
              label="Curve output"
              value={selectedPoint.y}
              min={0}
              max={255}
              onCommit={(y) => movePoint(selectedPoint.x, y)}
            />
          </label>
        </div>
      )}
      <div className="img-curve-actions">
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={addPoint}
          disabled={curve.length >= 256}
        >
          Add point
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={removePoint}
          disabled={selected === 0 || selected === curve.length - 1}
        >
          Remove point
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>
          Reset curve
        </button>
      </div>
    </div>
  );
}

function computeHistogram(
  src: HTMLCanvasElement,
  scratchRef: { current: HTMLCanvasElement | null },
): HistogramData | null {
  const long = Math.max(src.width, src.height);
  const ratio = long > SAMPLE_LONG_EDGE ? SAMPLE_LONG_EDGE / long : 1;
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  let scratch = scratchRef.current;
  if (!scratch) {
    scratch = document.createElement("canvas");
    scratchRef.current = scratch;
  }
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const cr = px[i] ?? 0;
    const cg = px[i + 1] ?? 0;
    const cb = px[i + 2] ?? 0;
    r[cr] = (r[cr] ?? 0) + 1;
    g[cg] = (g[cg] ?? 0) + 1;
    b[cb] = (b[cb] ?? 0) + 1;
    const lum = Math.min(255, Math.round(cr * 0.2126 + cg * 0.7152 + cb * 0.0722));
    l[lum] = (l[lum] ?? 0) + 1;
  }
  // Clamp peaks at the 99th percentile so a single dominant colour
  // doesn't squash the rest of the curve to a flat line.
  const all: number[] = [];
  for (let i = 0; i < 256; i++) {
    all.push(r[i] ?? 0, g[i] ?? 0, b[i] ?? 0, l[i] ?? 0);
  }
  all.sort((a, b) => a - b);
  const idx = Math.floor(all.length * 0.99);
  const max = Math.max(1, all[idx] ?? 1);
  return { r, g, b, l, max };
}

function histPath(bins: Uint32Array, max: number): string {
  // viewBox coords — y inverted so the histogram grows upward.
  let d = "M 0 255";
  for (let i = 0; i < 256; i++) {
    const v = Math.min(1, (bins[i] ?? 0) / max);
    d += ` L ${i} ${255 - v * 255}`;
  }
  d += " L 255 255 Z";
  return d;
}
