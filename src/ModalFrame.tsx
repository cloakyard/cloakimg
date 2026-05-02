// ModalFrame.tsx — Shared dialog frame: dimmed/blurred backdrop + glass
// card with the brand's translucent aesthetic. Handles click-outside,
// the desktop-centered vs mobile-bottom-sheet split, and positioning
// (`fixed` for full-viewport modals on the landing, `absolute` for
// modals scoped to the editor's `<main>` shell).
//
// Header / body / footer composition stays with the consumer — they
// pass children — but the close X is offered as `<ModalCloseButton>`
// so every modal lands on the same button styling without copying it.

import type { ReactNode, RefObject } from "react";
import { I } from "./icons";

interface ModalFrameProps {
  /** Fires on backdrop click and when the close button is clicked. */
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
   * Extra classes for the dialog (the inner glass card). Use this for
   * variants like `flex-row` layout on desktop. Defaults to `flex-col`.
   */
  dialogClassName?: string;
  /** Forwarded to the dialog element for `useFocusTrap`-style hooks. */
  dialogRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

const DIALOG_BASE =
  "relative flex w-full overflow-hidden border border-border-soft bg-surface/85 backdrop-blur-xl backdrop-saturate-150 dark:border-dark-border dark:bg-dark-surface/85";

export function ModalFrame({
  onClose,
  bottomSheet = false,
  position = "fixed",
  maxWidth = "max-w-160",
  labelledBy,
  dialogClassName = "flex-col",
  dialogRef,
  children,
}: ModalFrameProps) {
  const sheetRadius = bottomSheet ? "rounded-t-3xl" : "rounded-3xl";
  const heightClamp = bottomSheet ? "max-h-[92%]" : "max-h-[calc(100%-48px)]";
  const layout = bottomSheet ? "items-end p-0" : "items-center p-6";

  return (
    <div
      className={`${position} inset-0 z-100 flex justify-center ${layout}`}
      style={{
        background: "rgba(20,14,8,0.32)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {/* Invisible full-bleed close target — accessible click-outside
          without needing keyboard handlers on a div backdrop. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default border-none bg-transparent p-0"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`${DIALOG_BASE} ${maxWidth} ${sheetRadius} ${heightClamp} ${dialogClassName}`}
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {children}
      </div>
    </div>
  );
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
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-icon-sm ${className}`}
      aria-label={label}
      onClick={onClose}
    >
      <I.X size={iconSize} />
    </button>
  );
}
