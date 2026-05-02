// TopBar.tsx — The editor's top chrome: brand · file · single/batch
// toggle · undo/redo · zoom · Export. Reads/writes the editor context
// directly so tool components don't have to thread props.
//
// Theme is no longer toggleable here — light/dark follows the OS via
// `@media (prefers-color-scheme: dark)`. See [tokens.css](../tokens.css).

import { BrandMark, I } from "../icons";
import { useEditor } from "./EditorContext";

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

  const isMobile = layout === "mobile";
  const fileName = doc?.fileName ?? "untitled";
  const dimensions = doc?.width && doc?.height ? `${doc.width}×${doc.height}` : "";

  return (
    <div
      className={`editor-paper flex shrink-0 items-center border-b border-border bg-surface dark:border-dark-border dark:bg-dark-surface ${
        isMobile ? "h-14 gap-1.5 px-2.5 py-2.5" : "h-16 gap-3 px-4 py-3"
      }`}
    >
      {!isMobile ? (
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
      ) : (
        <button
          type="button"
          onClick={exit}
          aria-label="Back to start"
          className="cursor-pointer border-none bg-transparent p-0"
        >
          <BrandMark
            size={32}
            style={{
              filter: "drop-shadow(0 2px 6px rgba(245, 97, 58, 0.28))",
            }}
          />
        </button>
      )}

      {!isMobile && <div className="h-4.5 w-px bg-border dark:bg-dark-border" />}

      <button
        type="button"
        onClick={() => doc && onShowFileProps()}
        disabled={!doc}
        title={dimensions ? `${fileName} · ${dimensions}` : fileName}
        className={`flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border-none font-[inherit] text-[12.5px] text-inherit transition-colors hover:bg-page-bg dark:hover:bg-dark-page-bg ${
          isMobile
            ? "max-w-35 bg-transparent p-0"
            : "max-w-60 bg-page-bg px-2.5 py-1 dark:bg-dark-page-bg"
        }`}
      >
        <span className="min-w-0 overflow-hidden font-medium whitespace-nowrap text-ellipsis">
          {fileName}
        </span>
        {!isMobile && dimensions && (
          <span className="t-mono ml-1 shrink-0 whitespace-nowrap text-[11px] text-text-muted dark:text-dark-text-muted">
            · {dimensions}
          </span>
        )}
      </button>

      {!isMobile && (
        <span
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted dark:text-dark-text-muted"
          title="Every edit stays on this device. No uploads, no telemetry, no AI."
        >
          <I.Shield size={13} stroke={2.25} className="text-coral-500 dark:text-coral-400" />
          Private
        </span>
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

      <div className="flex gap-0.5">
        <button
          type="button"
          className="btn btn-ghost btn-icon-sm"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
        >
          <I.Undo size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon-sm"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
        >
          <I.Redo size={15} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon-sm"
          aria-label="Reset to original"
          title="Reset to original"
          disabled={!canReset}
          onClick={() => {
            if (window.confirm("Reset all edits and restore the original image?")) {
              resetToOriginal();
            }
          }}
        >
          <I.Refresh size={15} />
        </button>
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

      <button
        type="button"
        className={`btn btn-ghost btn-icon-sm ${
          compareActive ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300" : ""
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

      {isMobile ? (
        <button
          type="button"
          className="btn btn-outline-coral btn-icon-sm"
          onClick={openExport}
          aria-label="Export"
          title="Export"
        >
          <I.Download size={14} />
        </button>
      ) : (
        <button type="button" className="btn btn-outline-coral btn-sm" onClick={openExport}>
          <I.Download size={13} />
          Export
        </button>
      )}
    </div>
  );
}
