// TopBar.tsx — The editor's top chrome: brand · file · single/batch
// toggle · undo/redo · zoom · Export. Reads/writes the editor context
// directly so tool components don't have to thread props.
//
// Theme is no longer toggleable here — light/dark follows the OS via
// `@media (prefers-color-scheme: dark)`. See [tokens.css](../tokens.css).

import { useState } from "react";
import { BrandMark, I } from "../components/icons";
import { ConfirmDialog } from "./ConfirmDialog";
import { useEditor } from "./EditorContext";
import { MobileMoreMenu } from "./MobileMoreMenu";

interface TopBarProps {
  onShowFileProps: () => void;
}

export function TopBar({ onShowFileProps }: TopBarProps) {
  const {
    layout,
    mode,
    setMode,
    view,
    setView,
    openExport,
    undo,
    redo,
    resetToOriginal,
    canUndo,
    canRedo,
    canReset,
    doc,
    exit,
    compareActive,
    setCompareActive,
  } = useEditor();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const isMobile = layout === "mobile";
  const fileName = doc?.fileName ?? "untitled";
  const dimensions = doc?.width && doc?.height ? `${doc.width}×${doc.height}` : "";

  return (
    <>
      <div
        // Glassmorphism — translucent surface + backdrop-blur so the
        // canvas / grainient backdrop tints the bar slightly. Matches
        // the bottom MobileToolbar so chrome reads as a single
        // floating layer around the photo.
        className={`editor-paper flex h-16 shrink-0 items-center border-b border-border bg-surface/85 py-3 backdrop-blur-xl backdrop-saturate-150 dark:border-dark-border dark:bg-dark-surface/85 ${
          isMobile ? "gap-1.5 px-2.5" : "gap-3 px-4"
        }`}
      >
        <button
          type="button"
          onClick={exit}
          aria-label="Back to start"
          className="flex cursor-pointer items-center gap-2.5 border-none bg-transparent p-0 font-[inherit] text-inherit"
        >
          <BrandMark
            size={40}
            style={{
              filter: "drop-shadow(0 2px 6px rgba(245, 97, 58, 0.28))",
            }}
          />
          <div className="logo-wordmark" style={{ fontSize: 19, letterSpacing: "-0.025em" }}>
            Cloak<span>IMG</span>
          </div>
        </button>

        {!isMobile && <div className="h-4.5 w-px bg-border dark:bg-dark-border" />}

        {!isMobile && (
          <button
            type="button"
            onClick={() => doc && onShowFileProps()}
            disabled={!doc}
            title={dimensions ? `${fileName} · ${dimensions}` : fileName}
            className="flex min-w-0 max-w-60 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border-none bg-page-bg px-2.5 py-1 font-[inherit] text-[12.5px] text-inherit transition-colors hover:bg-page-bg dark:bg-dark-page-bg dark:hover:bg-dark-page-bg"
          >
            <span className="min-w-0 overflow-hidden font-medium whitespace-nowrap text-ellipsis">
              {fileName}
            </span>
            {dimensions && (
              <span className="t-mono ml-1 shrink-0 whitespace-nowrap text-[11px] text-text-muted dark:text-dark-text-muted">
                · {dimensions}
              </span>
            )}
          </button>
        )}

        {!isMobile && (
          <div className="flex rounded-lg border border-border-soft bg-page-bg p-0.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
            {(["single", "batch"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border-none px-3 py-1 font-[inherit] text-[11.5px] font-semibold capitalize ${
                    active
                      ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-dark-surface dark:text-dark-text"
                      : "bg-transparent text-text-muted dark:text-dark-text-muted"
                  }`}
                >
                  {m === "batch" && <I.Layers size={11} />}
                  {m}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1" />

        {!isMobile && (
          <>
            <span
              className="inline-flex items-center gap-1.5 text-[12px] text-text-muted dark:text-dark-text-muted"
              title="Every edit stays on this device. No uploads, no telemetry, no AI."
            >
              <I.Shield size={13} stroke={2.25} className="text-coral-500 dark:text-coral-400" />
              Private
            </span>
            <div className="h-4.5 w-px bg-border dark:bg-dark-border" />
          </>
        )}

        <div className={`flex ${isMobile ? "gap-0" : "gap-0.5"}`}>
          <button
            type="button"
            className={`btn btn-ghost ${isMobile ? "btn-icon" : "btn-icon-sm"}`}
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => void undo()}
          >
            <I.Undo size={isMobile ? 17 : 15} />
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${isMobile ? "btn-icon" : "btn-icon-sm"}`}
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => void redo()}
          >
            <I.Redo size={isMobile ? 17 : 15} />
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
              <I.Refresh size={15} />
            </button>
          )}
        </div>

        {!isMobile && <div className="h-4.5 w-px bg-border dark:bg-dark-border" />}

        {!isMobile && (
          <div className="flex items-center gap-1 rounded-lg bg-page-bg p-0.5 dark:bg-dark-page-bg">
            <button
              type="button"
              className="btn btn-ghost btn-icon-xs"
              onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.05, v.zoom / 1.2) }))}
              aria-label="Zoom out"
            >
              <I.ZoomOut size={13} />
            </button>
            <span className="t-mono min-w-9 px-1 text-center text-[11px] font-semibold">
              {Math.round(view.zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon-xs"
              onClick={() => setView((v) => ({ ...v, zoom: Math.min(8, v.zoom * 1.2) }))}
              aria-label="Zoom in"
            >
              <I.ZoomIn size={13} />
            </button>
          </div>
        )}

        {!isMobile && (
          <button
            type="button"
            className={`btn btn-ghost btn-icon-sm ${
              compareActive
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : ""
            }`}
            aria-label="Hold to compare with original"
            aria-pressed={compareActive}
            title="Hold to see the original"
            onPointerDown={() => setCompareActive(true)}
            onPointerUp={() => setCompareActive(false)}
            onPointerLeave={() => setCompareActive(false)}
            onPointerCancel={() => setCompareActive(false)}
            disabled={!doc}
          >
            <I.GitCompare size={15} />
          </button>
        )}

        <button
          type="button"
          className={
            isMobile
              ? "btn btn-ghost btn-icon text-coral-600 dark:text-coral-400"
              : "btn btn-outline-coral btn-sm"
          }
          onClick={openExport}
          aria-label="Export"
          title="Export"
        >
          <I.Download size={isMobile ? 18 : 13} />
          {!isMobile && "Export"}
        </button>

        {isMobile && (
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${
              compareActive
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : ""
            }`}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            onClick={() => setMoreMenuOpen(true)}
          >
            <I.MoreVertical size={18} />
          </button>
        )}
      </div>
      {resetConfirmOpen && (
        <ConfirmDialog
          layout={layout}
          title="Reset all edits?"
          message="This restores the original image and discards every adjustment, layer, and tool change you've made. This can't be undone."
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
      {moreMenuOpen && (
        <MobileMoreMenu
          fileName={fileName}
          hasDoc={!!doc}
          canReset={canReset}
          compareActive={compareActive}
          onShowFileProps={onShowFileProps}
          onToggleCompare={() => setCompareActive(!compareActive)}
          onReset={() => setResetConfirmOpen(true)}
          onClose={() => setMoreMenuOpen(false)}
        />
      )}
    </>
  );
}
