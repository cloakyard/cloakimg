// TopBar.tsx — The editor's top chrome: brand · file · single/batch
// toggle · undo/redo · zoom · Export. Reads/writes the editor context
// directly so tool components don't have to thread props.
//
// Theme is no longer toggleable here — light/dark follows the OS via
// `@media (prefers-color-scheme: dark)`. See [tokens.css](../tokens.css).

import { useCallback, useState } from "react";
import { BrandMark, I } from "../components/icons";
import { useSubjectMask } from "./ai/useSubjectMask";
import { ConfirmModal } from "./ConfirmModal";
import { useEditorActions, useEditorReadOnly } from "./EditorContext";
import { MobileMoreMenu } from "./MobileMoreMenu";

interface TopBarProps {
  onShowFileProps: () => void;
}

export function TopBar({ onShowFileProps }: TopBarProps) {
  // TopBar reads no tool state, so consuming the read-only + actions
  // slices (instead of the omnibus `useEditor()`) keeps it from
  // re-rendering on every slider tick.
  const { layout, mode, view, canUndo, canRedo, canReset, doc, compareActive } =
    useEditorReadOnly();
  const { setMode, setView, openExport, undo, redo, resetToOriginal, exit, setCompareActive } =
    useEditorActions();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // The CloakIMG mark is also a "Back to start" button — on a phone
  // it sits ~30 px above where the AI download modal draws, so a
  // mistap during a long model fetch used to drop the user back at
  // landing with no warning (and no console log, since it's a normal
  // route change). Confirm-on-exit gates that path while detection is
  // mid-flight; idle taps still navigate immediately.
  const aiState = useSubjectMask().state.status;
  const aiBusy = aiState === "loading" || aiState === "needs-consent";
  const onLogoClick = useCallback(() => {
    if (aiBusy) {
      setExitConfirmOpen(true);
      return;
    }
    exit();
  }, [aiBusy, exit]);

  const isMobile = layout === "mobile";
  const fileName = doc?.fileName ?? "untitled";
  const dimensions = doc?.width && doc?.height ? `${doc.width}×${doc.height}` : "";

  return (
    <>
      <header className="editor-topbar" data-compact={isMobile}>
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Back to start"
          className="editor-topbar__brand"
        >
          <BrandMark size={36} />
          <div className="logo-wordmark">
            Cloak<span>IMG</span>
          </div>
        </button>

        {!isMobile && <div className="h-4.5 w-px bg-border" />}

        {!isMobile && (
          <button
            type="button"
            onClick={() => doc && onShowFileProps()}
            disabled={!doc}
            title={dimensions ? `${fileName} · ${dimensions}` : fileName}
            className="editor-topbar__file btn btn-ghost btn-sm"
          >
            <span className="min-w-0 overflow-hidden font-medium whitespace-nowrap text-ellipsis">
              {fileName}
            </span>
            {dimensions && (
              <span className="editor-topbar__dimensions tabular-nums ml-1 shrink-0 whitespace-nowrap text-[0.8125rem] text-text-muted">
                · {dimensions}
              </span>
            )}
          </button>
        )}

        {!isMobile && (
          <div className="air-segments" role="group" aria-label="Editing mode">
            {(["single", "batch"] as const).map((m) => {
              const active = mode === m;
              const Ic = m === "single" ? I.FileImage : I.Layers;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  title={m === "single" ? "Single photo" : "Batch"}
                  aria-label={m === "single" ? "Single photo" : "Batch"}
                  aria-pressed={active}
                >
                  <Ic size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        <div className="editor-topbar__spacer" />

        <div className={`flex ${isMobile ? "gap-0" : "gap-0.5"}`}>
          <button
            type="button"
            className={`btn btn-ghost ${isMobile ? "btn-icon" : "btn-icon-sm"}`}
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => void undo()}
          >
            <I.Undo size={18} />
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${isMobile ? "btn-icon" : "btn-icon-sm"}`}
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => void redo()}
          >
            <I.Redo size={18} />
          </button>
          {!isMobile && (
            <button
              type="button"
              className="btn btn-ghost btn-icon-sm"
              aria-label="Reset to original"
              title="Reset to original"
              disabled={!canReset}
              onClick={() => setResetConfirmOpen(true)}
            >
              <I.Refresh size={18} />
            </button>
          )}
        </div>

        {!isMobile && <div className="h-4.5 w-px bg-border" />}

        {!isMobile && (
          <div className="editor-zoom">
            <button
              type="button"
              className="btn btn-ghost btn-icon-xs"
              onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.05, v.zoom / 1.2) }))}
              aria-label="Zoom out"
            >
              <I.ZoomOut size={16} />
            </button>
            <span className="tabular-nums min-w-9 px-1 text-center text-[0.8125rem] font-medium">
              {Math.round(view.zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon-xs"
              onClick={() => setView((v) => ({ ...v, zoom: Math.min(8, v.zoom * 1.2) }))}
              aria-label="Zoom in"
            >
              <I.ZoomIn size={16} />
            </button>
          </div>
        )}

        {!isMobile && (
          <button
            type="button"
            className={`btn btn-ghost btn-icon-sm ${compareActive ? "bg-surface-soft text-text" : ""}`}
            aria-label="Hold to compare with original"
            aria-pressed={compareActive}
            title="Hold to see the original"
            onPointerDown={() => setCompareActive(true)}
            onPointerUp={() => setCompareActive(false)}
            onPointerLeave={() => setCompareActive(false)}
            onPointerCancel={() => setCompareActive(false)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                setCompareActive(true);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") setCompareActive(false);
            }}
            onBlur={() => setCompareActive(false)}
            disabled={!doc}
          >
            <I.GitCompare size={18} />
          </button>
        )}

        {!isMobile && (
          <button
            type="button"
            className="editor-topbar__export btn btn-secondary btn-sm"
            onClick={openExport}
            aria-label="Export"
            title="Export"
          >
            <I.Download size={16} />
            Export
          </button>
        )}

        {isMobile && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Export"
            title="Export"
            disabled={!doc}
            onClick={openExport}
          >
            <I.Download size={18} />
          </button>
        )}

        {isMobile && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            onClick={() => setMoreMenuOpen(true)}
          >
            <I.MoreVertical size={18} />
          </button>
        )}
      </header>
      {resetConfirmOpen && (
        <ConfirmModal
          layout={layout}
          title="Reset all edits?"
          message="This restores the original image and discards every adjustment, layer, and tool change you've made. Your entire edit history will be wiped — there's no undo after this."
          confirmLabel="Reset"
          cancelLabel="Keep editing"
          icon={I.Refresh}
          onConfirm={() => {
            void resetToOriginal();
            setResetConfirmOpen(false);
          }}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
      {exitConfirmOpen && (
        <ConfirmModal
          layout={layout}
          title="Leave while AI download is running?"
          message="The on-device subject model is still downloading. Leaving now cancels it; your image stays on this device and can be reopened from Resume."
          confirmLabel="Leave"
          cancelLabel="Stay"
          icon={I.ArrowRight}
          onConfirm={() => {
            setExitConfirmOpen(false);
            exit();
          }}
          onCancel={() => setExitConfirmOpen(false)}
        />
      )}
      {moreMenuOpen && (
        <MobileMoreMenu
          fileName={fileName}
          hasDoc={!!doc}
          canReset={canReset}
          onShowFileProps={onShowFileProps}
          onReset={() => setResetConfirmOpen(true)}
          onClose={() => setMoreMenuOpen(false)}
        />
      )}
    </>
  );
}
