/** A precision field retains invalid drafts until corrected or explicitly reverted. */
import { useId, useRef, useState } from "react";
interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}
export function NumberField({
  value,
  min,
  max,
  step = 1,
  unit = "",
  label,
  labelledBy,
  disabled,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState("");
  const errorId = useId();
  const skipBlur = useRef(false);
  const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const format = (n: number) => String(Number(n.toFixed(precision)));
  const raw = draft ?? format(value);
  const parse = (text: string) =>
    /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text.trim()) ? Number(text) : NaN;
  const commit = () => {
    const n = parse(raw);
    if (!Number.isFinite(n) || n < min || n > max) {
      setError(`Enter ${format(min)} to ${format(max)}${unit ? ` ${unit}` : ""}.`);
      return false;
    }
    onCommit(Number(n.toFixed(precision)));
    setError("");
    setDraft(null);
    return true;
  };
  return (
    <span className="img-number">
      <span className="img-number__row">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="control-field"
          value={raw}
          disabled={disabled}
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-invalid={!!error || undefined}
          aria-describedby={
            [unit ? `${errorId}-unit` : "", error ? errorId : ""].filter(Boolean).join(" ") ||
            undefined
          }
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            if (draft !== null) commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(null);
              setError("");
            } else if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (commit()) {
                skipBlur.current = true;
                e.currentTarget.blur();
              }
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              const n = parse(raw);
              if (!Number.isFinite(n)) return;
              const next = Math.min(
                max,
                Math.max(min, n + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)),
              );
              onCommit(Number(next.toFixed(precision)));
              setDraft(null);
              setError("");
            }
          }}
        />
        <span id={`${errorId}-unit`} className="img-number__unit">
          {unit}
        </span>
      </span>
      {error && (
        <span id={errorId} className="img-field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
