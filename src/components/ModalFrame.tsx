/** Shared Air dialog; Base UI owns the modal boundary, nested Escape and focus. */
import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { I } from "./icons";
interface ModalFrameProps {
  onClose: () => void;
  instant?: boolean;
  labelledBy?: string;
  modalClassName?: string;
  modalRef?: RefObject<HTMLDivElement | null>;
  dismissOnBackdrop?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}
type CloseFn = (onSettled?: () => void, immediate?: boolean) => void;
const ModalCloseContext = createContext<CloseFn | null>(null);
export function ModalFrame({
  onClose,
  instant = false,
  labelledBy,
  modalClassName = "flex-col",
  modalRef,
  initialFocus,
  dismissOnBackdrop = true,
  children,
}: ModalFrameProps) {
  const fallback = useRef<HTMLDivElement>(null),
    popup = modalRef ?? fallback;
  const [open, setOpen] = useState(true);
  const [motion, setMotion] = useState(
    () =>
      !instant &&
      !document.activeElement?.matches(":focus-visible") &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [returnTo] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const pending = useRef<(() => void) | undefined>(undefined),
    closed = useRef(false);
  const close: CloseFn = (after, immediate = false) => {
    if (closed.current) return;
    pending.current = after;
    if (immediate || document.activeElement?.matches(":focus-visible")) setMotion(false);
    setOpen(false);
  };
  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={!dismissOnBackdrop}
      onOpenChange={(next, details) => {
        if (!next)
          close(
            undefined,
            details.reason === "escape-key" || details.event instanceof KeyboardEvent,
          );
      }}
      onOpenChangeComplete={(next) => {
        if (!next && !closed.current) {
          closed.current = true;
          onClose();
          pending.current?.();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="cloak-modal-scrim" data-motion={motion} />
        <Dialog.Viewport className="cloak-modal-root">
          <Dialog.Popup
            ref={popup}
            aria-labelledby={labelledBy}
            aria-modal="true"
            className={`cloak-dialog ${modalClassName}`}
            data-motion={motion}
            initialFocus={initialFocus ?? popup}
            finalFocus={() => (returnTo?.isConnected ? returnTo : false)}
          >
            <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function useModalClose() {
  return useContext(ModalCloseContext);
}
export function ModalCloseButton({
  onClose,
  label = "Close",
  iconSize = 18,
  className = "",
}: {
  onClose: () => void;
  label?: string;
  iconSize?: number;
  className?: string;
}) {
  const close = useModalClose();
  return (
    <Dialog.Close
      className={`cloak-dialog__close ${className}`}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        if (close) close(undefined, e.detail === 0);
        else onClose();
      }}
    >
      <I.X size={iconSize} aria-hidden="true" />
    </Dialog.Close>
  );
}
