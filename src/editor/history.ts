// history.ts — Tiny linear undo/redo stack over canvas + layer +
// Fabric-scene snapshots. Each entry captures (a) the baked working
// canvas, (b) a deep copy of the legacy `Layer` list, and (c) a JSON
// snapshot of the Fabric scene if a Fabric canvas is mounted. Cmd-Z
// reverses any combination of these.

import { type Layer, snapshot } from "./doc";

export interface HistoryEntry {
  label: string;
  canvas: HTMLCanvasElement;
  layers: Layer[];
  /** Snapshot of the Fabric scene at commit time
   *  (`canvas.toJSON()` output). Null when no Fabric canvas is
   *  mounted or has nothing to serialise. */
  fabric: object | null;
}

export class History {
  private stack: HistoryEntry[] = [];
  private cursor = -1;
  /** Cap so a long session doesn't gobble RAM. */
  private readonly limit = 30;

  push(label: string, canvas: HTMLCanvasElement, layers: Layer[], fabric: object | null) {
    this.stack.splice(this.cursor + 1);
    this.stack.push({
      label,
      canvas: snapshot(canvas),
      layers: cloneLayers(layers),
      fabric,
    });
    if (this.stack.length > this.limit) this.stack.shift();
    this.cursor = this.stack.length - 1;
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

  /** Snapshot of the bottom of the stack — used by the before/after
   *  compare view to peek at the original. */
  base(): HistoryEntry | null {
    return this.stack[0] ?? null;
  }

  clear() {
    this.stack = [];
    this.cursor = -1;
  }
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
