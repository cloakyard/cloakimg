// atoms.tsx — Reusable property atoms: Slider, Segment, PropRow,
// ToggleSwitch. Each has just enough interactivity to feel real
// without owning any business logic.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";

interface PropRowProps {
  label: string;
  value?: string;
  children: ReactNode;
}

export function PropRow({ label, value, children }: PropRowProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-text-muted dark:text-dark-text-muted">
          {label}
        </span>
        {value && (
          <span className="t-mono text-[11px] font-semibold text-text dark:text-dark-text">
            {value}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface SliderProps {
  value: number; // 0..1
  onChange?: (next: number) => void;
  accent?: boolean;
}

export function Slider({ value, onChange, accent = false }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  // Drive the visual position imperatively from pointer events so a
  // 120 Hz pointer stream doesn't translate into 120 React renders per
  // second across every `useEditor()` consumer. Upstream `onChange` is
  // coalesced to one call per rAF — fast enough for a live preview
  // bake, slow enough that React's reconciler isn't the bottleneck.
  const draggingRef = useRef(false);
  const pendingValueRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const applyVisual = useCallback((v: number) => {
    if (fillRef.current) fillRef.current.style.width = `${v * 100}%`;
    // Position the thumb's centre on the value mark and let CSS
    // translate(-50%) handle the half-width offset, so the same
    // expression works regardless of whether the thumb is the
    // desktop-size 14 px or the touch-size 22 px chip.
    if (thumbRef.current) thumbRef.current.style.left = `${v * 100}%`;
  }, []);

  // Re-sync the DOM with the prop whenever the upstream value changes
  // and we're not actively dragging. During a drag we own the visual
  // and React updates from our own onChange are absorbed silently.
  useEffect(() => {
    if (!draggingRef.current) applyVisual(value);
  }, [value, applyVisual]);

  const flushChange = useCallback(() => {
    rafRef.current = null;
    const v = pendingValueRef.current;
    pendingValueRef.current = null;
    if (v !== null && onChange) onChange(v);
  }, [onChange]);

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !onChange) return;
      const rect = el.getBoundingClientRect();
      const next = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      applyVisual(next);
      pendingValueRef.current = next;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushChange);
      }
    },
    [applyVisual, flushChange, onChange],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!onChange) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      updateFromPointer(e.clientX);
    },
    [onChange, updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      updateFromPointer(e.clientX);
    },
    [updateFromPointer],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    // Make sure the very last pointer position propagates upstream
    // even if it arrived between rAF flushes.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      flushChange();
    }
  }, [flushChange]);

  // Cancel any pending rAF on unmount so we don't fire onChange after
  // the consumer has gone away.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // Coarse pointers (touch) get a much taller hit area — Apple HIG
      // and Material both ask for ≥44 pt. The visible rail stays the
      // same; only the wrapper's height grows so the thumb is easier
      // to grab without changing the panel layout density.
      className={`relative flex h-4.5 items-center touch-none pointer-coarse:h-9 ${onChange ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="relative h-0.75 w-full rounded-sm bg-page-bg pointer-coarse:h-1 dark:bg-dark-page-bg">
        <div
          ref={fillRef}
          className={`absolute top-0 left-0 h-full rounded-sm ${
            accent ? "bg-coral-500" : "bg-text dark:bg-dark-text"
          }`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <div
        ref={thumbRef}
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-[1.5px] border-coral-500 bg-white pointer-coarse:h-5.5 pointer-coarse:w-5.5 pointer-coarse:border-2"
        style={{
          left: `${value * 100}%`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

interface SegmentProps {
  options: readonly string[];
  active: number;
  onChange?: (index: number) => void;
  style?: CSSProperties;
}

export function Segment({ options, active, onChange, style }: SegmentProps) {
  return (
    <div
      className="flex rounded-md border border-border-soft bg-page-bg p-0.5 pointer-coarse:p-1 dark:border-dark-border-soft dark:bg-dark-page-bg"
      style={style}
    >
      {options.map((o, i) => {
        const isActive = i === active;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange?.(i)}
            // Touch devices get larger padding + slightly bigger label
            // so each segment clears the ~44 pt minimum tap target.
            className={`flex-1 cursor-pointer rounded border-none px-2 py-1 text-center font-[inherit] text-[11px] font-semibold pointer-coarse:px-3 pointer-coarse:py-2.5 pointer-coarse:text-[12.5px] ${
              isActive
                ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-dark-surface dark:text-dark-text"
                : "bg-transparent text-text-muted dark:text-dark-text-muted"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 36, label }: SpinnerProps) {
  const stroke = Math.max(2, Math.round(size / 12));
  const r = (size - stroke) / 2;
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        aria-hidden="true"
        style={{
          animation: "ci-spin 0.9s linear infinite",
          // Promote to a compositor layer so the rotate animation
          // keeps ticking on the GPU when the main thread is blocked
          // by a synchronous bake (Filter / Adjust / Resize). Without
          // this, the browser runs the transform animation on the
          // main thread and the spinner appears frozen for the
          // duration of the freeze — exactly when feedback matters.
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-coral-500/20 dark:text-coral-400/20"
        />
        <path
          d={`M ${size / 2} ${stroke / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-coral-500 dark:text-coral-400"
        />
      </svg>
      {label && (
        <div className="text-[13px] text-text-muted dark:text-dark-text-muted">{label}</div>
      )}
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  onChange?: (next: boolean) => void;
}

export function ToggleSwitch({ on, onChange }: ToggleProps) {
  return (
    // Touch-friendly hit area: the visible pill stays compact, but a
    // transparent padding-only wrapper extends the tap target to ~44 pt
    // on coarse pointers so the switch isn't a fingertip-precision
    // exercise on phones.
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      aria-pressed={on}
      className="inline-flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 pointer-coarse:p-2"
    >
      <span
        className={`relative inline-block h-4 w-7 rounded-full transition-colors pointer-coarse:h-6 pointer-coarse:w-10 ${
          on ? "bg-coral-500" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          // The thumb sits inset 2 px from the off-side and slides 12 px
          // (desktop) / 16 px (touch) to land inset 2 px from the on-side
          // — width and pad scale together so the same translate values
          // bottom out at both sizes.
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform pointer-coarse:top-1 pointer-coarse:left-1 pointer-coarse:h-4 pointer-coarse:w-4 ${
            on ? "translate-x-3 pointer-coarse:translate-x-4" : "translate-x-0"
          }`}
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
        />
      </span>
    </button>
  );
}
