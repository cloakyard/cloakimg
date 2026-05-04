// UnifiedEditor.tsx — The single CloakIMG editor surface.
//
// Mounts the EditorProvider and arranges the chrome around the canvas.
// All real work (image loading, history, mode toggling) lives in the
// context so individual tools can focus on their own concerns.

import { useCallback, useEffect, useState } from "react";
import { Grainient } from "../components/Grainient";
import { I } from "../components/icons";
import { GRAINIENT_DARK, GRAINIENT_LIGHT, GRAINIENT_MOTION } from "../constants/grainient";
import type { StartChoice } from "../landing/StartModal";
import { usePrefersDark } from "../utils/usePrefersDark";
import { Spinner } from "./atoms";
import { BatchCanvas, BatchPanel } from "./BatchView";
import { EditorProvider, useEditor } from "./EditorContext";
// Side-effect import: mutates Fabric's static ownDefaults to apply the
// coral brand colour to every selectable object's border / handles /
// IText cursor. Must be imported before any Fabric Canvas is created.
import "./fabricDefaults";
import { ExportModal, type ExportSettings } from "./ExportModal";
import { FilePropertiesModal } from "./FilePropertiesModal";
import { MobileSheet } from "./MobileSheet";
import { PropertiesPanel } from "./PropertiesPanel";
import { StageHost, StageProvider } from "./StageHost";
import { ToolRail, MobileToolbar } from "./ToolRail";
import { ToolStage } from "./ToolStage";
import { TopBar } from "./TopBar";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

interface Props {
  initialDoc: StartChoice;
  onExit: () => void;
}

export function UnifiedEditor({ initialDoc, onExit }: Props) {
  return (
    <EditorProvider initialDoc={initialDoc} onExit={onExit}>
      <StageProvider>
        <EditorShell />
      </StageProvider>
    </EditorProvider>
  );
}

function EditorShell() {
  const {
    layout,
    mode,
    toolState,
    patchTool,
    setActiveTool,
    setView,
    loading,
    busyLabel,
    error,
    exportOpen,
    closeExport,
    undo,
    redo,
    replaceWithFile,
    getFabricCanvas,
    commit,
  } = useEditor();
  const isMobile = layout === "mobile";
  const isTablet = layout === "tablet";
  const isDark = usePrefersDark();
  const grainientPalette = isDark ? GRAINIENT_DARK : GRAINIENT_LIGHT;

  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 2, // WebP
    quality: 0.82,
    sizeBucket: 1,
  });
  const [filePropsOpen, setFilePropsOpen] = useState(false);

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
      className="relative h-full w-full overflow-hidden font-sans text-text dark:text-dark-text"
    >
      {/* Animated backdrop, shared with the landing hero (see
          src/constants/grainient.ts). Skipped on phones: a 60fps
          WebGL render loop competes with the editor canvas for GPU
          time and shows up as visible lag on phone Safari. The
          editor surface reads cleanly against bg-canvas-bg without
          it; the warm cast is a nice-to-have desktop affordance. */}
      {!isMobile && (
        <Grainient className="grainient-fixed" {...GRAINIENT_MOTION} {...grainientPalette} />
      )}
      <div className="relative z-1 flex h-full w-full flex-col">
        <TopBar onShowFileProps={() => setFilePropsOpen(true)} />

        {error && <ErrorBanner message={error} />}
        {loading && <LoadingBanner />}
        {busyLabel && <BusyOverlay label={busyLabel} />}

        <div className="flex min-h-0 flex-1">
          {!isMobile && mode === "single" && (
            <ToolRail activeTool={toolState.activeTool} onSelect={setActiveTool} />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {mode === "batch" ? (
              <BatchCanvas isMobile={isMobile} />
            ) : isMobile ? (
              // On mobile, the canvas + drawer share a single sub-container
              // so the drawer's `max-h: 50%` resolves against just those two
              // (not including the toolbar). The matte gets rounded bottom
              // corners to visually mirror the drawer's rounded top.
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-2xl">
                  <StageHost />
                  <ToolStage />
                </div>
                {mode === "single" && <MobileSheet />}
              </div>
            ) : (
              // StageHost mounts the live ImageCanvas + Fabric instance
              // exactly once; ToolStage renders only the active tool's
              // hook bindings (no canvas of its own), so swapping tools
              // doesn't tear down the canvas. This is what eliminates
              // the flash on tool change.
              <>
                <StageHost />
                <ToolStage />
              </>
            )}
            {isMobile && mode === "single" && (
              <MobileToolbar activeTool={toolState.activeTool} onSelect={setActiveTool} />
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
    </main>
  );
}

function LoadingBanner() {
  return (
    <div className="absolute inset-0 z-200 flex items-center justify-center bg-page-bg dark:bg-dark-page-bg">
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
      className="absolute inset-0 z-150 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-3 rounded-2xl border border-border-soft bg-surface/95 px-5 py-4 shadow-xl dark:border-dark-border dark:bg-dark-surface/95"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <Spinner size={22} />
        <span className="text-[13px] font-medium text-text dark:text-dark-text">{label}</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  const { exit } = useEditor();
  return (
    <div className="absolute inset-0 z-200 flex items-center justify-center bg-page-bg/90 px-6 backdrop-blur-md dark:bg-dark-page-bg/90">
      <div
        role="alert"
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-7 py-8 text-center shadow-xl dark:border-dark-border dark:bg-dark-surface"
      >
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-coral-500/12 text-coral-500">
          <span className="absolute inset-0 animate-ping rounded-full bg-coral-500/15" />
          <I.Triangle size={26} stroke={1.75} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-semibold tracking-tight">Couldn't open this image</div>
          <div className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
            The file may be corrupted, in an unsupported format, or no longer available on this
            device.
          </div>
          {message && (
            <div className="t-mono mt-2 max-h-20 overflow-auto rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-left text-[11px] wrap-break-word text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted">
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
