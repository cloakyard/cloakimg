// useFocusReturn.ts — Save the active element on mount, restore focus
// to it on unmount. Modals call this so closing returns focus to the
// trigger button instead of dropping it onto the document body — keeps
// keyboard navigation predictable and screen readers oriented.
//
// Companion `useFocusTrap` keeps Tab inside the dialog while open so
// keyboard users can't accidentally tab into the underlying editor.

import { type RefObject, useEffect } from "react";

export function useFocusReturn(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      // Defer one tick — React often replaces the DOM before the
      // restored element is reachable.
      requestAnimationFrame(() => {
        if (previous && document.contains(previous)) {
          try {
            previous.focus({ preventScroll: true });
          } catch {
            // No-op: some browsers throw when focusing a stale node.
          }
        }
      });
    };
  }, [active]);
}

/** Trap Tab / Shift-Tab inside `containerRef` while `active`. The
 *  initial focus moves to the first focusable element. */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    if (!root) return;
    // Move initial focus into the dialog so Tab from outside doesn't
    // skip past it. Try a labelled element first, then any focusable.
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    const first = focusables()[0];
    if (first && !root.contains(document.activeElement)) {
      first.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const start = list[0];
      const end = list[list.length - 1];
      if (!start || !end) return;
      const cur = document.activeElement as HTMLElement | null;
      if (e.shiftKey && cur === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && cur === end) {
        e.preventDefault();
        start.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
    };
  }, [containerRef, active]);
}
