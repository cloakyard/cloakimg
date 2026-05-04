// LayersList.tsx — Phase F3. Reads the live Fabric scene
// (`canvas.getObjects()`) and renders one row per layer with
// visibility, click-to-select, delete, and HTML5 drag-to-reorder via
// Fabric's `bringObjectForward` / `sendObjectBackwards` APIs.
//
// Lives at the bottom of the right-side properties panel; auto-hides
// when the scene has no Fabric objects.

import { type DragEvent as ReactDragEvent, useCallback, useEffect, useState } from "react";
import type { Canvas as FabricCanvas, FabricImage, FabricObject } from "fabric";
import { useEditor } from "./EditorContext";
import { I } from "../components/icons";
import { LayerFilters } from "./LayerFilters";

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

interface RowMeta {
  obj: FabricObject;
  id: string;
  kind: string;
  label: string;
  visible: boolean;
}

const ROW_TYPES: Record<string, { Icon: typeof I.Type; label: string }> = {
  "cloak:text": { Icon: I.Type, label: "Text" },
  "cloak:watermarkText": { Icon: I.Stamp, label: "Text watermark" },
  "cloak:watermarkImage": { Icon: I.Stamp, label: "Image watermark" },
  "cloak:drawStroke": { Icon: I.Pen, label: "Stroke" },
  "cloak:shape": { Icon: I.Square, label: "Shape" },
  "cloak:sticker": { Icon: I.Heart, label: "Sticker" },
  "cloak:image": { Icon: I.FileImage, label: "Image" },
};

const FILTERABLE_KINDS = new Set(["cloak:watermarkImage", "cloak:sticker", "cloak:image"]);

export function LayersList() {
  const { getFabricCanvas, commit } = useEditor();
  const [collapsed, setCollapsed] = useState(false);
  const [rows, setRows] = useState<RowMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [filtersOpenId, setFiltersOpenId] = useState<string | null>(null);

  const onToggleFilters = useCallback((id: string) => {
    setFiltersOpenId((cur) => (cur === id ? null : id));
  }, []);

  // Subscribe to Fabric scene mutations so the panel always shows the
  // current set of objects.
  useEffect(() => {
    const fc = getFabricCanvas();
    if (!fc) return;
    const sync = () => {
      setRows(buildRows(fc));
      const active = fc.getActiveObject();
      setActiveId(active ? objId(active) : null);
    };
    sync();
    const events = [
      "object:added",
      "object:removed",
      "object:modified",
      "selection:created",
      "selection:updated",
      "selection:cleared",
    ] as const;
    for (const e of events) fc.on(e, sync);
    return () => {
      for (const e of events) fc.off(e, sync);
    };
  }, [getFabricCanvas]);

  const onToggleVisible = useCallback(
    (id: string) => {
      const fc = getFabricCanvas();
      if (!fc) return;
      const target = fc.getObjects().find((o) => objId(o) === id);
      if (!target) return;
      target.visible = !target.visible;
      fc.requestRenderAll();
      setRows(buildRows(fc));
      commit("Toggle layer");
    },
    [commit, getFabricCanvas],
  );

  const onDelete = useCallback(
    (id: string) => {
      const fc = getFabricCanvas();
      if (!fc) return;
      const target = fc.getObjects().find((o) => objId(o) === id);
      if (!target) return;
      fc.remove(target);
      fc.discardActiveObject();
      fc.requestRenderAll();
      setRows(buildRows(fc));
      commit("Delete layer");
    },
    [commit, getFabricCanvas],
  );

  const onSelect = useCallback(
    (id: string) => {
      const fc = getFabricCanvas();
      if (!fc) return;
      const target = fc.getObjects().find((o) => objId(o) === id);
      if (!target) {
        fc.discardActiveObject();
      } else if (fc.getActiveObject() === target) {
        fc.discardActiveObject();
      } else {
        fc.setActiveObject(target);
      }
      fc.requestRenderAll();
    },
    [getFabricCanvas],
  );

  const onDragStart = useCallback((e: ReactDragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }, []);

  const onDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain") || dragId;
      setDragId(null);
      if (!sourceId || sourceId === targetId) return;
      const fc = getFabricCanvas();
      if (!fc) return;
      const objects = fc.getObjects();
      const source = objects.find((o) => objId(o) === sourceId);
      const target = objects.find((o) => objId(o) === targetId);
      if (!source || !target) return;
      // Move `source` adjacent to `target` in Fabric's z-order. The
      // panel renders top→bottom-of-screen = top→bottom-of-z; Fabric
      // calls `bringObjectForward` to move toward the front.
      const sourceIdx = objects.indexOf(source);
      const targetIdx = objects.indexOf(target);
      // Repeatedly shift source until it lands at target's index.
      const dir = sourceIdx < targetIdx ? 1 : -1;
      const steps = Math.abs(targetIdx - sourceIdx);
      for (let i = 0; i < steps; i++) {
        if (dir > 0) fc.bringObjectForward(source);
        else fc.sendObjectBackwards(source);
      }
      fc.requestRenderAll();
      setRows(buildRows(fc));
      commit("Reorder layers");
    },
    [commit, dragId, getFabricCanvas],
  );

  if (rows.length === 0) return null;

  // Render top-down with the visually-topmost layer first (last in
  // Fabric's z-order = paints last = on top visually).
  const ordered = rows.slice().reverse();

  return (
    <div className="shrink-0 border-t border-border-soft px-4 pt-2.5 pb-4 dark:border-dark-border-soft">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="t-section-label flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent py-1 font-[inherit]"
      >
        <I.ChevronDown
          size={11}
          style={{
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 120ms",
          }}
        />
        Layers
        <span className="ml-auto text-text-muted dark:text-dark-text-muted">{rows.length}</span>
      </button>
      {!collapsed && (
        <div className="scroll-thin mt-2 flex max-h-44 flex-col gap-0.5 overflow-y-auto">
          {ordered.map((row) => (
            <LayerRow
              key={row.id}
              row={row}
              selected={activeId === row.id}
              filtersOpen={filtersOpenId === row.id}
              onSelect={onSelect}
              onToggleVisible={onToggleVisible}
              onDelete={onDelete}
              onToggleFilters={onToggleFilters}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  row: RowMeta;
  selected: boolean;
  filtersOpen: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFilters: (id: string) => void;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (e: ReactDragEvent<HTMLDivElement>, targetId: string) => void;
}

function LayerRow({
  row,
  selected,
  filtersOpen,
  onSelect,
  onToggleVisible,
  onDelete,
  onToggleFilters,
  onDragStart,
  onDragOver,
  onDrop,
}: RowProps) {
  const Ic = ROW_TYPES[row.kind]?.Icon ?? I.Square;
  const filterable = FILTERABLE_KINDS.has(row.kind);
  return (
    <div>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, row.id)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, row.id)}
        onClick={() => onSelect(row.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(row.id);
          }
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onDelete(row.id);
          }
        }}
        className={`flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 ${
          selected
            ? "bg-coral-50 shadow-[inset_0_0_0_1px_var(--coral-200)] dark:bg-coral-900/30"
            : "bg-transparent"
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(row.id);
          }}
          aria-label={row.visible ? "Hide layer" : "Show layer"}
          title={row.visible ? "Hide layer" : "Show layer"}
          className={`h-5.5 w-5.5 cursor-pointer border-none bg-transparent p-0 ${
            row.visible
              ? "text-text dark:text-dark-text"
              : "text-text-muted opacity-50 dark:text-dark-text-muted"
          }`}
        >
          {row.visible ? <I.Eye size={13} /> : <I.EyeOff size={13} />}
        </button>
        <Ic size={12} className="shrink-0 text-text-muted dark:text-dark-text-muted" />
        <span
          className={`min-w-0 flex-1 overflow-hidden text-[11.5px] whitespace-nowrap text-ellipsis ${
            selected
              ? "font-semibold text-coral-700 dark:text-coral-300"
              : "font-medium text-text dark:text-dark-text"
          }`}
        >
          {row.label}
        </span>
        {filterable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFilters(row.id);
            }}
            aria-label={filtersOpen ? "Close layer filters" : "Open layer filters"}
            aria-expanded={filtersOpen}
            title="Filters"
            className={`h-5.5 w-5.5 cursor-pointer rounded border-none p-0 ${
              filtersOpen
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-transparent text-text-muted dark:text-dark-text-muted"
            }`}
          >
            <I.Wand size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(row.id);
          }}
          aria-label="Delete layer"
          title="Delete layer"
          className="h-5.5 w-5.5 cursor-pointer border-none bg-transparent p-0 text-text-muted dark:text-dark-text-muted"
        >
          <I.X size={11} />
        </button>
      </div>
      {filtersOpen && filterable && <LayerFilters image={row.obj as FabricImage} />}
    </div>
  );
}

/** Build per-row metadata from the live Fabric scene. We use the
 *  object's stable identity for `id`; tagged objects carry a
 *  `cloakKind` that drives the icon + label. Untagged objects
 *  (e.g. tool overlays like the crop rect) are filtered out. */
function buildRows(fc: FabricCanvas): RowMeta[] {
  const out: RowMeta[] = [];
  for (const obj of fc.getObjects()) {
    const kind = (obj as TaggedFabricObject).cloakKind;
    if (!kind) continue;
    if (kind === "cloak:cropOverlay") continue; // transient tool overlay
    out.push({
      obj,
      id: objId(obj),
      kind,
      label: labelFor(obj, kind),
      visible: obj.visible !== false,
    });
  }
  return out;
}

function labelFor(obj: FabricObject, kind: string): string {
  if (kind === "cloak:text") {
    const t = (obj as { text?: string }).text ?? "";
    return t.slice(0, 24) || "Text";
  }
  if (kind === "cloak:watermarkText") {
    const t = (obj as { text?: string }).text ?? "";
    return `WM · ${t.slice(0, 16) || "Text"}`;
  }
  return ROW_TYPES[kind]?.label ?? kind;
}

/** Stable per-Fabric-object id: Fabric exposes a private `__uid` on
 *  every object instance. We fall back to a synthetic counter if not
 *  present so React keys stay stable across renders. */
let synth = 0;
const synthMap = new WeakMap<FabricObject, string>();
function objId(obj: FabricObject): string {
  const cached = synthMap.get(obj);
  if (cached) return cached;
  synth += 1;
  const id = `obj-${synth}`;
  synthMap.set(obj, id);
  return id;
}
