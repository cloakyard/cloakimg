// ColorPicker.tsx — Custom CloakIMG color picker. A swatch button that
// opens a popover containing:
//
//   • Saturation × Value square (drag to pick S and V)
//   • Hue strip (drag to pick H)
//   • Hex / RGB inputs (typed entry)
//   • Recent picks row (last 8, shared across all pickers)
//   • Native eyedropper trigger (uses the browser EyeDropper API where
//     available; falls back to switching the editor to the Color Picker
//     tool, where the canvas eyedropper is already wired up)
//
// All values flow through `value` / `onChange` so the picker is a fully
// controlled component. Recents are tracked in a tiny in-memory store.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  getRecentColors,
  type HSV,
  hsvToRgb,
  parseColor,
  pushRecentColor,
  type RGB,
  rgbToHex,
  rgbToHsv,
  subscribeRecents,
} from "./colorUtils";
import { I } from "../components/icons";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Optional label shown above the swatch. */
  label?: string;
  /** Show the eyedropper button inside the popover (default true). */
  enableEyedropper?: boolean;
  /** Allow the caller to override the swatch button styling. */
  swatchStyle?: CSSProperties;
}

export function ColorPicker({
  value,
  onChange,
  label,
  enableEyedropper = true,
  swatchStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label ?? "Pick a color"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-page-bg py-1.5 pr-2.5 pl-1.5 font-[inherit] text-inherit dark:border-dark-border dark:bg-dark-page-bg"
        style={swatchStyle}
      >
        <span
          aria-hidden
          className="checker relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-black/5"
        >
          <span className="absolute inset-0" style={{ background: value }} />
        </span>
        <span className="t-mono flex-1 text-left text-xs font-semibold tracking-[0.02em]">
          {value.toUpperCase()}
        </span>
        <I.ChevronDown size={13} className="text-text-muted dark:text-dark-text-muted" />
      </button>
      {open && anchorRef.current && (
        <ColorPopover
          anchor={anchorRef.current}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          enableEyedropper={enableEyedropper}
        />
      )}
    </>
  );
}

interface PopoverProps {
  anchor: HTMLElement;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  enableEyedropper: boolean;
}

function ColorPopover({ anchor, value, onChange, onClose, enableEyedropper }: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const recents = useSyncExternalStore(subscribeRecents, getRecentColors, getRecentColors);

  const rgb = useMemo(() => parseColor(value), [value]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);
  // We track HSV locally so dragging through saturation === 0 doesn't
  // collapse hue (since hue is undefined when s === 0).
  const [draftHsv, setDraftHsv] = useState<HSV>(hsv);
  useEffect(() => {
    // External update — sync HSV unless user is mid-drag.
    setDraftHsv((prev) => {
      const next = hsv;
      if (
        Math.abs(prev.h - next.h) < 0.5 &&
        Math.abs(prev.s - next.s) < 0.005 &&
        Math.abs(prev.v - next.v) < 0.005
      ) {
        return prev;
      }
      return next;
    });
  }, [hsv]);

  const [hexDraft, setHexDraft] = useState(value);
  useEffect(() => setHexDraft(value), [value]);

  const commit = useCallback(
    (next: HSV) => {
      const hex = rgbToHex(hsvToRgb(next));
      setDraftHsv(next);
      onChange(hex);
    },
    [onChange],
  );

  // Position the popover beneath the anchor; flip up when overflowing.
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const cnt = containerRef.current;
    if (!cnt) return;
    const ph = cnt.offsetHeight;
    const pw = cnt.offsetWidth;
    const margin = 8;
    let top = rect.bottom + margin;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - margin);
    let left = rect.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    setPos({ top, left });
  }, [anchor]);

  // Click outside / Esc to close.
  useEffect(() => {
    const onDocPointer = (e: PointerEvent) => {
      const cnt = containerRef.current;
      if (!cnt) return;
      const t = e.target as Node;
      if (cnt.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const onHexBlur = useCallback(() => {
    const parsed = parseColor(hexDraft);
    onChange(rgbToHex(parsed));
  }, [hexDraft, onChange]);

  const onHexKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const parsed = parseColor(hexDraft);
        onChange(rgbToHex(parsed));
        (e.currentTarget as HTMLInputElement).blur();
      }
    },
    [hexDraft, onChange],
  );

  const onPickEyedropper = useCallback(async () => {
    interface DropperResult {
      sRGBHex: string;
    }
    interface EyeDropperCtor {
      new (): { open(): Promise<DropperResult> };
    }
    const w = window as unknown as { EyeDropper?: EyeDropperCtor };
    if (!w.EyeDropper) return;
    try {
      const ed = new w.EyeDropper();
      const r = await ed.open();
      onChange(r.sRGBHex);
      pushRecentColor(r.sRGBHex);
    } catch {
      // user cancelled — no-op
    }
  }, [onChange]);

  // Render via a portal to <body> so the popover escapes any ancestor
  // that creates a containing block for `position: fixed` (e.g. the
  // start modal's `backdrop-filter`, which would otherwise clip us).
  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Color picker"
      className="fixed z-200 flex w-60 flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 dark:border-dark-border dark:bg-dark-surface"
      style={{
        top: pos.top,
        left: pos.left,
        boxShadow: "var(--shadow-float)",
      }}
    >
      <SVSquare
        hue={draftHsv.h}
        s={draftHsv.s}
        v={draftHsv.v}
        onChange={(s, v) => commit({ h: draftHsv.h, s, v })}
      />
      <HueStrip hue={draftHsv.h} onChange={(h) => commit({ h, s: draftHsv.s, v: draftHsv.v })} />
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={onHexBlur}
          onKeyDown={onHexKey}
          spellCheck={false}
          aria-label="Hex value"
          className="flex-1 rounded-md border border-border bg-page-bg px-2 py-1.5 font-mono text-xs text-text dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text"
        />
        <RGBInputs rgb={rgb} onChange={(next) => onChange(rgbToHex(next))} />
      </div>
      {recents.length > 0 && (
        <div>
          <div className="t-section-label mb-1">Recent</div>
          <div className="flex flex-wrap gap-1">
            {recents.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                onClick={() => onChange(c)}
                className="checker relative h-5.5 w-5.5 cursor-pointer overflow-hidden rounded border border-border p-0 dark:border-dark-border"
              >
                <span className="absolute inset-0" style={{ background: c }} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        {enableEyedropper && (
          <button
            type="button"
            className="btn btn-secondary btn-xs flex-1"
            onClick={onPickEyedropper}
            title="Pick a color from anywhere on screen"
          >
            <I.Pipette size={12} /> Eyedrop
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-xs flex-1"
          onClick={() => {
            pushRecentColor(value);
            onClose();
          }}
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

interface SVProps {
  hue: number;
  s: number;
  v: number;
  onChange: (s: number, v: number) => void;
}

function SVSquare({ hue, s, v, onChange }: SVProps) {
  const ref = useRef<HTMLDivElement>(null);
  const apply = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ns = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const nv = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
      onChange(ns, nv);
    },
    [onChange],
  );
  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      apply(e);
    },
    [apply],
  );
  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      apply(e);
    },
    [apply],
  );
  const baseHue = `hsl(${hue}, 100%, 50%)`;
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      className="relative h-32.5 cursor-crosshair touch-none rounded-md"
      style={{
        background: `
          linear-gradient(0deg, #000 0%, transparent 100%),
          linear-gradient(90deg, #fff 0%, ${baseHue} 100%)
        `,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute h-3 w-3 rounded-full border-2 border-white"
        style={{
          left: `calc(${s * 100}% - 6px)`,
          top: `calc(${(1 - v) * 100}% - 6px)`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
}

function HueStrip({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const apply = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      onChange(r * 360);
    },
    [onChange],
  );
  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      apply(e);
    },
    [apply],
  );
  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      apply(e);
    },
    [apply],
  );
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      className="relative h-3 cursor-pointer touch-none rounded-md"
      style={{
        background:
          "linear-gradient(90deg, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-0.5 h-4 w-3 rounded bg-white"
        style={{
          left: `calc(${(hue / 360) * 100}% - 6px)`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}

function RGBInputs({ rgb, onChange }: { rgb: RGB; onChange: (next: RGB) => void }) {
  const fields: Array<["r" | "g" | "b", string]> = [
    ["r", "R"],
    ["g", "G"],
    ["b", "B"],
  ];
  return (
    <div className="flex gap-1">
      {fields.map(([k, l]) => (
        <label
          key={k}
          className="flex flex-col items-center gap-px text-[9px] text-text-muted dark:text-dark-text-muted"
        >
          <span>{l}</span>
          <input
            type="number"
            min={0}
            max={255}
            value={rgb[k]}
            onChange={(e) => {
              const n = Math.max(0, Math.min(255, +e.target.value || 0));
              onChange({ ...rgb, [k]: n });
            }}
            aria-label={l}
            className="w-9 rounded border border-border bg-page-bg p-1 text-center font-mono text-[11px] text-text dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text"
          />
        </label>
      ))}
    </div>
  );
}
