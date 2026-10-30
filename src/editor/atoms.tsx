// atoms.tsx — Reusable property atoms: Slider, Segment, PropRow,
// ToggleSwitch. Each has just enough interactivity to feel real
// without owning any business logic.

import {
  createContext,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";

import { NumberField } from "./NumberField";

const PropRowLabelContext = createContext<string | undefined>(undefined);

interface PropRowProps {
  label: string;
  value?: string;
  /** Editable readout — replaces `value` when present so the user can
   *  type a precise number instead of dragging. */
  valueInput?: ReactNode;
  children: ReactNode;
}

export function PropRow({ label, value, valueInput, children }: PropRowProps) {
  const labelId = useId();
  return (
    <PropRowLabelContext.Provider value={labelId}>
      <div className="img-prop-row">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span
            id={labelId}
            className="text-[0.8125rem] font-medium tracking-normal text-text-muted"
          >
            {label}
          </span>
          {valueInput
            ? valueInput
            : value && (
                <span className="tabular-nums text-[0.8125rem] font-medium text-text">{value}</span>
              )}
        </div>
        {children}
      </div>
    </PropRowLabelContext.Provider>
  );
}

interface NumericReadoutProps {
  /** Default display string when not focused (lets the panel keep its
   *  own formatting — sign, units, decimals). */
  display: string;
  unit?: string;
  min?: number;
  max?: number;
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

/** Precise domain-value adapter for controls with nonlinear mappings. */
export function NumericReadout({
  display,
  unit,
  min,
  max,
  normalized,
  fromNormalized,
  toNormalized,
  step = 1,
  onCommit,
}: NumericReadoutProps) {
  const propRowLabelId = useContext(PropRowLabelContext);
  return (
    <NumberField
      value={fromNormalized(normalized)}
      min={min ?? Math.min(fromNormalized(0), fromNormalized(1))}
      max={max ?? Math.max(fromNormalized(0), fromNormalized(1))}
      step={step}
      unit={unit ?? display.replace(/^[+−-]?[\d.]+\s*/, "")}
      labelledBy={propRowLabelId}
      label={propRowLabelId ? undefined : "Edit value"}
      onCommit={(n) => onCommit(toNormalized(n))}
    />
  );
}

/** A normalized slider paired with an editable value in its actual domain.
 * Pointer behavior stays in Slider; only numeric commits convert units. */
export function SliderField({
  label,
  domain = [0, 100],
  unit = "%",
  inputMin,
  inputStep = 1,
  readOnlyValue,
  onValueCommit,
  ...slider
}: SliderProps & {
  label: string;
  domain?: readonly [number, number];
  unit?: string;
  inputMin?: number;
  inputStep?: number;
  readOnlyValue?: string;
  onValueCommit?: () => void;
}) {
  const [min, max] = domain;
  const value = min + slider.value * (max - min);
  return (
    <PropRow
      label={label}
      value={readOnlyValue}
      valueInput={
        readOnlyValue ? undefined : (
          <NumberField
            label={label}
            value={value}
            min={inputMin ?? min}
            max={max}
            step={inputStep}
            unit={unit}
            disabled={!slider.onChange || max === min}
            onCommit={(next) => {
              slider.onChange?.((next - min) / (max - min));
              onValueCommit?.();
            }}
          />
        )
      }
    >
      <Slider
        {...slider}
        ariaValueText={
          slider.ariaValueText ?? `${Number(value.toFixed(3))}${unit ? ` ${unit}` : ""}`
        }
      />
    </PropRow>
  );
}

interface SliderProps {
  value: number; // 0..1
  onChange?: (next: number) => void;
  accent?: boolean;
  /** Explicit accessible name when the slider is not inside PropRow. */
  ariaLabel?: string;
  /** Optional human-readable value, e.g. "32 px" instead of 0.32. */
  ariaValueText?: string;
  /** Keyboard increment in normalized 0..1 space. */
  step?: number;
  /** Snap-back target on double-click. Most adjustment sliders centre
   *  at 0.5 (neutral); brush/opacity sliders that "default to off" can
   *  pass 0, etc. Omitted → no double-click reset. */
  defaultValue?: number;
}

export function Slider({
  value,
  onChange,
  accent = false,
  ariaLabel,
  ariaValueText,
  step = 0.01,
  defaultValue,
}: SliderProps) {
  const propRowLabelId = useContext(PropRowLabelContext);
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

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!onChange) return;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step;
      else if (event.key === "PageDown") next = value - step * 10;
      else if (event.key === "PageUp") next = value + step * 10;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 1;
      if (next === null) return;
      event.preventDefault();
      onChange(Math.min(1, Math.max(0, next)));
    },
    [onChange, step, value],
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : propRowLabelId}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      aria-valuetext={ariaValueText}
      aria-orientation="horizontal"
      aria-disabled={onChange ? undefined : true}
      tabIndex={onChange ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // Coarse pointers (touch) get a much taller hit area — Apple HIG
      // and Material both ask for ≥44 pt. The visible rail stays the
      // same; only the wrapper's height grows so the thumb is easier
      // to grab without changing the panel layout density.
      className={`relative flex h-8 items-center touch-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11 ${onChange ? "cursor-pointer" : "cursor-default opacity-50"}`}
      title={defaultValue !== undefined ? "Double-click to reset" : undefined}
    >
      <div className="relative h-0.75 w-full rounded-sm bg-border-soft pointer-coarse:h-1">
        <div
          ref={fillRef}
          className={`absolute top-0 left-0 h-full rounded-sm ${
            accent ? "bg-accent" : "bg-border"
          }`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      {defaultValue === 0.5 && <span aria-hidden="true" className="img-slider-zero" />}
      <div
        ref={thumbRef}
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-[1.5px] border-accent bg-surface pointer-coarse:h-5.5 pointer-coarse:w-5.5 pointer-coarse:border-2"
        style={{
          left: `${value * 100}%`,
          boxShadow: "none",
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
  const propRowLabelId = useContext(PropRowLabelContext);
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={propRowLabelId} className="img-segments" style={style}>
      {options.map((option, index) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            checked={index === active}
            disabled={!onChange}
            onChange={() => onChange?.(index)}
          />
          <span>{option}</span>
        </label>
      ))}
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
          className="text-text"
        />
        <path
          d={`M ${size / 2} ${stroke / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-text"
        />
      </svg>
      {label && <div className="text-[0.8125rem] text-text-muted">{label}</div>}
    </div>
  );
}

/** Shared button-size spinner. The full Spinner above is for blocking overlays. */
export function InlineSpinner({ size = 16 }: { size?: number } = {}) {
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
  /** Explicit accessible name when the switch is not inside PropRow. */
  ariaLabel?: string;
}

/** An unboxed, fully clickable label for the family switch. */
export function SwitchField({
  label,
  title,
  ...switchProps
}: Omit<ToggleProps, "ariaLabel"> & { label: string; title?: string }) {
  return (
    <label className="air-switch-row" title={title}>
      <span>{label}</span>
      <ToggleSwitch {...switchProps} ariaLabel={label} />
    </label>
  );
}

export function ToggleSwitch({ on, onChange, ariaLabel }: ToggleProps) {
  const propRowLabelId = useContext(PropRowLabelContext);
  return (
    <input
      type="checkbox"
      role="switch"
      checked={on}
      aria-checked={on}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : propRowLabelId}
      disabled={!onChange}
      onChange={(event) => onChange?.(event.target.checked)}
      className="air-switch"
    />
  );
}
