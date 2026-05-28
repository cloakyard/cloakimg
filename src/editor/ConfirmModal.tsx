// ConfirmModal.tsx — Themed confirm modal that replaces native
// `window.confirm` for destructive editor actions (e.g. reset). Uses
// the shared ModalFrame so the translucent glass aesthetic, focus
// trap, and bottom-sheet-on-mobile behaviour stay consistent with
// FilePropertiesModal / ExportModal.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";
import type { Layout } from "./types";
import { useFocusReturn, useFocusTrap } from "./useFocusReturn";

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
  useFocusReturn(true);
  useFocusTrap(modalRef, true);
  // Esc is handled centrally by ModalFrame so it routes through the
  // animated-close lifecycle. The Enter shortcut stays here.
  return (
    <ModalFrame
      onClose={onCancel}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-105"
      labelledBy="confirm-modal-title"
      modalRef={modalRef}
    >
      <ConfirmModalBody
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
  title,
  message,
  confirmLabel,
  cancelLabel,
  Icon,
  isMobile,
  onConfirm,
  onCancel,
}: BodyProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Route both the X-button and the explicit Cancel through the
  // animated-close lifecycle of the surrounding ModalFrame so the
  // modal slides / fades away instead of vanishing instantly.
  // Wrap so the click event isn't accidentally passed as `onSettled`.
  const animatedClose = useModalClose();
  const dismiss = () => (animatedClose ? animatedClose() : onCancel());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm]);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
            <Icon size={16} stroke={2.25} />
          </div>
          <div id="confirm-modal-title" className="t-headline text-base">
            {title}
          </div>
        </div>
        <ModalCloseButton onClose={onCancel} iconSize={14} />
      </div>

      <div className="px-5 py-4 text-[13px] leading-relaxed text-text-muted">{message}</div>

      <div
        className={`flex justify-end gap-2 border-t border-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
