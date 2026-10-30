// ConfirmModal.tsx — Themed confirm modal that replaces native
// `window.confirm` for destructive editor actions (e.g. reset). Uses
// the shared ModalFrame so the solid workbench aesthetic, focus
// trap, and bottom-sheet-on-mobile behaviour stay consistent with
// FilePropertiesModal / ExportModal.

import { useRef } from "react";
import type { ReactNode } from "react";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";
import type { Layout } from "./types";

type IconComponent = (typeof I)[keyof typeof I];

interface Props {
  layout: Layout;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconComponent;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  layout,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  icon: Icon = I.Refresh,
  onConfirm,
  onCancel,
}: Props) {
  const isMobile = layout === "mobile";
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Esc is handled centrally by ModalFrame so it routes through the
  // animated-close lifecycle. The Enter shortcut stays here.
  return (
    <ModalFrame
      onClose={onCancel}
      dismissOnBackdrop={false}
      initialFocus={cancelRef}
      labelledBy="confirm-modal-title"
      modalRef={modalRef}
    >
      <ConfirmModalBody
        cancelRef={cancelRef}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        Icon={Icon}
        isMobile={isMobile}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ModalFrame>
  );
}

interface BodyProps {
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  Icon: IconComponent;
  isMobile: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModalBody({
  cancelRef,
  title,
  message,
  confirmLabel,
  cancelLabel,
  Icon,
  isMobile,
  onConfirm,
  onCancel,
}: BodyProps) {
  // Route both the X-button and the explicit Cancel through the
  // animated-close lifecycle of the surrounding ModalFrame so the
  // modal slides / fades away instead of vanishing instantly.
  // Wrap so the click event isn't accidentally passed as `onSettled`.
  const animatedClose = useModalClose();
  const dismiss = () => (animatedClose ? animatedClose() : onCancel());

  return (
    <>
      <div className="cloak-dialog__header">
        <div className="flex items-center gap-2.5">
          <div className="cloak-dialog__icon">
            <Icon size={16} stroke={2.25} />
          </div>
          <div id="confirm-modal-title" className="t-headline text-base">
            {title}
          </div>
        </div>
        <ModalCloseButton onClose={onCancel} iconSize={14} />
      </div>

      <div className="cloak-dialog__body px-5 py-4 text-[13px] leading-relaxed text-text-muted">
        {message}
      </div>

      <div
        className={`cloak-dialog__footer ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
