// batch.ts — Models and runtime for batch mode. The recipe is a small,
// serializable list of steps; we run each file through the steps
// sequentially and emit a Blob per file.

import type { ExportSettings } from "./exportPipeline";
import { exportDoc } from "./exportPipeline";
import { bakeAdjust } from "./tools/adjustments";
import { copyInto, createCanvas, type EditorDoc } from "./doc";
import { decodeHeic, isHeicFile } from "./heicDecoder";
import { FILTER_PRESETS_RECIPES } from "./tools/filterPresets";

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (isHeicFile(file)) {
    try {
      return await decodeHeic(file);
    } catch {
      // Fall through if a `.heic`-named file isn't actually HEIC.
    }
  }
  return await createImageBitmap(file);
}

interface BaseStep {
  /** Stable identity for React keys + drag-drop bookkeeping. */
  id: string;
}

export type RecipeStep =
  | (BaseStep & {
      kind: "resize";
      longEdge: number;
    })
  | (BaseStep & {
      kind: "adjust";
      vector: number[]; // length 9
    })
  | (BaseStep & {
      kind: "filter";
      preset: number;
      intensity: number;
      grain: number;
    })
  | (BaseStep & {
      kind: "strip-metadata";
    })
  | (BaseStep & {
      kind: "convert";
      settings: ExportSettings;
    });

let stepCounter = 0;
export function newStepId(): string {
  stepCounter += 1;
  return `step-${stepCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export type BatchStatus = "queued" | "progress" | "done" | "error";

export interface BatchFile {
  id: string;
  name: string;
  file: File;
  thumbUrl?: string;
  status: BatchStatus;
  resultBlobUrl?: string;
  resultName?: string;
  error?: string;
}

export const DEFAULT_RECIPE: RecipeStep[] = [
  { id: newStepId(), kind: "resize", longEdge: 2400 },
  {
    id: newStepId(),
    kind: "adjust",
    vector: [0.5, 0.55, 0.5, 0.55, 0.5, 0.5, 0.55, 0.55, 0.5],
  },
  { id: newStepId(), kind: "strip-metadata" },
  {
    id: newStepId(),
    kind: "convert",
    settings: { format: 0, quality: 0.82, sizeBucket: 1 },
  },
];

export async function buildThumb(file: File): Promise<string> {
  const bm = await loadBitmap(file).catch(() => null);
  if (!bm) return "";
  const target = 280;
  const scale = Math.min(target / bm.width, target / bm.height);
  const w = Math.max(1, Math.round(bm.width * scale));
  const h = Math.max(1, Math.round(bm.height * scale));
  const c = createCanvas(w, h);
  c.getContext("2d")?.drawImage(bm, 0, 0, w, h);
  return await new Promise<string>((resolve) =>
    c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ""), "image/webp", 0.7),
  );
}

export async function runRecipe(
  file: File,
  recipe: RecipeStep[],
): Promise<{ blob: Blob; name: string }> {
  // Build a transient doc.
  const bm = await loadBitmap(file);
  const working = createCanvas(bm.width, bm.height);
  working.getContext("2d")?.drawImage(bm, 0, 0);
  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  const sourceBytes = isJpeg ? new Uint8Array(await file.arrayBuffer()) : null;
  const doc: EditorDoc = {
    width: bm.width,
    height: bm.height,
    source: bm,
    sourceBytes,
    sourceIsJpeg: isJpeg,
    working,
    exif: null,
    fileName: file.name,
    layers: [],
  };

  let convertSettings: ExportSettings = {
    format: 0,
    quality: 0.82,
    sizeBucket: 1,
  };

  for (const step of recipe) {
    if (step.kind === "resize") {
      const long = step.longEdge;
      const scale = long / Math.max(doc.width, doc.height);
      if (scale < 1) {
        const nw = Math.round(doc.width * scale);
        const nh = Math.round(doc.height * scale);
        const out = createCanvas(nw, nh);
        const ctx = out.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(doc.working, 0, 0, nw, nh);
          copyInto(doc.working, out);
          doc.width = nw;
          doc.height = nh;
        }
      }
    } else if (step.kind === "adjust") {
      const out = bakeAdjust(doc.working, step.vector, 0);
      copyInto(doc.working, out);
    } else if (step.kind === "filter") {
      const preset = FILTER_PRESETS_RECIPES[step.preset];
      if (preset) {
        const final = preset.adjust.map((delta) =>
          Math.min(1, Math.max(0, 0.5 + delta * step.intensity)),
        );
        const out = bakeAdjust(doc.working, final, step.grain);
        copyInto(doc.working, out);
      }
    } else if (step.kind === "strip-metadata") {
      doc.exif = null;
    } else if (step.kind === "convert") {
      convertSettings = step.settings;
    }
  }

  const result = await exportDoc(doc, doc.layers, convertSettings);
  return { blob: result.blob, name: result.fileName };
}
