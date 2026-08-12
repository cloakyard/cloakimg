// UnifiedEditor.tsx — The single CloakIMG editor surface.
//
// Mounts the EditorProvider and arranges the chrome around the canvas.
// All real work (image loading, history, mode toggling) lives in the
// context so individual tools can focus on their own concerns.

import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { I } from "../components/icons";
import type { StartChoice } from "../landing/StartModal";
import { Spinner } from "./atoms";
import { BatchCanvas, BatchPanel } from "./BatchView";
import {
  EditorProvider,
  useActiveTool,
  useEditorActions,
  useEditorReadOnly,
  useToolState,
} from "./EditorContext";
// Side-effect import: mutates Fabric's static ownDefaults to apply the
// coral brand colour to every selectable object's border / handles /
// IText cursor. Must be imported before any Fabric Canvas is created.
import "./fabricDefaults";
import { ExportModal, type ExportSettings } from "./ExportModal";
import { FilePropertiesModal } from "./FilePropertiesModal";
import { HistoryScrubber } from "./HistoryScrubber";
import { MaskConsentHost } from "./ai/ui/MaskConsentHost";
import { DetectFaceConsentHost } from "./ai/capabilities/detect-face/ConsentHost";
import { DepthConsentHost } from "./ai/capabilities/depth/ConsentHost";
import { MobileEditorSurface } from "./MobileEditorSurface";
import { PropertiesPanel } from "./PropertiesPanel";
import { StageHost, StageProvider } from "./StageHost";
import { ToolRail } from "./ToolRail";
import { ToolSearchModal } from "./ToolSearchModal";
import { ToolStage } from "./ToolStage";
import { TopBar } from "./TopBar";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

interface Props {
  initialDoc: StartChoice;
  onExit: () => void;
}

export function UnifiedEditor({ initialDoc, onExit }: Props) {
  // The card-variant ErrorBoundary sits *above* EditorProvider so a
  // render failure inside the editor subtree (a fabric internal, an
  // AI worker callback that arrives mid-render, the rare consent-flow
  // race that the user reported on first model download) recovers in
  // place rather than tripping the app-level modal boundary's "Go to
  // home" route. Default primary action is "Try again" (key-bump
  // remount); the secondary "Back to start" calls onExit so the user
  // chooses landing only if they explicitly want to bail.
  return (
    <ErrorBoundary
      variant="card"
      subsystem="panel"
      secondaryAction={{
        label: "Back to start",
        onClick: onExit,
        icon: <I.ArrowRight size={14} style={{ transform: "scaleX(-1)" }} />,
      }}
    >
      <EditorProvider initialDoc={initialDoc} onExit={onExit}>
        <StageProvider>
          <EditorShell />
        </StageProvider>
      </EditorProvider>
    </ErrorBoundary>
  );
}

function EditorShell() {
  // The chrome reads only the read-only + actions slices plus the cheap
  // `activeTool` primitive (the rail) — never the live tool state — so it
  // no longer re-renders on every slider tick. The one consumer that
  // needs live tool state (keyboard shortcuts) lives in its own
  // null-rendering child below.
  const { layout, mode, loading, busyLabel, error, exportOpen, canCancelCurrentTool } =
    useEditorReadOnly();
  const { setActiveTool, cancelCurrentTool, closeExport, undo, redo, replaceWithFile } =
    useEditorActions();
  const activeTool = useActiveTool();
  const isMobile = layout === "mobile";
  const isTablet = layout === "tablet";

  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 2, // WebP
    quality: 0.82,
    sizeBucket: 1,
  });
  const [filePropsOpen, setFilePropsOpen] = useState(false);
  const [toolSearchOpen, setToolSearchOpen] = useState(false);
  const [toolSearchKeyboardOpen, setToolSearchKeyboardOpen] = useState(false);

  const openToolSearch = useCallback((keyboard: boolean) => {
    setToolSearchKeyboardOpen(keyboard);
    setToolSearchOpen(true);
  }, []);

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) void redo();
      else void undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  // Esc on desktop/tablet → cancel the current tool session. Mirrors
  // mobile's ✕ tap (which `MobileEditorSurface` already wires up
  // separately on its expanded-sheet listener). Skipped when:
  //   • The active tool has no rollback-able work (`canCancelCurrentTool`
  //     is false) — Esc shouldn't blank a clean session.
  //   • The user is typing in an input / textarea / Fabric IText editor
  //     — Esc there cancels the input edit, not the whole tool.
  //   • A modal is open (Export, FileProps, Privacy) — they own their
  //     own Esc handling and should take priority.
  useEffect(() => {
    if (isMobile) return;
    if (!canCancelCurrentTool) return;
    if (exportOpen || filePropsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      void cancelCurrentTool();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, canCancelCurrentTool, exportOpen, filePropsOpen, cancelCurrentTool]);

  // CloakPDF parity: ⌘K / Ctrl+K opens the searchable tool index.
  // The mobile editor already has a full-screen picker, so this stays
  // scoped to desktop/tablet where the icon rail is visible.
  useEffect(() => {
    if (isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "k") {
        return;
      }
      if (exportOpen || filePropsOpen) return;
      event.preventDefault();
      openToolSearch(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, filePropsOpen, isMobile, openToolSearch]);

  // Paste-to-replace inside the editor: catch Cmd/Ctrl-V on the document
  // and grab the first image off the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file?.type.startsWith("image/")) {
          e.preventDefault();
          void replaceWithFile(file);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [replaceWithFile]);

  // Drop-to-replace on the editor itself (single mode only — batch has
  // its own drop handler that adds files to the queue).
  const onShellDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (mode === "batch") return;
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [mode],
  );
  const onShellDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (mode === "batch") return;
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        e.preventDefault();
        void replaceWithFile(file);
      }
    },
    [mode, replaceWithFile],
  );

  return (
    <main
      onDragOver={onShellDragOver}
      onDrop={onShellDrop}
      className="editor-shell relative h-full w-full overflow-hidden font-sans text-text"
    >
      <KeyboardShortcuts />
      {/* Editor backdrop is solid cream on every breakpoint. Animated
          marketing chrome was removed so the photo owns the hierarchy
          and the workbench reads as one continuous paper surface. */}
      <div className="relative flex h-full w-full flex-col">
        <TopBar onShowFileProps={() => setFilePropsOpen(true)} />

        {error && <ErrorBanner message={error} />}
        {loading && <LoadingBanner />}
        {busyLabel && <BusyOverlay label={busyLabel} />}

        <div className="flex min-h-0 flex-1">
          {!isMobile && mode === "single" && (
            <ToolRail
              activeTool={activeTool}
              onSelect={setActiveTool}
              onOpenSearch={() => openToolSearch(false)}
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {mode === "batch" ? (
              <BatchCanvas isMobile={isMobile} />
            ) : isMobile ? (
              // Mobile single-mode chrome (V3.3 "unified surface" redesign,
              // May 2026):
              //   ┌─ Canvas (StageHost + ToolStage) — fills the column;
              //   │  shrinks to fit above the surface when expanded.
              //   └─ MobileEditorSurface — single morphing shell that
              //      progresses through collapsed → picker → tool with
              //      content cross-fading inside the same card. In-flow
              //      so the canvas reflows as it grows.
              // The canvas matte now uses `--page-bg` across every
              // breakpoint (May 2026 desktop redesign — unified with
              // the original mobile treatment in tokens.css) so the
              // photo floats in cream and the editor reads as one
              // continuous airy surface.
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <StageHost />
                  <ToolStage />
                </div>
                {mode === "single" && <MobileEditorSurface />}
              </div>
            ) : (
              // StageHost mounts the live ImageCanvas + Fabric instance
              // exactly once; ToolStage renders only the active tool's
              // hook bindings (no canvas of its own), so swapping tools
              // doesn't tear down the canvas. This is what eliminates
              // the flash on tool change.
              //
              // HistoryScrubber sits below the canvas as a flex-shrink-0
              // row so the canvas above it (flex-1) reclaims any space
              // the scrubber doesn't use; when the scrubber returns null
              // (no history yet, or mobile) the layout is identical to
              // pre-scrubber chrome.
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col">
                  <StageHost />
                  <ToolStage />
                </div>
                <HistoryScrubber />
              </div>
            )}
          </div>

          {!isMobile && mode === "single" && <PropertiesPanel collapsed={isTablet} />}
          {!isMobile && mode === "batch" && <BatchPanel collapsed={isTablet} />}
        </div>
      </div>

      {exportOpen && (
        <ExportModal
          layout={layout}
          settings={exportSettings}
          onPatch={(next) => setExportSettings((prev) => ({ ...prev, ...next }))}
          onClose={closeExport}
        />
      )}

      {filePropsOpen && (
        <FilePropertiesModal layout={layout} onClose={() => setFilePropsOpen(false)} />
      )}

      {toolSearchOpen && !isMobile && mode === "single" && (
        <ToolSearchModal
          instant={toolSearchKeyboardOpen}
          onClose={() => setToolSearchOpen(false)}
          onSelect={setActiveTool}
        />
      )}

      {/* Silent boundary — a render failure in the AI consent subtree
          (model download race, worker crash, etc.) blanks just this
          host. The next user-driven AI interaction remounts it with
          fresh state. Editor remains fully usable around it. */}
      <ErrorBoundary variant="silent" subsystem="consent">
        <MaskConsentHost />
        <DetectFaceConsentHost />
        <DepthConsentHost />
      </ErrorBoundary>
    </main>
  );
}

// Keyboard shortcuts need the *live* tool state (e.g. nudging values,
// reading the active tool), so this subscriber re-renders on every
// slider tick. Isolating it in its own null-rendering component keeps
// that per-tick churn off the whole EditorShell chrome tree.
function KeyboardShortcuts() {
  const toolState = useToolState();
  const { setActiveTool, patchTool, getFabricCanvas, commit, setView } = useEditorActions();
  const resetZoom = useCallback(
    (target: "fit" | "100") => {
      // `view.zoom` is a multiplier on top of fit-scale; 1 === fit.
      // The "100" preset is a coarse "zoom in" — true 1:1 pixels would
      // need the live container size which the canvas owns.
      setView((v) => ({
        ...v,
        zoom: target === "fit" ? 1 : 2.5,
        panX: 0,
        panY: 0,
      }));
    },
    [setView],
  );
  useKeyboardShortcuts({
    setActiveTool,
    patchTool,
    resetZoom,
    toolState,
    getFabricCanvas,
    commit,
  });
  return null;
}

function LoadingBanner() {
  return (
    <div className="absolute inset-0 z-200 flex items-center justify-center bg-page-bg">
      <Spinner label="Loading image…" />
    </div>
  );
}

/** Translucent overlay shown while a heavy operation (e.g. baking a
 *  Filter preset into history at full resolution) is blocking the
 *  main thread. Lighter than `LoadingBanner` so the editor stays
 *  visible behind the spinner — the user knows what's being worked
 *  on, just that they can't interact for a moment. */
function BusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-150 flex items-center justify-center bg-[var(--color-overlay)]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-[var(--shadow-popover)]">
        <Spinner size={22} />
        <span className="text-[13px] font-medium text-text">{label}</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  const { exit } = useEditorActions();
  return (
    <div className="absolute inset-0 z-200 flex items-center justify-center bg-[var(--color-overlay)] px-6">
      <div
        role="alert"
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg border border-border bg-surface px-7 py-8 text-center shadow-[var(--shadow-overlay)]"
      >
        <div className="cloak-dialog__icon h-14 w-14">
          <I.Triangle size={26} stroke={1.75} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-semibold tracking-tight">Couldn't open this image</div>
          <div className="text-[13px] leading-relaxed text-text-muted">
            The file may be corrupted, in an unsupported format, or no longer available on this
            device.
          </div>
          {message && (
            <div className="t-mono mt-2 max-h-20 overflow-auto rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-left text-[11px] wrap-break-word text-text-muted">
              {message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exit}
          className="btn btn-primary btn-sm w-full justify-center"
        >
          <I.ArrowRight size={14} style={{ transform: "scaleX(-1)" }} />
          Back to start
        </button>
      </div>
    </div>
  );
}
