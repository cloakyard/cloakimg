// EditorContext.tsx — Single source of truth for the editor's document,
// tool state, history, zoom, mode, layout. Tools subscribe via
// `useEditor()` and call `commit()` when they want to bake a change
// into history.
//
// The state is split across three React contexts so consumers can
// subscribe only to the slice they care about and skip re-renders for
// unrelated mutations:
//
//   • EditorActionsCtx — stable callbacks (patchTool, commit, undo,
//     getFabricCanvas, …). Identity never changes after the first
//     render, so listeners that only need to *dispatch* never
//     re-render.
//   • ToolStateCtx — `toolState` only. This is the slice that changes
//     ~60 Hz during a slider drag, so isolating it lets the dozens of
//     other components on the page sit out those updates.
//   • EditorStateCtx — everything else (doc, view, layers, mode,
//     layout, batch, history flags, …). Changes are infrequent.
//
// `useEditor()` merges all three for backwards compatibility; existing
// consumers keep working but pay the full re-render cost. Performance-
// sensitive call sites should reach for the focused slice hooks
// (`useEditorActions`, `useToolState`, `useEditorReadOnly`) instead.

import type { Canvas as FabricCanvas } from "fabric";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { saveDraft } from "../landing/draft";
import type { StartChoice } from "../landing/StartModal";
import { type BatchFile, buildThumb, DEFAULT_RECIPE, type RecipeStep, runRecipe } from "./batch";
import { createDoc, type EditorDoc, type Layer, snapshot } from "./doc";
import { History, restoreCanvas } from "./history";
import { snapshotPersistentObjects } from "./tools/penPath";
import { DEFAULT_TOOL_STATE, type ToolState } from "./toolState";
import type { Layout, Mode } from "./types";

interface ViewState {
  zoom: number;
  /** Pan offset in screen pixels relative to canvas center. */
  panX: number;
  panY: number;
}

const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

interface EditorContextValue {
  doc: EditorDoc | null;
  loading: boolean;
  /** Non-null while a heavy operation (e.g. baking a Filter preset
   *  into history) is blocking the main thread. UnifiedEditor renders
   *  a spinner overlay against this so the user has visual feedback
   *  during the freeze. */
  busyLabel: string | null;
  error: string | null;

  view: ViewState;
  setView: (v: ViewState | ((prev: ViewState) => ViewState)) => void;

  toolState: ToolState;
  patchTool: <K extends keyof ToolState>(key: K, value: ToolState[K]) => void;
  setActiveTool: (id: ToolState["activeTool"]) => void;
  /** Tools with preview state (Adjust, Filter, Frame, RemoveBg, Crop)
   *  register a callback that bakes pending edits into history. The
   *  callback is invoked automatically before a tool change so unapplied
   *  previews carry forward instead of getting dropped. */
  /** Run a (potentially main-thread-blocking) operation behind the
   *  global "Applying…" spinner overlay. The spinner mounts before
   *  `fn` runs (two rAF passes ensure paint happens first), then
   *  clears once `fn` resolves — so any panel that triggers a heavy
   *  bake gets immediate visual feedback instead of a frozen UI. */
  runBusy: (label: string, fn: () => void | Promise<void>) => Promise<void>;
  registerPendingApply: (fn: (() => void | Promise<void>) | null) => void;
  /** Flush + clear any registered pending-apply callback. Returns
   *  the underlying promise so async-bake panels (Filter / Adjust)
   *  can await full completion before continuing. */
  flushPendingApply: () => Promise<void>;
  /** Hand-off ref between successive `<ImageCanvas>` mounts. Each tool
   *  renders its own ImageCanvas which creates+disposes its own Fabric
   *  Canvas; without this ref every IText / shape / sticker / image
   *  layer would die on every tool switch. ImageCanvas captures a JSON
   *  snapshot of the live scene right before disposing the old canvas,
   *  and restores it from this slot on the next mount. */
  captureFabricSnapshot: (json: object | null) => void;
  peekFabricSnapshot: () => object | null;

  layers: Layer[];
  setLayers: (l: Layer[] | ((prev: Layer[]) => Layer[])) => void;

  mode: Mode;
  setMode: (m: Mode) => void;

  layout: Layout;

  /** Bake the current working canvas into history under a label. */
  commit: (label: string) => void;
  /** Label of the most recent committed entry (cursor position) — null
   *  if history is empty. Lets tools detect "I committed this" and
   *  replace their own prior entry instead of stacking. */
  peekLastCommitLabel: () => string | null;
  /** Restore a previous snapshot from history. Async because older
   *  entries are stored as compressed WebP blobs and need a decode. */
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** Roll the working canvas + Fabric scene back to the very first
   *  history entry (the original image at open time). Pushes a new
   *  "Reset" entry so the reset itself is undoable. Async for the
   *  same reason as undo/redo. */
  resetToOriginal: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  canReset: boolean;
  /** Open / close the export modal. */
  exportOpen: boolean;
  openExport: () => void;
  closeExport: () => void;
  /** Return to the landing page. */
  exit: () => void;

  /** Batch mode state. */
  batchFiles: BatchFile[];
  recipe: RecipeStep[];
  batchAddFiles: (files: File[]) => void;
  batchClear: () => void;
  setRecipe: (r: RecipeStep[] | ((prev: RecipeStep[]) => RecipeStep[])) => void;
  runBatch: () => Promise<void>;
  batchRunning: boolean;

  /** Before/after compare view. */
  compareActive: boolean;
  setCompareActive: (active: boolean) => void;
  /** The original canvas, captured when the doc was first opened. */
  baseCanvas: () => HTMLCanvasElement | null;

  /** Drop or paste an image into the editor — replaces the current doc. */
  replaceWithFile: (file: File) => Promise<void>;

  /** Live Fabric canvas accessor (Phase F2-A onwards). Tools that add
   *  Fabric objects (watermark image, text, draw, shapes) call
   *  `getFabricCanvas()` to reach the live `Canvas` instance.
   *  ImageCanvas is responsible for calling `setFabricCanvas` on
   *  mount/unmount. */
  getFabricCanvas: () => FabricCanvas | null;
  setFabricCanvas: (c: FabricCanvas | null) => void;
}

// ── Context split ─────────────────────────────────────────────
// `ActionsValue` collects every callback a consumer might need to
// dispatch. The identity is stable across renders (deps are stable
// refs) so subscribers only re-render when this provider re-mounts.
interface ActionsValue {
  patchTool: EditorContextValue["patchTool"];
  setActiveTool: EditorContextValue["setActiveTool"];
  setView: EditorContextValue["setView"];
  setMode: EditorContextValue["setMode"];
  setLayers: EditorContextValue["setLayers"];
  setCompareActive: EditorContextValue["setCompareActive"];
  runBusy: EditorContextValue["runBusy"];
  registerPendingApply: EditorContextValue["registerPendingApply"];
  flushPendingApply: EditorContextValue["flushPendingApply"];
  captureFabricSnapshot: EditorContextValue["captureFabricSnapshot"];
  peekFabricSnapshot: EditorContextValue["peekFabricSnapshot"];
  getFabricCanvas: EditorContextValue["getFabricCanvas"];
  setFabricCanvas: EditorContextValue["setFabricCanvas"];
  commit: EditorContextValue["commit"];
  peekLastCommitLabel: EditorContextValue["peekLastCommitLabel"];
  undo: EditorContextValue["undo"];
  redo: EditorContextValue["redo"];
  resetToOriginal: EditorContextValue["resetToOriginal"];
  openExport: EditorContextValue["openExport"];
  closeExport: EditorContextValue["closeExport"];
  exit: EditorContextValue["exit"];
  batchAddFiles: EditorContextValue["batchAddFiles"];
  batchClear: EditorContextValue["batchClear"];
  setRecipe: EditorContextValue["setRecipe"];
  runBatch: EditorContextValue["runBatch"];
  baseCanvas: EditorContextValue["baseCanvas"];
  replaceWithFile: EditorContextValue["replaceWithFile"];
}

interface ToolStateValue {
  toolState: ToolState;
}

interface EditorReadValue {
  doc: EditorDoc | null;
  loading: boolean;
  busyLabel: string | null;
  error: string | null;
  view: ViewState;
  layers: Layer[];
  mode: Mode;
  layout: Layout;
  canUndo: boolean;
  canRedo: boolean;
  canReset: boolean;
  exportOpen: boolean;
  batchFiles: BatchFile[];
  recipe: RecipeStep[];
  batchRunning: boolean;
  compareActive: boolean;
}

const ActionsCtx = createContext<ActionsValue | null>(null);
const ToolStateCtx = createContext<ToolStateValue | null>(null);
const EditorReadCtx = createContext<EditorReadValue | null>(null);
const Ctx = createContext<EditorContextValue | null>(null);

function detectLayout(width: number): Layout {
  if (width < 760) return "mobile";
  if (width < 1180) return "tablet";
  return "desktop";
}

interface ProviderProps {
  initialDoc: StartChoice;
  onExit: () => void;
  initialTool?: ToolState["activeTool"];
  initialMode?: Mode;
  children: ReactNode;
}

export function EditorProvider({
  initialDoc,
  onExit,
  initialTool,
  initialMode = "single",
  children,
}: ProviderProps) {
  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [toolState, setToolState] = useState<ToolState>(() => ({
    ...DEFAULT_TOOL_STATE,
    activeTool: initialTool ?? DEFAULT_TOOL_STATE.activeTool,
  }));
  const [layers, setLayersState] = useState<Layer[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [recipe, setRecipeState] = useState<RecipeStep[]>(DEFAULT_RECIPE);
  const [batchRunning, setBatchRunning] = useState(false);
  const [compareActive, setCompareActive] = useState(false);

  // Layout detection via window resize.
  const [layout, setLayout] = useState<Layout>(() =>
    typeof window === "undefined" ? "desktop" : detectLayout(window.innerWidth),
  );
  useEffect(() => {
    const onResize = () => setLayout(detectLayout(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // History stack — kept in a ref so tool commits don't trigger re-renders.
  const historyRef = useRef(new History());
  const [historyVersion, setHistoryVersion] = useState(0);

  // Fabric canvas accessor — populated by ImageCanvas on mount.
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const getFabricCanvas = useCallback(() => fabricCanvasRef.current, []);
  const setFabricCanvas = useCallback((c: FabricCanvas | null) => {
    fabricCanvasRef.current = c;
  }, []);

  // Pending-apply hook — preview tools (Adjust, Filter, Frame, RemoveBg,
  // Crop) register a flush callback so unapplied edits bake into
  // history when the user switches tools, instead of vanishing.
  const pendingApplyRef = useRef<(() => void | Promise<void>) | null>(null);
  const registerPendingApply = useCallback((fn: (() => void | Promise<void>) | null) => {
    pendingApplyRef.current = fn;
  }, []);
  const flushPendingApply = useCallback(async (): Promise<void> => {
    const fn = pendingApplyRef.current;
    pendingApplyRef.current = null;
    if (fn) await fn();
  }, []);

  // Fabric scene hand-off — preserves IText / shapes / images / etc.
  // across tool swaps. ImageCanvas writes here on dispose and reads on
  // mount. Cleared on doc replace so a new image starts blank.
  const fabricSnapshotRef = useRef<object | null>(null);
  const captureFabricSnapshot = useCallback((json: object | null) => {
    fabricSnapshotRef.current = json;
  }, []);
  const peekFabricSnapshot = useCallback(() => fabricSnapshotRef.current, []);

  // Auto-save draft on any history mutation. Debounced ~5 s so a
  // burst of slider drags doesn't flood the IDB write pipeline. The
  // first commit (`Open`) skips the save — it's identical to the
  // source, so there's nothing to recover. Cleared on doc replace +
  // on successful export. Best-effort: failures are swallowed so a
  // hostile profile (private-mode, full quota) doesn't break editing.
  const autosaveSeenInitial = useRef(false);
  useEffect(() => {
    // historyVersion isn't read in the body, but it's the trigger —
    // this effect should re-run on every commit so the debounced save
    // fires after the latest state.
    void historyVersion;
    if (!doc) return;
    // Skip the very first push (the "Open" baseline).
    if (!autosaveSeenInitial.current) {
      autosaveSeenInitial.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      const fc = fabricCanvasRef.current;
      const fabricJson = fc ? snapshotPersistentObjects(fc) : null;
      void saveDraft(doc.working, fabricJson, doc.fileName);
    }, 5000);
    return () => window.clearTimeout(handle);
  }, [doc, historyVersion]);

  // Reset the autosave gate when a new doc replaces the current one.
  useEffect(() => {
    void doc;
    autosaveSeenInitial.current = false;
  }, [doc]);

  // Revoke any outstanding batch blob URLs (thumb + result) when the
  // editor unmounts. Without this, leaving the editor with a populated
  // batch queue leaks every URL since `batchClear` is the only other
  // path that revokes them. We read from `batchFilesRef` so the cleanup
  // effect doesn't have to re-subscribe on every batch mutation.
  const batchFilesRef = useRef(batchFiles);
  batchFilesRef.current = batchFiles;
  useEffect(() => {
    return () => {
      for (const f of batchFilesRef.current) {
        if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
        if (f.resultBlobUrl) URL.revokeObjectURL(f.resultBlobUrl);
      }
    };
  }, []);

  // Build doc from the start choice.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    createDoc(initialDoc).then(
      (d) => {
        if (cancelled) return;
        setDoc(d);
        setLayersState(d.layers);
        historyRef.current.clear();
        // Clear any Fabric objects from the previous session so the
        // first commit baseline is empty.
        const fc = fabricCanvasRef.current;
        if (fc) {
          fc.remove(...fc.getObjects());
          fc.requestRenderAll();
        }
        // A new doc starts with an empty Fabric scene; clear any
        // hand-off snapshot left over from a previous session.
        fabricSnapshotRef.current = null;
        historyRef.current.push("Open", d.working, d.layers, null);
        setHistoryVersion((v) => v + 1);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [initialDoc]);

  const patchTool = useCallback(<K extends keyof ToolState>(key: K, value: ToolState[K]) => {
    setToolState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Run a (potentially main-thread-blocking) operation behind a busy
  // spinner. Two rAF passes ensure the spinner has actually painted
  // before the work starts; otherwise a sync bake would block the
  // same frame the spinner was queued on and the overlay wouldn't
  // appear until the work completed. Async fns are awaited so the
  // spinner stays up for the duration even when the work itself
  // runs off the main thread (Web Worker resize, etc.).
  const runBusy = useCallback((label: string, fn: () => void | Promise<void>): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      setBusyLabel(label);
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          try {
            await fn();
            resolve();
          } catch (e) {
            reject(e);
          } finally {
            setBusyLabel(null);
          }
        });
      });
    });
  }, []);

  const setActiveTool = useCallback(
    (id: ToolState["activeTool"]) => {
      // Capture the pending bake before switching tools so the user's
      // unapplied edits carry forward, but defer running it behind a
      // busy spinner so a heavy full-resolution bake (e.g. a Filter
      // preset on a 24 MP photo, ~1–3 s on mobile) doesn't make the
      // tool-switch tap feel unresponsive. Without runBusy the user
      // would tap, see nothing change, and assume the button is
      // broken; with it, the new panel paints + a coral spinner
      // shows during the freeze, then both clear once the bake
      // commits.
      const pending = pendingApplyRef.current;
      pendingApplyRef.current = null;
      setToolState((prev) => ({ ...prev, activeTool: id }));
      if (pending) void runBusy("Applying…", pending);
    },
    [runBusy],
  );

  const setLayers = useCallback((l: Layer[] | ((prev: Layer[]) => Layer[])) => {
    setLayersState((prev) => (typeof l === "function" ? l(prev) : l));
  }, []);

  const peekLastCommitLabel = useCallback(() => historyRef.current.currentLabel(), []);

  const commit = useCallback(
    (label: string) => {
      if (!doc) return;
      const fc = fabricCanvasRef.current;
      // `snapshotPersistentObjects` strips canvas-level state
      // (backgroundImage, viewportTransform, overlay) and only keeps
      // the user-added objects with `cloakKind` + `cloakAnchors`.
      // ImageCanvas owns the bg image + viewport via separate effects;
      // including them here would race-overwrite a freshly mounted
      // canvas's bg with a stale serialized one on undo / redo.
      const fabricJson = fc ? snapshotPersistentObjects(fc) : null;
      historyRef.current.push(label, doc.working, layers, fabricJson);
      setHistoryVersion((v) => v + 1);
    },
    [doc, layers],
  );

  const undo = useCallback(async () => {
    if (!doc) return;
    const entry = historyRef.current.undo();
    if (!entry) return;
    await restoreCanvas(doc.working, entry);
    setDoc({ ...doc, width: entry.width, height: entry.height });
    setLayersState(entry.layers);
    restoreFabricScene(fabricCanvasRef.current, entry.fabric);
    setHistoryVersion((v) => v + 1);
  }, [doc]);

  const redo = useCallback(async () => {
    if (!doc) return;
    const entry = historyRef.current.redo();
    if (!entry) return;
    await restoreCanvas(doc.working, entry);
    setDoc({ ...doc, width: entry.width, height: entry.height });
    setLayersState(entry.layers);
    restoreFabricScene(fabricCanvasRef.current, entry.fabric);
    setHistoryVersion((v) => v + 1);
  }, [doc]);

  const resetToOriginal = useCallback(async () => {
    if (!doc) return;
    const base = historyRef.current.base();
    if (!base) return;
    // Skip if already on the base entry — nothing to reset.
    if (!historyRef.current.canUndo() && !historyRef.current.canRedo()) return;
    await restoreCanvas(doc.working, base);
    setDoc({ ...doc, width: base.width, height: base.height });
    setLayersState(base.layers);
    restoreFabricScene(fabricCanvasRef.current, base.fabric);
    historyRef.current.push("Reset", doc.working, base.layers, base.fabric);
    setHistoryVersion((v) => v + 1);
  }, [doc]);

  const setRecipe = useCallback((r: RecipeStep[] | ((prev: RecipeStep[]) => RecipeStep[])) => {
    setRecipeState((prev) => (typeof r === "function" ? r(prev) : r));
  }, []);

  const batchAddFiles = useCallback((files: File[]) => {
    const fresh: BatchFile[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      file: f,
      status: "queued",
    }));
    setBatchFiles((prev) => [...prev, ...fresh]);
    // Asynchronously build thumbs.
    fresh.forEach(async (b) => {
      const url = await buildThumb(b.file).catch(() => "");
      setBatchFiles((prev) => prev.map((p) => (p.id === b.id ? { ...p, thumbUrl: url } : p)));
    });
  }, []);

  const batchClear = useCallback(() => {
    setBatchFiles((prev) => {
      for (const f of prev) {
        if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
        if (f.resultBlobUrl) URL.revokeObjectURL(f.resultBlobUrl);
      }
      return [];
    });
  }, []);

  const replaceWithFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const next = await createDoc({ kind: "upload", file });
      setDoc(next);
      setLayersState(next.layers);
      historyRef.current.clear();
      const fc = fabricCanvasRef.current;
      if (fc) {
        fc.remove(...fc.getObjects());
        fc.requestRenderAll();
      }
      fabricSnapshotRef.current = null;
      historyRef.current.push("Open", next.working, next.layers, null);
      setHistoryVersion((v) => v + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const runBatch = useCallback(async () => {
    setBatchRunning(true);
    try {
      // Process serially so we don't pin the main thread with 24 tasks.
      const ids = batchFiles.map((f) => f.id);
      for (const id of ids) {
        const target = batchFiles.find((f) => f.id === id);
        if (!target) continue;
        setBatchFiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: "progress" } : p)));
        try {
          const { blob, name } = await runRecipe(target.file, recipe);
          const url = URL.createObjectURL(blob);
          setBatchFiles((prev) =>
            prev.map((p) => {
              if (p.id !== id) return p;
              // Re-running over a row that already produced a result: revoke
              // the previous blob URL so we don't leak one per re-run.
              if (p.resultBlobUrl) URL.revokeObjectURL(p.resultBlobUrl);
              return {
                ...p,
                status: "done",
                resultBlobUrl: url,
                resultName: name,
              };
            }),
          );
        } catch (err: unknown) {
          setBatchFiles((prev) =>
            prev.map((p) =>
              p.id === id
                ? {
                    ...p,
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                  }
                : p,
            ),
          );
        }
      }
    } finally {
      setBatchRunning(false);
    }
  }, [batchFiles, recipe]);

  const openExport = useCallback(() => {
    // Render the modal first so the user sees an immediate response
    // to the tap. The modal itself runs flushPendingApply() inside a
    // mount-time effect (deferred via setTimeout) so any unapplied
    // Adjust/Filter slider bake doesn't block the dialog from
    // appearing — important on mobile where baking a 12 MP canvas
    // can take a couple hundred milliseconds.
    setExportOpen(true);
  }, []);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const baseCanvas = useCallback(() => historyRef.current.base()?.canvas ?? null, []);

  // Stable: every callback below has stable identity (refs + setState
  // dispatchers + useCallback'd handlers), so the actions context value
  // never changes after first render. Components that subscribe to it
  // alone will not re-render on any state mutation.
  const actionsValue = useMemo<ActionsValue>(
    () => ({
      patchTool,
      setActiveTool,
      setView,
      setMode,
      setLayers,
      setCompareActive,
      runBusy,
      registerPendingApply,
      flushPendingApply,
      captureFabricSnapshot,
      peekFabricSnapshot,
      getFabricCanvas,
      setFabricCanvas,
      commit,
      peekLastCommitLabel,
      undo,
      redo,
      resetToOriginal,
      openExport,
      closeExport,
      exit: onExit,
      batchAddFiles,
      batchClear,
      setRecipe,
      runBatch,
      baseCanvas,
      replaceWithFile,
    }),
    [
      patchTool,
      setActiveTool,
      setLayers,
      runBusy,
      registerPendingApply,
      flushPendingApply,
      captureFabricSnapshot,
      peekFabricSnapshot,
      getFabricCanvas,
      setFabricCanvas,
      commit,
      peekLastCommitLabel,
      undo,
      redo,
      resetToOriginal,
      openExport,
      closeExport,
      onExit,
      batchAddFiles,
      batchClear,
      setRecipe,
      runBatch,
      baseCanvas,
      replaceWithFile,
    ],
  );

  // Volatile: tool state (mutated on every slider tick).
  const toolStateValue = useMemo<ToolStateValue>(() => ({ toolState }), [toolState]);

  // Volatile: everything else.
  const readValue = useMemo<EditorReadValue>(
    () => ({
      doc,
      loading,
      busyLabel,
      error,
      view,
      layers,
      mode,
      layout,
      // historyVersion is referenced here purely so the value object is
      // recomputed on every history mutation; the actual canUndo/canRedo
      // bits read from the ref.
      canUndo: historyVersion >= 0 && historyRef.current.canUndo(),
      canRedo: historyVersion >= 0 && historyRef.current.canRedo(),
      canReset:
        historyVersion >= 0 && (historyRef.current.canUndo() || historyRef.current.canRedo()),
      exportOpen,
      batchFiles,
      recipe,
      batchRunning,
      compareActive,
    }),
    [
      doc,
      loading,
      busyLabel,
      error,
      view,
      layers,
      mode,
      layout,
      historyVersion,
      exportOpen,
      batchFiles,
      recipe,
      batchRunning,
      compareActive,
    ],
  );

  // Backwards-compatible omnibus value — every consumer that calls
  // `useEditor()` reads this. New code should reach for the focused
  // slice hooks instead, which avoid re-rendering on unrelated mutations.
  const value = useMemo<EditorContextValue>(
    () => ({
      ...actionsValue,
      ...toolStateValue,
      ...readValue,
    }),
    [actionsValue, toolStateValue, readValue],
  );

  return (
    <ActionsCtx.Provider value={actionsValue}>
      <ToolStateCtx.Provider value={toolStateValue}>
        <EditorReadCtx.Provider value={readValue}>
          <Ctx.Provider value={value}>{children}</Ctx.Provider>
        </EditorReadCtx.Provider>
      </ToolStateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditor must be used inside an <EditorProvider />");
  return v;
}

/** Stable-identity actions slice. Use this when a component only needs
 *  to *dispatch* — never re-renders on state changes. Prefer this over
 *  `useEditor()` in event handlers / Slider onChange / button callbacks. */
export function useEditorActions(): ActionsValue {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error("useEditorActions must be used inside an <EditorProvider />");
  return v;
}

/** Tool-state slice. Mutates on every slider tick — components reading
 *  this re-render at slider rate, but unrelated state changes (view,
 *  doc, batch) don't reach them. Pair with `useEditorActions()` to
 *  dispatch without re-subscribing to the omnibus context. */
export function useToolState(): ToolState {
  const v = useContext(ToolStateCtx);
  if (!v) throw new Error("useToolState must be used inside an <EditorProvider />");
  return v.toolState;
}

/** Read-only state slice — doc, view, layers, layout, history flags,
 *  batch + compare state. Excludes `toolState` so this slice is stable
 *  while the user drags a slider. */
export function useEditorReadOnly(): EditorReadValue {
  const v = useContext(EditorReadCtx);
  if (!v) throw new Error("useEditorReadOnly must be used inside an <EditorProvider />");
  return v;
}

/** Util — produce a fresh snapshot of the working canvas. */
export function snapshotWorking(doc: EditorDoc): HTMLCanvasElement {
  return snapshot(doc.working);
}

/** Reload a Fabric scene from the JSON captured at commit time. Empty
 *  JSON / null clears the canvas. Errors are swallowed — undo should
 *  never throw. */
function restoreFabricScene(fc: FabricCanvas | null, json: object | null) {
  if (!fc) return;
  if (!json) {
    fc.remove(...fc.getObjects());
    fc.requestRenderAll();
    return;
  }
  void fc
    .loadFromJSON(json)
    .then(() => fc.requestRenderAll())
    .catch(() => undefined);
}
