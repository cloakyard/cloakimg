// penPath.ts — Shared geometry helpers for the Pen tool. The Pen
// tool's editing mode (added on top of the original "create" mode)
// needs to read back the anchors of a committed path and rebuild the
// SVG `d` string after the user drags a handle, so the math lives in
// one place.

export interface PenAnchor {
  /** Image-space anchor position. */
  x: number;
  y: number;
  /** Optional bezier control handles. */
  cIn?: { x: number; y: number };
  cOut?: { x: number; y: number };
}

/** Build an SVG `d` string from a list of anchors. Bezier control
 *  points on either side of an anchor turn that segment into a `C`
 *  curve; otherwise it falls back to a straight line. */
export function buildPenD(anchors: PenAnchor[]): string {
  if (anchors.length === 0) return "";
  const a0 = anchors[0];
  if (!a0) return "";
  let d = `M ${a0.x},${a0.y}`;
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const cur = anchors[i];
    if (!prev || !cur) continue;
    if (prev.cOut || cur.cIn) {
      const co = prev.cOut ?? prev;
      const ci = cur.cIn ?? cur;
      d += ` C ${co.x},${co.y} ${ci.x},${ci.y} ${cur.x},${cur.y}`;
    } else {
      d += ` L ${cur.x},${cur.y}`;
    }
  }
  return d;
}

/** Custom Fabric properties we persist through toObject / loadFromJSON
 *  so layer tags + pen anchors survive undo / redo and tool-switch
 *  carryover. Used by EditorContext.commit and ImageCanvas snapshot
 *  capture; keep it in one place so adding a new persisted prop is a
 *  single edit. */
export const FABRIC_PERSISTED_PROPS = ["cloakKind", "cloakAnchors"] as const;

/** cloakKind tags that should NOT cross a tool boundary — they're
 *  owned by a single tool's lifecycle. The Crop overlay rect, Pen's
 *  in-progress work path, and Pen's anchor handles all clean
 *  themselves up on tool unmount; this filter is the belt-and-braces. */
export const TRANSIENT_CLOAK_KINDS = new Set<string>([
  "cloak:cropOverlay",
  "cloak:penWork",
  "cloak:penAnchor",
]);

interface FabricLikeCanvas {
  getObjects(): Array<{ toObject(props: string[]): unknown }>;
}

/** Build a hand-off snapshot of just the user-added objects (text,
 *  shapes, stickers, watermark, draw paths, placed images, etc.).
 *
 *  We deliberately omit canvas-level state (backgroundImage,
 *  viewportTransform, clipPath, overlay) because:
 *
 *  - `backgroundImage` is owned by ImageCanvas's bg-image effect,
 *    which sets it to a live `FabricImage(doc.working)` reference.
 *    A serialized FabricImage round-trips as a data URL, losing the
 *    live-canvas link — undo + new edits no longer show their bake.
 *
 *  - `viewportTransform` is mirrored from the editor's pan/zoom by a
 *    separate effect; carrying the captured one through would briefly
 *    teleport the view on every tool switch.
 *
 *  Returning just `{ version, objects }` keeps `loadFromJSON` happy
 *  while leaving canvas-level state untouched. */
export function snapshotPersistentObjects(fc: FabricLikeCanvas): object | null {
  const all = fc.getObjects();
  if (all.length === 0) return null;
  const propsList = FABRIC_PERSISTED_PROPS as unknown as string[];
  const objects = all
    .filter((o) => !TRANSIENT_CLOAK_KINDS.has((o as { cloakKind?: string }).cloakKind ?? ""))
    .map((o) => o.toObject(propsList) as { cloakKind?: string });
  if (objects.length === 0) return null;
  // The version field is informational; loadFromJSON tolerates its
  // absence in fabric v6+, but including it keeps the snapshot shape
  // identical to a real `Canvas.toJSON()` output for forward compat.
  return { version: "fabric-snapshot", objects };
}
