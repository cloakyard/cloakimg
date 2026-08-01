/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * component: select · genre: modern-minimal · theme: DESIGN.md
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import type { ReactNode, SelectHTMLAttributes } from "react";
import { I } from "../components/icons";

type SelectControlState = "default" | "loading" | "error" | "success";

interface SelectControlProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "className"
> {
  children: ReactNode;
  /** The selected option rendered in CloakIMG's visual shell. */
  displayValue: string;
  /** Optional supporting line for dimensions, format, or selection provenance. */
  detail?: string;
  /** Dense one-line treatment for compact recipe rows. */
  compact?: boolean;
  className?: string;
  state?: SelectControlState;
}

/**
 * A branded visual shell over a real native select. The transparent native
 * control remains the interactive surface, so mobile keeps the platform
 * picker and keyboard/screen-reader behavior stays browser-native.
 */
export function SelectControl({
  children,
  displayValue,
  detail,
  compact = false,
  className = "",
  state = "default",
  disabled,
  ...selectProps
}: SelectControlProps) {
  const loading = state === "loading";
  const effectiveDisabled = disabled || loading;

  return (
    <span
      className={`select-control ${compact ? "select-control--compact" : ""} ${className}`}
      data-state={effectiveDisabled ? "disabled" : state}
    >
      <span className="select-control__content" aria-hidden="true">
        <span className="select-control__value" title={displayValue}>
          {loading ? "Loading…" : displayValue}
        </span>
        {!compact && detail ? <span className="select-control__detail">{detail}</span> : null}
      </span>
      <span className="select-control__indicator" aria-hidden="true">
        {state === "success" ? (
          <I.Check size={14} stroke={2.5} />
        ) : state === "error" ? (
          <I.AlertTriangle size={14} />
        ) : loading ? (
          <span className="select-control__spinner" />
        ) : (
          <I.ChevronDown size={15} stroke={2.25} />
        )}
      </span>
      <select
        {...selectProps}
        disabled={effectiveDisabled}
        aria-busy={loading || undefined}
        aria-invalid={state === "error" || undefined}
        className="select-control__native"
      >
        {children}
      </select>
    </span>
  );
}
