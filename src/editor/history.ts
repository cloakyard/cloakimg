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

import { copyInto, type Layer, releaseCanvas, snapshot } from "./doc";

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

  push(label: string, canvas: HTMLCanvasElement, layers: Layer[], fabric: object | null) {
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
