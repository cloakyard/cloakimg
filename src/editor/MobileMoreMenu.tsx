// MobileMoreMenu.tsx — Overflow drawer for the mobile top bar. Houses
// the secondary actions (file info, reset) so the bar itself can stay
// focused on the high-frequency triad (undo · redo · export).
//
// "Show original" used to live here too; it was demoted to a press-and-
// hold pill on the canvas because flipping back-and-forth via this menu
// took four taps. The pill (see ImageCanvas → MobileCompareButton) is
// now the single canonical compare affordance on mobile.
//
// Renders as a bottom sheet via the shared ModalFrame for visual
// consistency with the other editor modals.

import { useRef } from "react";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";
import { useFocusReturn, useFocusTrap } from "./useFocusReturn";

type IconComponent = (typeof I)[keyof typeof I];

interface Props {
  fileName: string;
  hasDoc: boolean;
  canReset: boolean;
  onShowFileProps: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function MobileMoreMenu({
  fileName,
  hasDoc,
  canReset,
  onShowFileProps,
  onReset,
  onClose,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusReturn(true);
  useFocusTrap(modalRef, true);

  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet
      position="absolute"
      // This drawer only ever renders in the mobile layout (≤ 760 px),
      // so it should span the full width edge-to-edge like the Export
      // sheet — a fixed cap (e.g. max-w-130 = 520 px) left it a narrow
      // centred sheet on 520–760 px viewports instead of a true drawer.
      maxWidth="max-w-none"
      labelledBy="mobile-more-title"
      modalRef={modalRef}
    >
      <MoreMenuBody
        fileName={fileName}
        hasDoc={hasDoc}
        canReset={canReset}
        onShowFileProps={onShowFileProps}
        onReset={onReset}
        onClose={onClose}
      />
    </ModalFrame>
  );
}

function MoreMenuBody({ fileName, hasDoc, canReset, onShowFileProps, onReset, onClose }: Props) {
  // Route the menu-item dismissals through the animated lifecycle. The
  // sheet has to play its slide-down before unmount or the dismiss
  // feels abrupt — every item triggers an action AND closes the menu.
  // The animated close accepts an onSettled callback that fires AFTER
  // the slide-down completes, which is how Reset preserves its
  // "close before showing the confirm modal" UX invariant.
  const animatedClose = useModalClose();
  const dismiss = (after?: () => void) => {
    if (animatedClose) animatedClose(after);
    else {
      onClose();
      after?.();
    }
  };
  return (
    <>
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
        <div id="mobile-more-title" className="t-headline text-base">
          Actions
        </div>
        <ModalCloseButton onClose={onClose} iconSize={14} />
      </div>

      {/* Inner items kept transparent so the modal's frosted bg-surface/85
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
            // Open the file-properties modal immediately so it slides
            // in while this menu slides out — the visual handoff feels
            // like one continuous gesture.
            onShowFileProps();
            dismiss();
          }}
        />
        <Divider />
        <MenuItem
          icon={I.Refresh}
          label="Reset all edits"
          hint="Restore the original image"
          disabled={!canReset}
          onClick={() => {
            // Dismiss first, THEN run reset (which opens a confirm
            // modal in the parent) — preserves the prior contract
            // that the menu fully closes before the confirm appears.
            dismiss(onReset);
          }}
        />
      </div>
    </>
  );
}

function Divider() {
  return <div className="mx-2 h-px bg-border-soft/40" />;
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
      className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-2.5 py-2.5 text-left font-[inherit] text-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-coral-50/70 dark:bg-coral-900/20"
          : "hover:bg-white/40 active:bg-white/55 dark:hover:bg-white/5 dark:active:bg-white/8"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          active ? "text-coral-700 dark:text-coral-300" : "text-text-muted"
        }`}
      >
        <Icon size={17} stroke={2.1} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{label}</span>
        {hint && (
          <span className="overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap text-text-muted">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
