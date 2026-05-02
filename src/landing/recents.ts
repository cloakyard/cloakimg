// recents.ts — IndexedDB-backed list of files the user has opened.
// Stores up to 10 most-recent entries: id, name, mime, size, opened-at,
// thumb dataURL, and the original file bytes so re-opening a recent
// behaves identically to a fresh upload.
//
// File data is stored as an ArrayBuffer rather than a Blob — iOS Safari
// has a long-standing WebKit bug where Blobs persisted in IDB lose
// their backing data across sessions (metadata survives but
// `createImageBitmap` / `arrayBuffer()` fail on read). ArrayBuffers
// round-trip reliably on every browser.
//
// 100% local. The DB lives in the user's browser profile and never
// leaves the machine.

const DB_NAME = "cloakimg-recents";
const STORE = "recents";
const VERSION = 1;
const MAX_ENTRIES = 10;

export interface RecentEntry {
  id: string;
  name: string;
  mime: string;
  size: number;
  openedAt: number;
  /** The file's `lastModified` at the time of the original upload. Stored
   *  separately so `recentToFile()` can preserve it on re-derivation;
   *  without this, picking a recent rebuilds a `File` with a fresh
   *  `lastModified`, the id derived from it differs, and the next
   *  `rememberRecent()` writes a duplicate row. */
  originalLastModified?: number;
  thumbUrl: string; // base64 data URL, ~120px square
  /** Raw file bytes. We persist as ArrayBuffer instead of Blob because
   *  iOS Safari's WebKit drops Blob-backed data from IDB across sessions
   *  (the metadata survives but `createImageBitmap`/`arrayBuffer()` then
   *  fails); ArrayBuffers round-trip reliably everywhere. */
  bytes?: ArrayBuffer;
  /** Legacy entries written before the ArrayBuffer migration. Read-only
   *  fallback for `recentToFile()`; never written by `rememberRecent`. */
  blob?: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("openedAt", "openedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

const subscribers = new Set<() => void>();

export function subscribeRecents(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notify() {
  for (const cb of subscribers) cb();
}

export async function listRecents(): Promise<RecentEntry[]> {
  try {
    const db = await openDB();
    return await new Promise<RecentEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as RecentEntry[]) ?? [];
        items.sort((a, b) => b.openedAt - a.openedAt);
        resolve(items.slice(0, MAX_ENTRIES));
      };
      req.onerror = () => reject(req.error ?? new Error("getAll failed"));
    });
  } catch {
    return [];
  }
}

export async function rememberRecent(file: File): Promise<void> {
  try {
    const [thumbUrl, bytes] = await Promise.all([buildThumb(file), file.arrayBuffer()]);
    const id = `${file.name}-${file.size}-${file.lastModified}`;
    const entry: RecentEntry = {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      openedAt: Date.now(),
      originalLastModified: file.lastModified,
      thumbUrl,
      bytes,
    };
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("put failed"));
    });
    await pruneToMax();
    notify();
  } catch {
    // Best-effort: storage may be unavailable in private windows.
  }
}

export async function deleteRecent(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    });
    notify();
  } catch {
    // ignore
  }
}

export async function clearRecents(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
    });
    notify();
  } catch {
    // ignore
  }
}

async function pruneToMax(): Promise<void> {
  const all = await listRecents();
  if (all.length <= MAX_ENTRIES) return;
  const excess = all.slice(MAX_ENTRIES);
  for (const e of excess) await deleteRecent(e.id);
}

async function buildThumb(file: File): Promise<string> {
  try {
    const bm = await createImageBitmap(file);
    const size = 240;
    const aspect = bm.width / bm.height;
    const w = aspect >= 1 ? size : Math.round(size * aspect);
    const h = aspect >= 1 ? Math.round(size / aspect) : size;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bm, 0, 0, w, h);
    return canvas.toDataURL("image/webp", 0.7);
  } catch {
    return "";
  }
}

/** Convert a stored RecentEntry back into a File so it can flow through
 *  the same code path as a fresh upload. */
export function recentToFile(entry: RecentEntry): File {
  // Prefer the ArrayBuffer payload; fall back to the legacy Blob field
  // for entries written before the migration.
  const data: BlobPart | undefined = entry.bytes ?? entry.blob;
  if (!data) {
    throw new Error("Recent entry has no file data");
  }
  return new File([data], entry.name, {
    type: entry.mime || entry.blob?.type || "",
    // Preserve the original lastModified so the id derived on the next
    // rememberRecent() call matches and we overwrite the row in IDB
    // instead of inserting a duplicate.
    lastModified: entry.originalLastModified ?? entry.openedAt,
  });
}
