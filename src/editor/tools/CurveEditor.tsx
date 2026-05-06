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
import { useEditorReadOnly } from "../EditorContext";
import { type CurvePoint, IDENTITY_CURVE } from "../toolState";
import { buildCurveLUT } from "./adjustments";

const SAMPLE_LONG_EDGE = 240;
// Touch and mouse get different geometry so the handle is grabbable
// with a finger but doesn't dominate on a precision pointer. Every
// constant is in viewBox units (0..255), which the SVG stretches to
// fit its container — the math stays the same regardless of the
// panel's actual rendered width.
const COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const HIT_RADIUS = COARSE_POINTER ? 20 : 14;
const POINT_RADIUS = COARSE_POINTER ? 11 : 7;
// Drag the point this many viewBox-units past the top or bottom edge
// to delete it. Photoshop / Affinity use the same gesture; on touch
// it's the primary delete affordance because dblclick is unreliable
// across mobile WebKit / WebView combos.
const OFF_EDGE_DELETE = COARSE_POINTER ? 32 : 24;

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
  const dragRef = useRef<{ index: number } | null>(null);

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
    const rawX = ((clientX - rect.left) / rect.width) * 255;
    const rawY = 255 - ((clientY - rect.top) / rect.height) * 255;
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
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
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
      dragRef.current = { index: idx };
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

  const reset = useCallback(() => onChange(IDENTITY_CURVE), [onChange]);

  return (
    <div className="rounded-md border border-border-soft bg-page-bg p-1.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <svg
        ref={svgRef}
        viewBox="0 0 255 255"
        preserveAspectRatio="none"
        // In `fit` mode (mobile Histogram tab) the height is capped by
        // the drawer's actual max — exposed by MobileSheet as
        // `--ci-sheet-max`, inherited via CSS — so total content fits
        // without scrolling. The width grows up to 1.2× the height,
        // which closes the side gaps a square left behind on phones
        // without crossing into "stretched" territory (control points
        // become only mildly elliptical, the diagonal stays close to
        // 45°). `min(100%, …)` keeps it inside the panel on narrow
        // viewports; `mx-auto` centers when the cap kicks in.
        className={fit ? "mx-auto block touch-none" : "block w-full touch-none"}
        // Square aspect on desktop — circles stay round, the diagonal
        // stays at 45°, and the histogram bins read at consistent
        // visual density.
        style={
          fit
            ? {
                height: "max(140px, calc(var(--ci-sheet-max, 45vh) - 220px))",
                width: "min(100%, calc(max(140px, calc(var(--ci-sheet-max, 45vh) - 220px)) * 1.2))",
              }
            : { aspectRatio: "1 / 1" }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
        <path d={curvePath} stroke="#f5613a" strokeWidth="1.5" fill="none" />
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
              fill="#ffffff"
              stroke="#f5613a"
              strokeWidth="1.5"
              opacity={fading ? 0.35 : 1}
              style={{ cursor: isEndpoint ? "ns-resize" : "move" }}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-text-muted dark:text-dark-text-muted">
        <span className="text-[10px] pointer-coarse:text-[11px]">
          {COARSE_POINTER
            ? "Tap to add · drag off edge to remove"
            : "Click to add · drag off edge to remove"}
        </span>
        <button
          type="button"
          onClick={reset}
          // Touch users get a meaningfully larger tap target — the
          // visible label stays compact, but the button's padding +
          // font scale up on coarse pointers so it clears the ~44 pt
          // minimum without making the chrome heavier on desktop.
          className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[10.5px] font-semibold text-coral-700 pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-[12.5px] dark:text-coral-300"
        >
          Reset
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
