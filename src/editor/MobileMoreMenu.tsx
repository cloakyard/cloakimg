// Secondary compact-editor actions, shared by phone and tablet.
import { useRef } from "react";
import { useEditorActions, useEditorReadOnly } from "./EditorContext";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";

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

  return (
    <ModalFrame onClose={onClose} labelledBy="mobile-more-title" modalRef={modalRef}>
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
  const { setMode, setView } = useEditorActions();
  const { mode, view } = useEditorReadOnly();
  const dismiss = (after?: () => void) => {
    if (animatedClose) animatedClose(after);
    else {
      onClose();
      after?.();
    }
  };
  return (
    <>
      <div className="cloak-dialog__header">
        <div id="mobile-more-title" className="t-headline text-base">
          Actions
        </div>
        <ModalCloseButton onClose={onClose} iconSize={14} />
      </div>

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
            dismiss(onShowFileProps);
          }}
        />
        <MenuItem
          icon={I.Layers}
          label={mode === "single" ? "Batch editing" : "Single photo"}
          onClick={() => dismiss(() => setMode(mode === "single" ? "batch" : "single"))}
        />
        <Divider />
        <div className="editor-more-zoom">
          <span>Zoom · {Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Zoom out"
            onClick={() =>
              setView((value) => ({ ...value, zoom: Math.max(0.05, value.zoom / 1.2) }))
            }
          >
            <I.ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Zoom in"
            onClick={() => setView((value) => ({ ...value, zoom: Math.min(8, value.zoom * 1.2) }))}
          >
            <I.ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dismiss(() => setView({ zoom: 1, panX: 0, panY: 0 }))}
          >
            Fit
          </button>
        </div>
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
      className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border-none bg-transparent px-2.5 py-2.5 text-left font-[inherit] text-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-surface-soft" : "hover:bg-page-bg active:bg-surface-soft dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          active ? "text-text" : "text-text-muted"
        }`}
      >
        <Icon size={17} stroke={2.1} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.875rem] font-medium">{label}</span>
        {hint && (
          <span className="overflow-hidden text-[0.8125rem] text-ellipsis whitespace-nowrap text-text-muted">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
