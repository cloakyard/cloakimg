// MobileMoreMenu.tsx — Overflow drawer for the mobile top bar. Houses
// the secondary actions (file info, compare, reset) so the bar itself
// can stay focused on the high-frequency triad (undo · redo · export).
//
// Renders as a bottom sheet via the shared ModalFrame for visual
// consistency with the other editor modals.

import { useEffect, useRef } from "react";
import { I } from "../icons";
import { ModalCloseButton, ModalFrame } from "../ModalFrame";
import { useFocusReturn, useFocusTrap } from "./useFocusReturn";

type IconComponent = (typeof I)[keyof typeof I];

interface Props {
  fileName: string;
  hasDoc: boolean;
  canReset: boolean;
  compareActive: boolean;
  onShowFileProps: () => void;
  onToggleCompare: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function MobileMoreMenu({
  fileName,
  hasDoc,
  canReset,
  compareActive,
  onShowFileProps,
  onToggleCompare,
  onReset,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusReturn(true);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet
      position="absolute"
      maxWidth="max-w-130"
      labelledBy="mobile-more-title"
      dialogRef={dialogRef}
    >
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div id="mobile-more-title" className="t-headline text-base">
          Actions
        </div>
        <ModalCloseButton onClose={onClose} iconSize={14} />
      </div>

      {/* Inner items kept transparent so the dialog's frosted bg-surface/85
          + backdrop-blur reads through. Dividers are very faint for the
          same reason — anything heavier reads as a stack of solid cards
          glued onto the glass instead of belonging to it. */}
      <div className="flex flex-col px-3 py-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        <MenuItem
          icon={I.Info}
          label="File information"
          hint={hasDoc ? fileName : "No file loaded"}
          disabled={!hasDoc}
          onClick={() => {
            onShowFileProps();
            onClose();
          }}
        />
        <Divider />
        <MenuItem
          icon={I.GitCompare}
          label={compareActive ? "Hide original" : "Show original"}
          hint={compareActive ? "Currently showing the source image" : "Compare against the source"}
          disabled={!hasDoc}
          active={compareActive}
          onClick={() => {
            onToggleCompare();
            onClose();
          }}
        />
        <Divider />
        <MenuItem
          icon={I.Refresh}
          label="Reset all edits"
          hint="Restore the original image"
          disabled={!canReset}
          onClick={() => {
            onClose();
            onReset();
          }}
        />
      </div>
    </ModalFrame>
  );
}

function Divider() {
  return <div className="mx-2 h-px bg-border-soft/40 dark:bg-dark-border-soft/40" />;
}

interface MenuItemProps {
  icon: IconComponent;
  label: string;
  hint?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}

function MenuItem({ icon: Icon, label, hint, disabled, active, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-2.5 py-2.5 text-left font-[inherit] text-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:text-dark-text ${
        active
          ? "bg-coral-50/70 dark:bg-coral-900/20"
          : "hover:bg-white/40 active:bg-white/55 dark:hover:bg-white/5 dark:active:bg-white/8"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          active
            ? "text-coral-700 dark:text-coral-300"
            : "text-text-muted dark:text-dark-text-muted"
        }`}
      >
        <Icon size={17} stroke={2.1} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{label}</span>
        {hint && (
          <span className="overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap text-text-muted dark:text-dark-text-muted">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
