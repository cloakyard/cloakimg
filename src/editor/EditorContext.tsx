// EditorContext.tsx — Single source of truth for the editor's document,
// tool state, history, zoom, mode, layout. Tools subscribe via
// `useEditor()` and call `commit()` when they want to bake a change
// into history.

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
import { toast } from "./Toasts";
import { copyInto, createDoc, type EditorDoc, type Layer, snapshot } from "./doc";
import { History } from "./history";
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
  registerPendingApply: (fn: (() => void) | null) => void;
  /** Flush + clear any registered pending-apply callback. */
  flushPendingApply: () => void;
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
  /** Restore a previous snapshot from history. */
  undo: () => void;
  redo: () => void;
  /** Roll the working canvas + Fabric scene back to the very first
   *  history entry (the original image at open time). Pushes a new
   *  "Reset" entry so the reset itself is undoable. */
  resetToOriginal: () => void;
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
  const pendingApplyRef = useRef<(() => void) | null>(null);
  const registerPendingApply = useCallback((fn: (() => void) | null) => {
    pendingApplyRef.current = fn;
  }, []);
  const flushPendingApply = useCallback(() => {
    const fn = pendingApplyRef.current;
    pendingApplyRef.current = null;
    if (fn) fn();
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

  const setActiveTool = useCallback(
    (id: ToolState["activeTool"]) => {
      // Bake any pending preview before swapping tools so the user's
      // unapplied edits carry forward.
      flushPendingApply();
      setToolState((prev) => ({ ...prev, activeTool: id }));
    },
    [flushPendingApply],
  );

  const setLayers = useCallback((l: Layer[] | ((prev: Layer[]) => Layer[])) => {
    setLayersState((prev) => (typeof l === "function" ? l(prev) : l));
  }, []);

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

  const undo = useCallback(() => {
    if (!doc) return;
    const entry = historyRef.current.undo();
    if (!entry) return;
    copyInto(doc.working, entry.canvas);
    setDoc({ ...doc, width: entry.canvas.width, height: entry.canvas.height });
    setLayersState(entry.layers);
    restoreFabricScene(fabricCanvasRef.current, entry.fabric);
    setHistoryVersion((v) => v + 1);
  }, [doc]);

  const redo = useCallback(() => {
    if (!doc) return;
    const entry = historyRef.current.redo();
    if (!entry) return;
    copyInto(doc.working, entry.canvas);
    setDoc({ ...doc, width: entry.canvas.width, height: entry.canvas.height });
    setLayersState(entry.layers);
    restoreFabricScene(fabricCanvasRef.current, entry.fabric);
    setHistoryVersion((v) => v + 1);
  }, [doc]);

  const resetToOriginal = useCallback(() => {
    if (!doc) return;
    const base = historyRef.current.base();
    if (!base) return;
    // Skip if already on the base entry — nothing to reset.
    if (!historyRef.current.canUndo() && !historyRef.current.canRedo()) return;
    copyInto(doc.working, base.canvas);
    setDoc({ ...doc, width: base.canvas.width, height: base.canvas.height });
    setLayersState(base.layers);
    restoreFabricScene(fabricCanvasRef.current, base.fabric);
    historyRef.current.push("Reset", base.canvas, base.layers, base.fabric);
    setHistoryVersion((v) => v + 1);
    toast.info("Reset to original");
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
            prev.map((p) =>
              p.id === id
                ? {
                    ...p,
                    status: "done",
                    resultBlobUrl: url,
                    resultName: name,
                  }
                : p,
            ),
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

  const value = useMemo<EditorContextValue>(
    () => ({
      doc,
      loading,
      error,
      view,
      setView,
      toolState,
      patchTool,
      setActiveTool,
      layers,
      setLayers,
      mode,
      setMode,
      layout,
      commit,
      undo,
      redo,
      resetToOriginal,
      registerPendingApply,
      flushPendingApply,
      captureFabricSnapshot,
      peekFabricSnapshot,
      // historyVersion is referenced here purely so the value object is
      // recomputed on every history mutation; the actual canUndo/canRedo
      // bits read from the ref.
      canUndo: historyVersion >= 0 && historyRef.current.canUndo(),
      canRedo: historyVersion >= 0 && historyRef.current.canRedo(),
      canReset:
        historyVersion >= 0 && (historyRef.current.canUndo() || historyRef.current.canRedo()),
      exportOpen,
      openExport: () => {
        // Render the modal first so the user sees an immediate response
        // to the tap. The modal itself runs flushPendingApply() inside a
        // mount-time effect (deferred via setTimeout) so any unapplied
        // Adjust/Filter slider bake doesn't block the dialog from
        // appearing — important on mobile where baking a 12 MP canvas
        // can take a couple hundred milliseconds.
        setExportOpen(true);
      },
      closeExport: () => setExportOpen(false),
      exit: onExit,
      batchFiles,
      recipe,
      batchAddFiles,
      batchClear,
      setRecipe,
      runBatch,
      batchRunning,
      compareActive,
      setCompareActive,
      baseCanvas: () => historyRef.current.base()?.canvas ?? null,
      replaceWithFile,
      getFabricCanvas,
      setFabricCanvas,
    }),
    [
      batchAddFiles,
      batchClear,
      batchFiles,
      batchRunning,
      commit,
      compareActive,
      doc,
      error,
      exportOpen,
      getFabricCanvas,
      layers,
      layout,
      loading,
      mode,
      onExit,
      patchTool,
      recipe,
      redo,
      replaceWithFile,
      resetToOriginal,
      registerPendingApply,
      flushPendingApply,
      captureFabricSnapshot,
      peekFabricSnapshot,
      runBatch,
      setActiveTool,
      setFabricCanvas,
      setLayers,
      setRecipe,
      toolState,
      undo,
      view,
      historyVersion,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditor(): EditorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditor must be used inside an <EditorProvider />");
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
