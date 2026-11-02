import { type Ref, useRef, useState } from "react";
import { useActiveTool, useEditorActions, useEditorReadOnly } from "./EditorContext";

/** One completion boundary, shared by phone, tablet and desktop inspectors. */
export function ToolActions({ ref, onClose }: { ref?: Ref<HTMLDivElement>; onClose?: () => void }) {
  const tool = useActiveTool();
  const { setActiveTool, cancelCurrentTool, runBusy } = useEditorActions();
  const { busyLabel } = useEditorReadOnly();
  const running = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    running.current = true;
    setWorking(true);
    setError(null);
    try {
      if (cancel) await runBusy("Cancelling…", cancelCurrentTool);
      else await setActiveTool("move");
      onClose?.();
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

  return (
    <div
      ref={(element) => {
        region.current = element;
        if (typeof ref === "function") return ref(element);
        if (ref) ref.current = element;
      }}
      className="air-editor-actions"
      role="group"
      aria-label="Edit actions"
    >
      {error && <p role="alert">{error}</p>}
      {!inspection && (
        <button
          type="button"
          aria-label="Cancel"
          className="air-button"
          disabled={working || !!busyLabel}
          onClick={() => void finish(true)}
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        aria-label={inspection ? "Close" : "Apply"}
        className={`air-button${inspection ? "" : " air-button--primary"}`}
        disabled={working || !!busyLabel}
        onClick={() => void finish(false)}
      >
        {inspection ? "Close" : "Apply"}
      </button>
    </div>
  );
}
