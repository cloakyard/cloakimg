/** Register only the active tool’s pending bake; retained exit controls are presentation-only. */
import { useEffect, useRef } from "react";
import { useEditorActions, useActiveTool } from "./EditorContext";

/** Register the panel's `apply` callback so it auto-fires when the
 *  user switches tools or opens Export.
 *
 *  - `apply` may be a fresh closure each render — the hook stashes the
 *    latest reference in a ref so the registered callback always
 *    invokes the most recent version, while the registration itself
 *    only re-runs when `enabled` flips. That avoids re-registering on
 *    every slider tick, which would churn the EditorContext's pending-
 *    apply slot at 60 Hz during a drag.
 *
 *  - `enabled` is the panel's "is there anything to apply?" predicate
 *    (typically `dirty`). When false, the hook clears the slot so a
 *    pristine panel doesn't push a no-op bake into history on tool
 *    switch. Crop omits this argument because its `apply()` is
 *    self-gated. */
export function useApplyOnToolSwitch(apply: () => void | Promise<void>, enabled = true): void {
  const activeTool = useActiveTool();
  const owner = useRef(activeTool);
  const active = enabled && owner.current === activeTool;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const { registerPendingApply } = useEditorActions();
  useEffect(() => {
    if (!active) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [active, registerPendingApply]);
}
