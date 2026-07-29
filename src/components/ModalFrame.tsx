// ModalFrame.tsx — Shared modal frame: named scrim + solid paper
// instrument. Handles click-outside,
// the desktop-centered vs mobile-bottom-sheet split, positioning
// (`fixed` for full-viewport modals on the landing, `absolute` for
// modals scoped to the editor's `<main>` shell), and owns the open /
// close motion for every modal in the app.
//
// Motion lifecycle:
//   • On mount → backdrop + modal play their enter animations
//     (`ci-modal-backdrop-enter` + `ci-modal-card-enter` /
//     `ci-modal-sheet-enter`).
//   • When the consumer's onClose request arrives, ModalFrame flips
//     into `closing` mode: the exit animations run (`ci-modal-…-exit`),
//     and only after they settle does the real `onClose` fire so the
//     parent can unmount. Consumers keep their existing
//     `<ModalFrame onClose={...}>` API — they don't have to thread an
//     isOpen prop or animation events.
//
// Header / body / footer composition stays with the consumer — they
// pass children — but the close X is offered as `<ModalCloseButton>`
// so every modal lands on the same button styling without copying it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { I } from "./icons";

interface ModalFrameProps {
  /** Fires on backdrop click and when the close button is clicked.
   *  ModalFrame delays the call until its exit animation finishes so
   *  the parent's unmount happens after motion settles. */
  onClose: () => void;
  /** Render as a bottom sheet (mobile) instead of a centered card. */
  bottomSheet?: boolean;
  /** `fixed` for full-viewport (landing) or `absolute` for editor-scoped. */
  position?: "fixed" | "absolute";
  /** Tailwind max-width utility, e.g. `max-w-160`. */
  maxWidth?: string;
  /** Optional aria-labelledby id pointing into the header content. */
  labelledBy?: string;
  /**
   * Extra classes for the modal (the inner solid card). Use this for
   * variants like `flex-row` layout on desktop. Defaults to `flex-col`.
   */
  modalClassName?: string;
  /** Forwarded to the modal element for `useFocusTrap`-style hooks. */
  modalRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

const MODAL_BASE = "cloak-dialog relative flex w-full overflow-hidden";

// Exit-animation budget. Must stay in sync with the longer of the
// `ci-modal-*-exit` keyframe durations in style.css (sheet exit
// runs --dur-base = 240 ms; card exit runs --dur-fast = 180 ms). We
// pad a frame so the animation has visibly settled before the parent
// unmounts the modal.
const EXIT_MS = 260;

export function ModalFrame({
  onClose,
  bottomSheet = false,
  position = "fixed",
  maxWidth = "max-w-160",
  labelledBy,
  modalClassName = "flex-col",
  modalRef,
  children,
}: ModalFrameProps) {
  const sheetRadius = bottomSheet ? "rounded-t-lg border-b-0" : "rounded-lg";
  const heightClamp = bottomSheet ? "max-h-[92%]" : "max-h-[calc(100%-48px)]";
  const layout = bottomSheet ? "items-end p-0" : "items-center p-6";

  // The exit animation has to play BEFORE the parent unmounts the
  // <ModalFrame> tree. We track `closing` locally, swap the entrance
  // classes for exit ones, then call the real onClose once the exit
  // animation has elapsed. Guarded with closeRequestedRef so double-
  // taps (Esc + backdrop click, or two quick backdrop clicks during
  // the exit window) don't re-arm the timer.
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRequestedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback((onSettled?: () => void) => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
      onSettled?.();
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Centralised Escape handling. Every prior modal duplicated this
  // effect at the consumer level just to call its onClose; with the
  // animation lifecycle owned here, doing it once in ModalFrame both
  // saves the duplication and makes Esc go through the same animated
  // path as backdrop clicks / X-button clicks. Consumers that want a
  // different Esc behaviour (e.g. a Crop session that has its own
  // rollback) wire it as a no-op on their own — but for a modal,
  // Esc should always animate out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    // Capture so we run before any consumer-level Esc handlers that
    // might still be wired to a non-animated onClose. We swallow Esc
    // via stopPropagation so the underlying handlers don't double-fire.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [requestClose]);

  // Lock the underlying document while a modal is mounted so that
  // scrolling inside the modal doesn't bleed through to the page
  // behind it (especially on iOS where overscroll otherwise pulls the
  // landing page into view). Each modal saves and restores the
  // previous values so nested or back-to-back modals leave the page
  // exactly as they found it.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, []);

  // Make the overlay a genuine modal interaction boundary. Background
  // siblings become inert (including an expanded mobile tool drawer
  // behind an AI-consent sheet), focus moves to the dialog container
  // without jumping its scroll position, and Tab stays inside.
  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]');
    if (!root || !parent || !dialog) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(parent.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root)
      .map((node) => ({
        node,
        wasInert: node.inert,
        previousAriaHidden: node.getAttribute("aria-hidden"),
      }));

    for (const { node } of siblings) {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    }
    dialog.focus({ preventScroll: true });

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onTab);

    return () => {
      dialog.removeEventListener("keydown", onTab);
      for (const { node, wasInert, previousAriaHidden } of siblings) {
        node.inert = wasInert;
        if (previousAriaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", previousAriaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const backdropMotion = closing ? "ci-modal-backdrop-exit" : "ci-modal-backdrop-enter";
  const modalMotion = closing
    ? bottomSheet
      ? "ci-modal-sheet-exit"
      : "ci-modal-card-exit"
    : bottomSheet
      ? "ci-modal-sheet-enter"
      : "ci-modal-card-enter";

  return (
    <div
      ref={rootRef}
      className={`${position} cloak-modal-root inset-0 z-100 flex justify-center ${layout} ${backdropMotion}`}
    >
      {/* Invisible full-bleed close target — accessible click-outside
          without needing keyboard handlers on a div backdrop. */}
      <button
        type="button"
        onClick={() => requestClose()}
        aria-label="Close modal"
        className="cloak-modal-scrim absolute inset-0 cursor-default border-none p-0"
        tabIndex={-1}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${MODAL_BASE} ${maxWidth} ${sheetRadius} ${heightClamp} ${modalClassName} ${modalMotion}`}
      >
        {/* Inject the close-aware onClose down to descendants via a
            local context-equivalent: every <ModalCloseButton onClose>
            in the children should call `requestClose` instead of the
            raw prop, but the simplest way to keep the existing API is
            to expose requestClose via a React context. For backward
            compatibility we let consumers keep wiring their own X
            buttons; they call the same onClose they were given, which
            (because consumers pass `requestClose` semantics to us, not
            the other way) means they always go through ModalFrame's
            lifecycle. To make that universal we intercept onClose via
            this provider. */}
        <ModalCloseContext.Provider value={requestClose}>{children}</ModalCloseContext.Provider>
      </div>
    </div>
  );
}

// Internal context that <ModalCloseButton> (and any other descendant
// that wants to dismiss the modal) reads to route their click through
// the animated-close lifecycle. Consumers that already have their own
// "Cancel" / "Done" buttons should call `useModalClose()` and use the
// returned function instead of the bare onClose prop they were given.
//
// The returned function accepts an optional `onSettled` callback that
// fires after the exit animation completes — useful when a menu item
// both dismisses the modal AND opens something else (a confirm modal,
// say). Without the callback, opening the next modal mid-animation
// stacks two modals on top of each other while the first one fades.
type CloseFn = (onSettled?: () => void) => void;
const ModalCloseContext = createContext<CloseFn | null>(null);

/** Returns the animated-close trigger for the enclosing ModalFrame, or
 *  null if called outside one. Use this in custom dismiss buttons so
 *  the exit animation runs before the parent unmounts. Pass an optional
 *  `onSettled` callback to run code after the animation completes. */
export function useModalClose(): CloseFn | null {
  return useContext(ModalCloseContext);
}

interface ModalCloseButtonProps {
  onClose: () => void;
  /** Override the default "Close" aria-label. */
  label?: string;
  /** Defaults to 16px (StartModal/PrivacyModal); FilePropertiesModal uses 14. */
  iconSize?: number;
  className?: string;
}

export function ModalCloseButton({
  onClose,
  label = "Close",
  iconSize = 16,
  className = "",
}: ModalCloseButtonProps) {
  // Prefer the ModalFrame's animated-close trigger when we're inside
  // one; otherwise fall back to the bare onClose prop (kept for
  // backward compatibility with any future use outside ModalFrame).
  const animatedClose = useModalClose();
  // Wrap in an arrow that drops the click event — animatedClose's
  // optional `onSettled` arg would otherwise receive the MouseEvent.
  const dismiss = () => (animatedClose ? animatedClose() : onClose());
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-icon-sm ${className}`}
      aria-label={label}
      onClick={dismiss}
    >
      <I.X size={iconSize} />
    </button>
  );
}
