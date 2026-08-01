// history.ts — Tiny linear undo/redo stack over canvas + layer +
// Fabric-scene snapshots. Each entry captures (a) the baked working
// canvas, (b) a deep copy of the legacy `Layer` list, and (c) a JSON
// snapshot of the Fabric scene if a Fabric canvas is mounted. Cmd-Z
// reverses any combination of these.
//
// Memory: a 24 MP photo's raw canvas is ~96 MB. Holding 30 of them
// uncompressed is ~3 GB worst case, which is enough to crash mobile
// Safari outright. Each entry therefore starts as a live canvas (so
// the very next undo is instant) and is asynchronously re-encoded to
// a WebP blob in the background — typical compression is 10–30×, so
// older entries shrink to a few megabytes. The base "Open" entry is
// pinned uncompressed so the compare view can paint it synchronously.
//
// Restoring a compressed entry pays a single decodeImageBitmap on
// undo/redo (a few ms for typical sizes); that's the trade.

import { type BackgroundTreatment, copyInto, type Layer, releaseCanvas, snapshot } from "./doc";

export interface HistoryEntry {
  label: string;
  /** Live canvas snapshot. Present right after push, and on the
   *  base entry (pinned for compare view). Set to null once
   *  asynchronous compression has produced a `blob`. */
  canvas: HTMLCanvasElement | null;
  /** WebP-encoded snapshot. Restored to a canvas on undo/redo. */
  blob: Blob | null;
  width: number;
  height: number;
  layers: Layer[];
  /** Snapshot of the Fabric scene at commit time
   *  (`canvas.toJSON()` output). Null when no Fabric canvas is
   *  mounted or has nothing to serialise. */
  fabric: object | null;
  /** Semantic background state paired with this pixel snapshot. */
  backgroundTreatment: BackgroundTreatment;
  /** Tiny preview (≤96 px long edge) used by the History Scrubber so
   *  the user can "see" every step in the timeline rather than reading
   *  labels. Generated synchronously on push (a 24 MP downsample to
   *  ~96² is ~0.5 ms with high-quality smoothing) and held alongside
   *  the entry for the entry's lifetime. NOT pool-backed — pool
   *  canvases get recycled on release, but the thumb has to outlive
   *  the entry's working canvas (which gets compressed to a blob and
   *  released). */
  thumb: HTMLCanvasElement | null;
}

/** Lightweight per-entry shape exposed to the UI scrubber so it can
 *  render the timeline without holding a reference to the live entry
 *  object (which the History class otherwise mutates). The thumb
 *  canvas IS shared (DOM-attached <canvas> is cheap to hand out — the
 *  scrubber just paints it into a CSS-sized container) but everything
 *  else is a snapshot of the field at read time. */
export interface HistoryEntrySnapshot {
  label: string;
  thumb: HTMLCanvasElement | null;
  width: number;
  height: number;
}

const COMPRESSED_FORMAT = "image/webp";
// 0.92 is high enough to be visually lossless on photographs in the
// common range; the encoder still hits ~10–30× compression versus the
// raw RGBA buffer, which is where the savings come from.
const COMPRESSED_QUALITY = 0.92;

export class History {
  private stack: HistoryEntry[] = [];
  private cursor = -1;
  /** Cap so a long session doesn't gobble RAM. */
  private readonly limit = 30;
  /** Pinned base entry used by the compare view + reset-to-original.
   *  Kept uncompressed so consumers can paint it synchronously. */
  private baseEntry: HistoryEntry | null = null;

  push(
    label: string,
    canvas: HTMLCanvasElement,
    layers: Layer[],
    fabric: object | null,
    backgroundTreatment: BackgroundTreatment = "original",
  ) {
    // Drop any redo branch.
    const dropped = this.stack.splice(this.cursor + 1);
    for (const e of dropped) this.dispose(e);
    const snap = snapshot(canvas);
    const entry: HistoryEntry = {
      label,
      canvas: snap,
      blob: null,
      width: snap.width,
      height: snap.height,
      layers: cloneLayers(layers),
      fabric,
      backgroundTreatment,
      thumb: makeThumb(snap),
    };
    this.stack.push(entry);
    // The first push after a clear becomes the pinned base.
    if (!this.baseEntry) this.baseEntry = entry;
    if (this.stack.length > this.limit) {
      const evicted = this.stack.shift();
      if (evicted) this.dispose(evicted);
    }
    this.cursor = this.stack.length - 1;
    // Compress every entry except the pinned base.
    if (entry !== this.baseEntry) scheduleCompress(entry);
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }
  canRedo(): boolean {
    return this.cursor < this.stack.length - 1;
  }

  /** Label of the entry the cursor is currently on (i.e. the most
   *  recently committed state). Used by tools like Frame that want to
   *  detect "you're editing your own previous commit" so they can
   *  replace it instead of stacking another one on top. */
  currentLabel(): string | null {
    return this.stack[this.cursor]?.label ?? null;
  }

  /** Absolute position of the cursor in the stack. -1 when the stack
   *  is empty; 0 when sitting on the pinned base ("Open") entry; N
   *  after N commits past base. The mobile in-tool sheet captures
   *  this on open and rewinds to it on cancel — implements the
   *  Snapseed-style "discard everything I did inside this tool"
   *  semantic without needing a dedicated transactional layer. */
  currentIndex(): number {
    return this.cursor;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    this.cursor -= 1;
    return this.stack[this.cursor] ?? null;
  }
  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    this.cursor += 1;
    return this.stack[this.cursor] ?? null;
  }

  /** Pinned base entry — used by the before/after compare view to peek
   *  at the original. Always uncompressed (canvas-backed). */
  base(): HistoryEntry | null {
    return this.baseEntry;
  }

  /** Shallow snapshot of every entry's UI-relevant fields. Returned in
   *  stack order (base first, latest last). Used by the History
   *  Scrubber to render a click-to-jump timeline without having to
   *  reach into the live `HistoryEntry` objects this class otherwise
   *  mutates during compression. */
  entriesSnapshot(): HistoryEntrySnapshot[] {
    return this.stack.map((e) => ({
      label: e.label,
      thumb: e.thumb,
      width: e.width,
      height: e.height,
    }));
  }

  clear() {
    for (const e of this.stack) this.dispose(e);
    this.stack = [];
    this.cursor = -1;
    this.baseEntry = null;
  }

  /** Free an entry's resources. The pinned base is never disposed by
   *  this path — `clear()` resets it explicitly. */
  private dispose(e: HistoryEntry) {
    if (e === this.baseEntry) return;
    if (e.canvas) {
      releaseCanvas(e.canvas);
      e.canvas = null;
    }
    // Thumbs are document-created canvases (not pool-backed); just
    // drop the reference so the GC can reclaim them. The pinned base
    // and live cursor entry stay alive via the stack itself.
    e.thumb = null;
    e.blob = null;
  }
}

/** Restore an entry's pixels into `target`. Sync if the entry still
 *  has a live canvas; otherwise decodes its blob via createImageBitmap.
 *  No-op when an entry has neither (shouldn't happen unless disposed). */
export async function restoreCanvas(target: HTMLCanvasElement, entry: HistoryEntry): Promise<void> {
  if (entry.canvas) {
    copyInto(target, entry.canvas);
    return;
  }
  if (!entry.blob) return;
  let bm: ImageBitmap | null = null;
  try {
    bm = await createImageBitmap(entry.blob);
    if (target.width !== entry.width) target.width = entry.width;
    if (target.height !== entry.height) target.height = entry.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(bm, 0, 0);
  } finally {
    bm?.close?.();
  }
}

/** Tiny ≤96 px-long-edge downsample used by the History Scrubber.
 *  Uses a document-allocated canvas (not the pool) because thumbs are
 *  retained for the entry's full lifetime; pool canvases get recycled
 *  on release. High-quality smoothing — at 96² the cost is negligible
 *  but the visual difference between nearest-neighbour and bilinear
 *  is large at this size. */
const THUMB_MAX_PX = 96;
function makeThumb(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const long = Math.max(src.width, src.height);
  if (long === 0) return null;
  const ratio = long > THUMB_MAX_PX ? THUMB_MAX_PX / long : 1;
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

function scheduleCompress(entry: HistoryEntry) {
  const c = entry.canvas;
  if (!c) return;
  // toBlob is async; by the time it resolves the entry may have been
  // evicted or cleared. Compare on the captured canvas reference so we
  // don't write the blob into a recycled entry.
  c.toBlob(
    (blob) => {
      if (!blob || entry.canvas !== c) return;
      entry.blob = blob;
      entry.canvas = null;
      releaseCanvas(c);
    },
    COMPRESSED_FORMAT,
    COMPRESSED_QUALITY,
  );
}

function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    if (l.kind === "draw") {
      return {
        ...l,
        strokes: l.strokes.map((s) => ({
          ...s,
          points: s.points.map((p) => [p[0], p[1]] as [number, number]),
        })),
      };
    }
    return { ...l };
  });
}
