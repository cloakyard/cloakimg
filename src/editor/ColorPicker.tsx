/** Air author-colour picker. Image colours remain data; the surrounding UI is neutral. */
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Popover } from "@base-ui/react/popover";
import { wheelPosition, wheelValue } from "../../docs/air/colour.mjs";
import {
  getRecentColors,
  hsvToRgb,
  parseColor,
  pushRecentColor,
  rgbToHex,
  rgbToHsv,
  subscribeRecents,
  type HSV,
} from "./colorUtils";
import { NumberField } from "./NumberField";
import { I } from "../components/icons";
interface Props {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  enableEyedropper?: boolean;
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
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="air-field air-select-trigger img-colour-trigger"
        aria-label={label ?? "Pick a color"}
        style={swatchStyle}
      >
        <span className="checker img-colour-swatch" aria-hidden="true">
          <span style={{ background: value }} />
        </span>
        <span>{value.toUpperCase()}</span>
        <I.ChevronDown size={16} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="air-floating-positioner"
          sideOffset={8}
          collisionPadding={16}
          positionMethod="fixed"
          align="start"
        >
          <Popover.Popup
            className="air-popover img-colour-popover"
            ref={popup}
            initialFocus={(type) => (type === "touch" ? popup.current! : true)}
          >
            <Popover.Title className="air-label">Color</Popover.Title>
            <Popover.Description className="img-colour-hint">
              Pick a color or enter an exact value.
            </Popover.Description>
            <ColourControls
              value={value}
              onChange={onChange}
              enableEyedropper={enableEyedropper}
              onDone={() => setOpen(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
function ColourControls({
  value,
  onChange,
  enableEyedropper,
  onDone,
}: Pick<Props, "value" | "onChange" | "enableEyedropper"> & { onDone: () => void }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(parseColor(value))),
    last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setHsv(rgbToHsv(parseColor(value)));
      last.current = value;
    }
  }, [value]);
  const [hex, setHex] = useState<string | null>(null),
    [error, setError] = useState("");
  const errorId = useId();
  const hexInput = useRef<HTMLInputElement>(null);
  const drag = useRef<HSV | null>(null),
    alive = useRef(true),
    dropper = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      dropper.current?.abort();
    };
  }, []);
  const recent = useSyncExternalStore(subscribeRecents, getRecentColors, getRecentColors);
  const emit = (next: HSV) => {
    const color = rgbToHex(hsvToRgb(next));
    last.current = color;
    setHsv(next);
    setHex(null);
    setError("");
    onChange(color);
  };
  const commitHex = () => {
    if (hex === null) return true;
    const raw = hex.trim();
    if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(raw)) {
      setError("Enter a hex color, such as #285AD7.");
      return false;
    }
    const color = rgbToHex(parseColor(raw));
    last.current = color;
    setHsv(rgbToHsv(parseColor(color)));
    setHex(null);
    setError("");
    onChange(color);
    return true;
  };
  const point = wheelPosition(hsv.h, hsv.s),
    rgb = hsvToRgb(hsv);
  const sample = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    emit({
      ...hsv,
      ...wheelValue(
        (event.clientX - r.left - r.width / 2) / (r.width / 2),
        (event.clientY - r.top - r.height / 2) / (r.height / 2),
        hsv.h,
      ),
    });
  };
  const hasDropper =
    typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === "function";
  const pick = async () => {
    if (!hasDropper || dropper.current) return;
    const controller = new AbortController();
    dropper.current = controller;
    try {
      const Ctor = (
        window as unknown as {
          EyeDropper: new () => {
            open: (options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>;
          };
        }
      ).EyeDropper;
      const result = await new Ctor().open({ signal: controller.signal });
      if (alive.current) {
        const color = result.sRGBHex;
        last.current = color;
        setHsv(rgbToHsv(parseColor(color)));
        setHex(null);
        setError("");
        onChange(color);
        pushRecentColor(color);
      }
    } catch {
      /* Cancellation retains the current color. */
    } finally {
      dropper.current = null;
    }
  };
  return (
    <>
      <div
        className="air-colour-wheel"
        role="group"
        aria-label="Color wheel; hue and saturation controls follow"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = hsv;
          e.currentTarget.setPointerCapture(e.pointerId);
          sample(e);
        }}
        onPointerMove={(e) => {
          if (drag.current) sample(e);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current) emit(drag.current);
          drag.current = null;
        }}
      >
        <span
          className="air-colour-wheel__point"
          style={{
            left: `${point.x}%`,
            top: `${point.y}%`,
            background: rgbToHex(hsvToRgb({ ...hsv, v: 1 })),
          }}
        />
      </div>
      <label className="img-colour-axis">
        Brightness <output>{Math.round(hsv.v * 100)}%</output>
        <input
          aria-label="Brightness"
          aria-valuetext={`${Math.round(hsv.v * 100)}%`}
          className="air-colour-brightness"
          type="range"
          min={0}
          max={100}
          value={hsv.v * 100}
          onChange={(e) => emit({ ...hsv, v: Number(e.target.value) / 100 })}
          style={{
            backgroundImage: `linear-gradient(to right,#000,${rgbToHex(hsvToRgb({ ...hsv, v: 1 }))})`,
          }}
        />
      </label>
      <label className="img-colour-axis">
        Hue <output>{Math.round(hsv.h)}°</output>
        <input
          type="range"
          min={0}
          max={359}
          aria-label="Hue"
          aria-valuetext={`${Math.round(hsv.h)} degrees`}
          value={hsv.h}
          onChange={(e) => emit({ ...hsv, h: Number(e.target.value) })}
        />
      </label>
      <label className="img-colour-axis">
        Saturation <output>{Math.round(hsv.s * 100)}%</output>
        <input
          type="range"
          min={0}
          max={100}
          value={hsv.s * 100}
          aria-label="Saturation"
          aria-valuetext={`${Math.round(hsv.s * 100)}%`}
          onChange={(e) => emit({ ...hsv, s: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="img-colour-hex">
        Hex value
        <input
          ref={hexInput}
          className="air-field"
          type="text"
          value={hex ?? value.toUpperCase()}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setHex(e.target.value);
            setError("");
          }}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commitHex();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setHex(null);
              setError("");
            }
          }}
        />
      </label>
      {error && (
        <p id={errorId} className="img-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="img-colour-rgb">
        {(["r", "g", "b"] as const).map((key, i) => (
          <label key={key}>
            {["Red", "Green", "Blue"][i]}
            <NumberField
              label={["Red", "Green", "Blue"][i]}
              value={rgb[key]}
              min={0}
              max={255}
              onCommit={(n) => {
                const color = rgbToHex({ ...rgb, [key]: n });
                last.current = color;
                setHsv(rgbToHsv(parseColor(color)));
                setHex(null);
                onChange(color);
              }}
            />
          </label>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="img-colour-recents" role="group" aria-label="Recent colors">
          {recent.map((color) => (
            <button
              key={color}
              type="button"
              className="img-recent-colour"
              aria-label={`Use ${color}`}
              onClick={() => emit(rgbToHsv(parseColor(color)))}
            >
              <span style={{ background: color }} />
            </button>
          ))}
        </div>
      )}
      {enableEyedropper && !hasDropper && (
        <p className="img-colour-hint">
          Screen sampling is unavailable here. Use the Color picker tool to sample your image.
        </p>
      )}
      <div className="img-colour-actions">
        {enableEyedropper && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasDropper}
            onClick={() => void pick()}
          >
            <I.Pipette size={16} aria-hidden="true" />
            Eyedropper
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!commitHex()) {
              hexInput.current?.focus();
              return;
            }
            pushRecentColor(
              hex && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(hex) ? rgbToHex(parseColor(hex)) : value,
            );
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </>
  );
}
