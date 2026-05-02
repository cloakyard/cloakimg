// atoms.tsx — Reusable property atoms: Slider, Segment, PropRow,
// ToggleSwitch. Each has just enough interactivity to feel real
// without owning any business logic.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
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

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !onChange) return;
      const rect = el.getBoundingClientRect();
      const next = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(next);
    },
    [onChange],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!onChange) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className={`relative flex h-4.5 items-center touch-none ${onChange ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="relative h-0.75 w-full rounded-sm bg-page-bg dark:bg-dark-page-bg">
        <div
          className={`absolute top-0 left-0 h-full rounded-sm ${
            accent ? "bg-coral-500" : "bg-text dark:bg-dark-text"
          }`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <div
        className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-[1.5px] border-coral-500 bg-white"
        style={{
          left: `calc(${value * 100}% - 7px)`,
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
      className="flex rounded-md border border-border-soft bg-page-bg p-0.5 dark:border-dark-border-soft dark:bg-dark-page-bg"
      style={style}
    >
      {options.map((o, i) => {
        const isActive = i === active;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange?.(i)}
            className={`flex-1 cursor-pointer rounded border-none px-2 py-1 text-center font-[inherit] text-[11px] font-semibold ${
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
        style={{ animation: "ci-spin 0.9s linear infinite" }}
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
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      aria-pressed={on}
      className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full border-none p-0 transition-colors ${
        on ? "bg-coral-500" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
        style={{
          left: on ? 14 : 2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left 160ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </button>
  );
}
