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
  // Release the outgoing focus trap before opening another modal.
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

      <div className="air-scroll air-editor-menu">
        <MenuItem
          icon={I.Info}
          label="File information"
          hint={hasDoc ? fileName : "No file loaded"}
          disabled={!hasDoc}
          onClick={() => {
            dismiss(onShowFileProps);
          }}
        />
        <MenuItem
          icon={I.Layers}
          label={mode === "single" ? "Batch editing" : "Single photo"}
          onClick={() => dismiss(() => setMode(mode === "single" ? "batch" : "single"))}
        />
        <Divider />
        <div className="air-editor-menu__zoom">
          <span>Zoom · {Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            className="air-button air-button--quiet air-icon-button"
            aria-label="Zoom out"
            onClick={() =>
              setView((value) => ({ ...value, zoom: Math.max(0.05, value.zoom / 1.2) }))
            }
          >
            <I.ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="air-button air-button--quiet air-icon-button"
            aria-label="Zoom in"
            onClick={() => setView((value) => ({ ...value, zoom: Math.min(8, value.zoom * 1.2) }))}
          >
            <I.ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="air-button air-button--quiet img-control--compact"
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
  return <hr />;
}

interface MenuItemProps {
  icon: IconComponent;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ icon: Icon, label, hint, disabled, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="air-button air-button--quiet air-editor-menu__item"
    >
      <Icon size={18} stroke={1.6} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="air-editor-menu__label">{label}</span>
        {hint && <span className="air-help air-editor-menu__context">{hint}</span>}
      </span>
    </button>
  );
}
