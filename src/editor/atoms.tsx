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
  /** Editable readout — replaces `value` when present so the user can
   *  type a precise number instead of dragging. */
  valueInput?: ReactNode;
  children: ReactNode;
}

export function PropRow({ label, value, valueInput, children }: PropRowProps) {
  // Typography hierarchy: label sits as semibold body-muted, value
  // pairs with it in mono so the eye latches on to the number first.
  // The `tracking-[-0.005em]` mirrors the rest of the editor's
  // labels; without it, semibold at 12 px looks ever-so-slightly
  // wider than the surrounding chrome.
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold tracking-[-0.005em] text-text-muted dark:text-dark-text-muted">
          {label}
        </span>
        {valueInput
          ? valueInput
          : value && (
              <span className="t-mono text-[11.5px] font-semibold text-text dark:text-dark-text">
                {value}
              </span>
            )}
      </div>
      {children}
    </div>
  );
}

interface NumericReadoutProps {
  /** Default display string when not focused (lets the panel keep its
   *  own formatting — sign, units, decimals). */
  display: string;
  /** Current slider value in 0..1 normalized space. */
  normalized: number;
  /** Convert 0..1 normalized → real-world units (e.g. -100..100). */
  fromNormalized: (n: number) => number;
  /** Convert real-world units → 0..1 normalized. */
  toNormalized: (real: number) => number;
  /** Granularity of the displayed real value. Used for round-tripping
   *  while editing — we don't bake this into the slider. */
  step?: number;
  onCommit: (next: number) => void;
}

/** Click the value chip to edit it directly. Esc reverts; Enter or
 *  blur commits. The readout uses each panel's own formatting when
 *  not focused — only switches to a raw number while typing. */
export function NumericReadout({
  display,
  normalized,
  fromNormalized,
  toNormalized,
  step = 1,
  onCommit,
}: NumericReadoutProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(false);

  const real = fromNormalized(normalized);
  const editStr = step >= 1 ? Math.round(real).toString() : real.toFixed(1);

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number.parseFloat(raw.replace(/[^0-9+\-.]/g, ""));
      if (Number.isFinite(parsed)) {
        const next = Math.min(1, Math.max(0, toNormalized(parsed)));
        onCommit(next);
      }
    },
    [onCommit, toNormalized],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      defaultValue={display}
      // Keep the visible chip in sync when the slider is dragged, but
      // not while the user is mid-edit (or their typing would be wiped
      // every time onCommit fires).
      key={editingRef.current ? "editing" : `${normalized}`}
      onFocus={(e) => {
        editingRef.current = true;
        e.currentTarget.value = editStr;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        commit(e.currentTarget.value);
      }}
      onBlur={(e) => {
        editingRef.current = false;
        // Snap the chip back to the formatted display, in case the
        // user typed something out of range that got clamped.
        e.currentTarget.value = display;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.currentTarget.value = display;
          e.currentTarget.blur();
        }
      }}
      // Coarse pointers (touch) get a larger pill so the tap target
      // clears the ~44 pt minimum without dominating desktop's denser
      // panel layout. The visible chip stays compact on hover-precise
      // pointers; only width / padding / type-size grow on coarse.
      className="t-mono w-12 cursor-text rounded border border-transparent bg-transparent px-1 py-0 text-right text-[11px] font-semibold text-text outline-none hover:border-border-soft focus:border-coral-500 focus:bg-page-bg pointer-coarse:w-16 pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-[12.5px] dark:text-dark-text dark:hover:border-dark-border-soft dark:focus:bg-dark-page-bg"
      aria-label="Edit value"
    />
  );
}

interface SliderProps {
  value: number; // 0..1
  onChange?: (next: number) => void;
  accent?: boolean;
  /** Snap-back target on double-click. Most adjustment sliders centre
   *  at 0.5 (neutral); brush/opacity sliders that "default to off" can
   *  pass 0, etc. Omitted → no double-click reset. */
  defaultValue?: number;
}

export function Slider({ value, onChange, accent = false, defaultValue }: SliderProps) {
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
  // Manual double-tap detector. iOS Safari ignores `dblclick` on
  // elements with `touch-action: none` (the slider has it to keep the
  // page from scrolling on a horizontal drag), so we synthesise the
  // gesture from pointer events. A tap is "down/up with < 6 px of
  // movement"; two taps within 300 ms and 18 px of each other count
  // as a double-tap and trigger the defaultValue snap-back.
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);

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
      // Detect a double-tap *before* we start dragging — if the gap
      // between this tap and the previous one is short enough, snap
      // the slider back to its default and bail out of drag mode so
      // the second tap doesn't pull the value to wherever the user's
      // finger happened to land.
      const prev = lastTapRef.current;
      const now = performance.now();
      if (
        defaultValue !== undefined &&
        prev &&
        now - prev.time < 300 &&
        Math.abs(prev.x - e.clientX) < 18
      ) {
        const v = Math.min(1, Math.max(0, defaultValue));
        applyVisual(v);
        onChange(v);
        lastTapRef.current = null;
        tapStartRef.current = null;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      tapStartRef.current = { x: e.clientX, y: e.clientY };
      updateFromPointer(e.clientX);
    },
    [applyVisual, defaultValue, onChange, updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      // Cancel the "this might be a tap" state once the user moves
      // far enough that we're clearly in a drag.
      const start = tapStartRef.current;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > 36) tapStartRef.current = null;
      }
      updateFromPointer(e.clientX);
    },
    [updateFromPointer],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      // Make sure the very last pointer position propagates upstream
      // even if it arrived between rAF flushes.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        flushChange();
      }
      // If the down→up never strayed past the tap threshold, this was
      // a tap — record it so the next tap can complete a double-tap.
      if (tapStartRef.current) {
        lastTapRef.current = { time: performance.now(), x: e.clientX };
        tapStartRef.current = null;
      } else {
        lastTapRef.current = null;
      }
    },
    [flushChange],
  );

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
      role="slider"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      tabIndex={onChange ? 0 : -1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // Coarse pointers (touch) get a much taller hit area — Apple HIG
      // and Material both ask for ≥44 pt. The visible rail stays the
      // same; only the wrapper's height grows so the thumb is easier
      // to grab without changing the panel layout density.
      className={`relative flex h-4.5 items-center touch-none pointer-coarse:h-9 ${onChange ? "cursor-pointer" : "cursor-default"}`}
      title={defaultValue !== undefined ? "Double-click to reset" : undefined}
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
  // Sliding indicator: a single absolutely-positioned pill animates
  // between options instead of the active background discretely
  // jumping. Width = 100/N % per slot; transform: translateX picks
  // the slot. Transition is on `transform`, so the indicator slides
  // smoothly between taps without forcing a repaint of the buttons.
  // Falls back gracefully when N === 0 (renders nothing).
  //
  // Inset is sourced from the `--seg-inset` CSS variable so the pill
  // geometry tracks the parent's padding (2px on mouse, 4px on touch).
  // Hard-coding the inset caused the rightmost pill to touch the
  // outer border on coarse pointers because the parent padding
  // doubled while the pill's inset stayed at 2px.
  const n = options.length;
  const slotPct = n > 0 ? 100 / n : 0;
  return (
    <div
      className="relative flex rounded-md border border-border-soft bg-page-bg p-0.5 [--seg-inset:2px] pointer-coarse:p-1 pointer-coarse:[--seg-inset:4px] dark:border-dark-border-soft dark:bg-dark-page-bg"
      style={style}
    >
      {n > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[5px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-dark-surface"
          style={{
            top: "var(--seg-inset)",
            bottom: "var(--seg-inset)",
            left: "var(--seg-inset)",
            width: `calc(${slotPct}% - var(--seg-inset) * 2)`,
            transform: `translateX(calc(${active} * 100% + ${active} * var(--seg-inset) * 2))`,
            transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      )}
      {options.map((o, i) => {
        const isActive = i === active;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange?.(i)}
            // Touch devices get larger padding + slightly bigger label
            // so each segment clears the ~44 pt minimum tap target.
            // The button itself stays transparent — the sliding pill
            // above provides the active background. We toggle text
            // colour on `isActive` so the active label snaps to the
            // foreground colour while the pill animates underneath.
            className={`relative z-1 flex-1 cursor-pointer rounded border-none bg-transparent px-2 py-1 text-center font-[inherit] text-[11px] font-semibold transition-colors pointer-coarse:px-3 pointer-coarse:py-2.5 pointer-coarse:text-[12.5px] ${
              isActive
                ? "text-text dark:text-dark-text"
                : "text-text-muted dark:text-dark-text-muted"
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
          // Promote to a compositor layer so the rotate animation can
          // run on the GPU. We deliberately do NOT set a base
          // `transform: translateZ(0)` here — the keyframes only
          // specify `transform: rotate(360deg)`, and CSS does a
          // *discrete* swap (not a smooth interpolation) when the
          // FROM and TO transform function lists don't match. With
          // a translateZ(0) base, the spinner would visually jump at
          // 50 % of each cycle and look frozen mid-rotation. Plain
          // `will-change` is enough to hint the layer.
          willChange: "transform",
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

/** Compact 13 px circular spinner sized for inline use next to a 12 –
 *  12.5 px button label. Use this in panel buttons that flip into a
 *  busy state while a synchronous post-detection bake or other tight
 *  operation runs — pairing the label change with a visible spinner
 *  is what tells the user "I'm working" instead of the button just
 *  freezing. The full-overlay `<Spinner />` above is for modal /
 *  full-screen waits; this one is for inline button affordances. */
export function InlineSpinner({ size = 13 }: { size?: number } = {}) {
  const r = (size - 3) / 2;
  const c = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ animation: "ci-spin 0.9s linear infinite" }}
      role="img"
      aria-label="Working"
    >
      <title>Working</title>
      <circle
        cx={c}
        cy={c}
        r={r}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
        fill="none"
      />
      <path
        d={`M ${c} ${1.5} A ${r} ${r} 0 0 1 ${size - 1.5} ${c}`}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
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
