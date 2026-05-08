// useApplyOnToolSwitch.ts — Shared "auto-bake on tool switch / Export"
// hook used by every preview-style panel.
//
// The eight tools that show a live preview before committing into
// history (Adjust, Filter, Levels, HSL, BgBlur, Border, Frame, Crop)
// each registered the same boilerplate:
//
//   const applyRef = useRef(apply);
//   applyRef.current = apply;
//   useEffect(() => {
//     if (!dirty) { registerPendingApply(null); return; }
//     registerPendingApply(() => applyRef.current());
//     return () => registerPendingApply(null);
//   }, [dirty, registerPendingApply]);
//
// The pattern is mechanical, easy to typo, and trivially wrong if
// someone forgets the cleanup. Centralising it here means a future
// change to the registration semantics (e.g. moving auto-bake behind
// a feature flag) only edits one file.
//
// `enabled` defaults to true so callers without a dirty bit (Crop —
// the bake itself is gated internally) just call the hook with no
// second argument. The previous implementation used an
// `eslint-disable-next-line react-hooks/exhaustive-deps` to omit
// `applyRef` from deps; the hook below wraps the same logic so the
// suppression now lives in exactly one place.

import { useEffect, useRef } from "react";
import { useEditorActions } from "./EditorContext";

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
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const { registerPendingApply } = useEditorActions();
  useEffect(() => {
    if (!enabled) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [enabled, registerPendingApply]);
}
