import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@base-ui/react/tooltip";
import { I } from "../components/icons";
import { useActiveTool, useEditorActions, useEditorReadOnly } from "./EditorContext";

/** One completion boundary, shared by phone, tablet and desktop inspectors. */
export function ToolActions({
  compact = false,
  feedback,
  onClose,
}: {
  compact?: boolean;
  feedback?: HTMLElement | null;
  onClose?: () => void;
}) {
  const tool = useActiveTool();
  const { setActiveTool, cancelCurrentTool, runBusy } = useEditorActions();
  const { busyLabel } = useEditorReadOnly();
  const running = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const region = useRef<HTMLDivElement | null>(null);
  const inspection = tool === "move" || tool === "color" || tool === "idphoto";

  const finish = async (cancel: boolean) => {
    if (running.current || busyLabel) return;
    if (!cancel && !inspection) {
      const panel = region.current?.closest(".editor-mobile-surface, .editor-properties");
      const invalid = panel?.querySelector<HTMLElement>(
        '[aria-invalid="true"], input:invalid, textarea:invalid',
      );
      if (invalid) {
        invalid.focus();
        setError("Correct the highlighted value before applying.");
        return;
      }
      if (panel?.querySelector("[inert]")) {
        setError("Choose Whole image or finish subject detection before applying.");
        return;
      }
      if (panel?.querySelector("[data-tool-blocked]")) {
        setError("Spread the four corners apart before applying.");
        return;
      }
    }
    // Completion removes this panel. Keep keyboard users at its persistent
    // tool shortcut instead of dropping focus onto the document body.
    const returnFocus = region.current?.contains(document.activeElement)
      ? document.querySelector<HTMLElement>(
          '.editor-compact-nav [aria-pressed="true"], .editor-toolrail [aria-pressed="true"], .editor-compact-nav [aria-label="Open tools"]',
        )
      : null;
    running.current = true;
    setWorking(true);
    setError(null);
    try {
      if (cancel) await runBusy("Cancelling…", cancelCurrentTool);
      else await setActiveTool("move");
      onClose?.();
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && document.activeElement === document.body)
          returnFocus.focus({ preventScroll: true });
      });
    } catch {
      setError(
        cancel
          ? "Could not cancel. Try again."
          : "Could not apply. Your edit is still open. Try again.",
      );
    } finally {
      running.current = false;
      setWorking(false);
    }
  };

  const message = error ? (
    <p id={errorId} role="alert">
      {error}
    </p>
  ) : null;
  return (
    <Tooltip.Provider delay={400}>
      <div
        ref={region}
        className={`air-editor-actions${compact ? " air-editor-actions--compact" : ""}`}
        role="group"
        aria-label="Edit actions"
        aria-describedby={error ? errorId : undefined}
      >
        {message && (compact && feedback ? createPortal(message, feedback) : message)}
        {!inspection && (
          <CompletionButton
            label="Cancel"
            compact={compact}
            disabled={working || !!busyLabel}
            onClick={() => void finish(true)}
          />
        )}
        <CompletionButton
          label={inspection ? "Close" : "Apply"}
          compact={compact}
          disabled={working || !!busyLabel}
          onClick={() => void finish(false)}
        />
      </div>
    </Tooltip.Provider>
  );
}

function CompletionButton({
  label,
  compact,
  disabled,
  onClick,
}: {
  label: "Cancel" | "Apply" | "Close";
  compact: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const hintId = useId();
  const iconOnly = compact && label !== "Close";
  const Icon = label === "Cancel" ? I.X : I.Check;
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-describedby={iconOnly ? hintId : undefined}
      className={`${iconOnly ? "air-icon-button" : "air-button"}${label === "Apply" ? " air-button--primary" : ""}`}
      disabled={disabled}
      onClick={onClick}
    />
  );
  if (!iconOnly) return <button {...button.props}>{label}</button>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button}>
        <Icon size={18} stroke={1.6} aria-hidden="true" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          className="air-floating-positioner"
          side="top"
          sideOffset={8}
          collisionPadding={16}
          positionMethod="fixed"
        >
          <Tooltip.Popup id={hintId} role="tooltip" className="air-tooltip">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
