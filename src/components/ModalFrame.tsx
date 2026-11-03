/** Shared Air dialog; Base UI owns the modal boundary, nested Escape and focus. */
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type RefObject,
} from "react";
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
  const [immediate, setImmediate] = useState(instant);
  const [returnTo] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const pending = useRef<(() => void) | undefined>(undefined),
    closed = useRef(false),
    closing = useRef(false);
  const close: CloseFn = (after, immediate = false) => {
    if (closed.current || closing.current) return;
    closing.current = true;
    pending.current = after;
    if (immediate) setImmediate(true);
    setOpen(false);
  };
  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={!dismissOnBackdrop}
      onOpenChange={(next) => {
        if (!next) close();
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
        <Dialog.Backdrop
          className="cloak-modal-scrim air-motion-backdrop"
          data-air-motion={immediate ? "immediate" : undefined}
        />
        <Dialog.Viewport className="cloak-modal-root">
          <Dialog.Popup
            ref={popup}
            onFocusCapture={(event) => {
              const target = event.target;
              const body = target.closest(".cloak-dialog__body");
              if (!body) return;
              const field = target.getBoundingClientRect();
              const viewport = body.getBoundingClientRect();
              // WebKit can focus a field without exposing it inside a flex scroller.
              if (field.top < viewport.top || field.bottom > viewport.bottom)
                target.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
            onClickCapture={(event) => {
              if (!open) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            aria-labelledby={labelledBy}
            aria-modal="true"
            className={`cloak-dialog air-motion-dialog ${modalClassName}`}
            data-air-motion={immediate ? "immediate" : undefined}
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
      className={`air-icon-button air-button--quiet air-dismiss ${className}`}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        if (close) close();
        else onClose();
      }}
    >
      <I.X size={iconSize} aria-hidden="true" />
    </Dialog.Close>
  );
}

/** Text dismissal shares the X/Escape lifecycle and cannot bypass its exit. */
export function ModalDismissButton({
  onClose,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onClose: () => void }) {
  const close = useModalClose();
  return (
    <button {...props} type="button" onClick={() => (close ? close() : onClose())}>
      {children}
    </button>
  );
}
