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
      <header
        // V5 (May 2026 desktop minimalist redesign) — desktop drops the
        // glass surface and backdrop blur and sits directly on cream,
        // but keeps a hairline soft bottom divider so the toolbar still
        // reads as its own band above the canvas. Mobile is fully
        // chrome-free — no divider — so the brand mark, canvas, and
        // collapsed Tools pill flow as one continuous plane.
        className={
          isMobile
            ? "editor-topbar flex h-16 shrink-0 items-center gap-1.5 border-b border-border px-3 py-3"
            : "editor-topbar flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 py-3"
        }
      >
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Back to start"
          className="editor-topbar__brand flex cursor-pointer items-center gap-2 rounded-md border-none bg-transparent p-0 font-[inherit] text-inherit pointer-coarse:min-h-11"
        >
          <BrandMark size={40} />
          {/* Brand mark + wordmark sized identically across breakpoints
              in V3 — the prior mobile-shrunk treatment made the editor
              feel apologetic at the top of the screen. With the TopBar
              chrome stripped on mobile, full-size branding sits cleanly
              on the cream page. */}
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
            className="editor-topbar__file flex min-w-0 max-w-60 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-border-soft bg-transparent px-2.5 py-1 font-[inherit] text-[12px] text-inherit transition-colors hover:bg-surface pointer-coarse:min-h-11"
          >
            <span className="min-w-0 overflow-hidden font-medium whitespace-nowrap text-ellipsis">
              {fileName}
            </span>
            {dimensions && (
              <span className="editor-topbar__dimensions t-mono ml-1 shrink-0 whitespace-nowrap text-[11px] text-text-muted">
                · {dimensions}
              </span>
            )}
          </button>
        )}

        {/* Single/Batch — V4 (May 2026) compressed to a small icon-led
            segmented control. The prior chips were the largest visual
            target in the toolbar despite Batch being a power-user
            feature most sessions never touch; the tighter pair keeps
            Batch one click away without dominating the chrome. */}
        {!isMobile && (
          <div className="flex rounded-md border border-border-soft p-0.5 pointer-coarse:p-0">
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
                  className={`flex h-6 w-7 cursor-pointer items-center justify-center rounded-sm border-none font-[inherit] transition-colors pointer-coarse:h-11 pointer-coarse:w-11 ${
                    active
                      ? "bg-surface text-text shadow-[var(--shadow-control)]"
                      : "bg-transparent text-text-muted hover:text-text"
                  }`}
                >
                  <Ic size={12} />
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1" />

        {/* V4 (May 2026) — the "Private" shield pill was decoration
            inside the editor: the user has already chosen the tool, and
            the brand mark + privacy framing on landing has already
            established the contract. Stripping it tightens the toolbar
            and lets undo / redo / zoom / compare carry the actionable
            chrome unchallenged. */}

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

        {!isMobile && <div className="h-4.5 w-px bg-border" />}

        {!isMobile && (
          <div className="flex items-center gap-1 rounded-lg border border-border-soft p-0.5">
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

        {/* Desktop keeps Export as the brand-coloured CTA in the TopBar.
            On mobile the V3 minimalist redesign collapses the prior
            3-way bottom nav (Looks · Tools · Export) into a single
            floating Tools pill, so Export gets surfaced here as a
            ghost icon button — one tap away from the canvas idle view
            without competing with the pill for the bottom margin. */}
        {!isMobile && (
          <button
            type="button"
            className="btn btn-outline-coral btn-sm"
            onClick={openExport}
            aria-label="Export"
            title="Export"
          >
            <I.Download size={13} />
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
            <I.Download size={17} />
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
