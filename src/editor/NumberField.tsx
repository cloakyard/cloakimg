/** A native precision field retains invalid drafts until corrected or reverted. */
import { useEffect, useId, useRef, useState } from "react";
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
  const [error, setError] = useState("");
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const stepping = useRef(false);
  const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const display = String(Number(value.toFixed(precision)));
  // Leave the DOM in charge of partial native drafts (e.g. a lone minus).
  // React-controlled values cannot represent validity.badInput's visible text.
  useEffect(() => {
    if (input.current && !dirty.current) input.current.value = display;
  }, [display]);
  const commit = (field: HTMLInputElement) => {
    if (!field.value || !field.validity.valid) {
      setError(
        field.validity.stepMismatch
          ? `Use increments of ${step}${unit ? ` ${unit}` : ""}.`
          : `Enter ${min} to ${max}${unit ? ` ${unit}` : ""}.`,
      );
      return false;
    }
    dirty.current = false;
    setError("");
    onCommit(field.valueAsNumber);
    return true;
  };
  return (
    <span className="img-number">
      <span className="air-field-group img-number__row">
        <input
          ref={input}
          type="number"
          min={min}
          max={max}
          step={step}
          inputMode={min < 0 ? "text" : "decimal"}
          autoComplete="off"
          className="air-field"
          defaultValue={display}
          disabled={disabled}
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-invalid={!!error || undefined}
          aria-describedby={
            [unit ? `${errorId}-unit` : "", error ? errorId : ""].filter(Boolean).join(" ") ||
            undefined
          }
          onChange={(event) => {
            dirty.current = true;
            setError("");
            if (stepping.current) commit(event.currentTarget);
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            stepping.current = false;
            if (dirty.current) commit(event.currentTarget);
          }}
          onKeyUp={() => {
            stepping.current = false;
          }}
          onKeyDown={(event) => {
            const field = event.currentTarget;
            if (event.key === "Escape") {
              event.stopPropagation();
              dirty.current = false;
              field.value = display;
              setError("");
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              if (commit(field)) field.blur();
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.stopPropagation();
              // Do not repair an invalid typed draft by silently snapping it.
              if (!field.value || !field.validity.valid) {
                event.preventDefault();
                commit(field);
              } else if (event.shiftKey) {
                event.preventDefault();
                if (event.key === "ArrowUp") field.stepUp(10);
                else field.stepDown(10);
                commit(field);
              } else {
                stepping.current = true;
              }
            }
          }}
        />
        {unit && (
          <span id={`${errorId}-unit`} className="air-field-unit">
            {unit}
          </span>
        )}
      </span>
      {error && (
        <span id={errorId} className="img-field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
