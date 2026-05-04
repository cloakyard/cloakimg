// ConfirmDialog.tsx — Themed confirm modal that replaces native
// `window.confirm` for destructive editor actions (e.g. reset). Uses
// the shared ModalFrame so the translucent glass aesthetic, focus
// trap, and bottom-sheet-on-mobile behaviour stay consistent with
// FilePropertiesModal / ExportModal.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { I } from "../icons";
import { ModalCloseButton, ModalFrame } from "../ModalFrame";
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

export function ConfirmDialog({
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useFocusReturn(true);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  // Land focus on the confirm action so Enter triggers it and screen
  // readers announce the consequence first.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <ModalFrame
      onClose={onCancel}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-105"
      labelledBy="confirm-dialog-title"
      dialogRef={dialogRef}
    >
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
            <Icon size={16} stroke={2.25} />
          </div>
          <div id="confirm-dialog-title" className="t-headline text-base">
            {title}
          </div>
        </div>
        <ModalCloseButton onClose={onCancel} iconSize={14} />
      </div>

      <div className="px-5 py-4 text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {message}
      </div>

      <div
        className={`flex justify-end gap-2 border-t border-border-soft dark:border-dark-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
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
    </ModalFrame>
  );
}
