// ConfirmDialog.tsx — Themed confirm modal that replaces native
// `window.confirm` for destructive editor actions (e.g. reset). Uses
// the shared ModalFrame so the translucent glass aesthetic, focus
// trap, and bottom-sheet-on-mobile behaviour stay consistent with
// FilePropertiesModal / ExportModal.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { I } from "../icons";
import { ModalFrame } from "../ModalFrame";
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
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
          <Icon size={18} stroke={2.25} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div id="confirm-dialog-title" className="t-headline text-base">
            {title}
          </div>
          <div className="mt-1 text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
            {message}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3 dark:border-dark-border-soft">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
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
