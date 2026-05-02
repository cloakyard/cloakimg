// draft.ts — Auto-save the in-progress edit to IndexedDB so a tab
// crash, accidental close, or laptop sleep doesn't drop the user's
// work. One slot per browser profile (key = "current") — overwritten
// on every commit, cleared on successful export.
//
// 100% local. The DB lives in the user's browser profile and never
// leaves the machine. Mirrors the Recents storage pattern.

const DB_NAME = "cloakimg-draft";
const STORE = "draft";
const VERSION = 1;
const SLOT = "current";

export interface DraftEntry {
  /** Always "current" — single-slot. */
  id: string;
  fileName: string;
  /** Wall-clock millis when the snapshot was taken. */
  savedAt: number;
  width: number;
  height: number;
  /** Baked working canvas as a PNG blob. */
  imageBlob: Blob;
  /** Tiny preview for the resume prompt (~120 px square data URL). */
  thumbUrl: string;
  /** Fabric scene JSON if any non-destructive layers exist. */
  fabricJson: unknown;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Draft DB open failed"));
  });
  return dbPromise;
}

export async function saveDraft(
  canvas: HTMLCanvasElement,
  fabricJson: unknown,
  fileName: string,
): Promise<void> {
  try {
    const imageBlob = await canvasToBlob(canvas, "image/png");
    if (!imageBlob) return;
    const thumbUrl = makeThumb(canvas);
    const entry: DraftEntry = {
      id: SLOT,
      fileName,
      savedAt: Date.now(),
      width: canvas.width,
      height: canvas.height,
      imageBlob,
      thumbUrl,
      fabricJson,
    };
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Draft put failed"));
    });
  } catch {
    // Auto-save is best-effort; never throw into the editor flow.
  }
}

export async function loadDraft(): Promise<DraftEntry | null> {
  try {
    const db = await openDB();
    return await new Promise<DraftEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SLOT);
      req.onsuccess = () => resolve((req.result as DraftEntry) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Draft get failed"));
    });
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(SLOT);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Draft delete failed"));
    });
  } catch {
    // Best-effort.
  }
}

/** Convert a draft back to a `File` so the existing editor flow can
 *  open it as if uploaded. The caller picks up the fabric JSON
 *  separately (it can't ride on a File). */
export function draftToFile(entry: DraftEntry): File {
  return new File([entry.imageBlob], entry.fileName, {
    type: entry.imageBlob.type || "image/png",
    lastModified: entry.savedAt,
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime));
}

function makeThumb(canvas: HTMLCanvasElement, size = 120): string {
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingQuality = "high";
  // Cover-fit centre crop.
  const ratio = Math.min(canvas.width, canvas.height) / size;
  const cw = size * ratio;
  const ch = size * ratio;
  const cx = (canvas.width - cw) / 2;
  const cy = (canvas.height - ch) / 2;
  ctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, size, size);
  return out.toDataURL("image/jpeg", 0.7);
}
