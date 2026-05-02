// customStickers.ts — User-uploaded sticker library, persisted in
// IndexedDB so a user's PNG / SVG collection survives reloads.
//
// 100% local: the data URLs live in the user's browser profile and
// never leave the device. Mirrors the Recents storage pattern.

const DB_NAME = "cloakimg-stickers";
const STORE = "stickers";
const VERSION = 1;
const MAX_ENTRIES = 30;

export interface CustomSticker {
  id: string;
  name: string;
  /** Inlined data URL — works as both panel thumb and FabricImage src. */
  dataUrl: string;
  /** SVG content as text, when the upload was an `image/svg+xml`. We
   *  prefer setting Fabric `Path` from the SVG geometry over a raster
   *  FabricImage, so the sticker keeps its vector edges on zoom. */
  svgText?: string;
  addedAt: number;
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
        store.createIndex("addedAt", "addedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Sticker DB open failed"));
  });
  return dbPromise;
}

const subscribers = new Set<() => void>();

export function subscribeCustomStickers(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notify() {
  for (const cb of subscribers) cb();
}

export async function listCustomStickers(): Promise<CustomSticker[]> {
  try {
    const db = await openDB();
    return await new Promise<CustomSticker[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as CustomSticker[]) ?? [];
        items.sort((a, b) => b.addedAt - a.addedAt);
        resolve(items.slice(0, MAX_ENTRIES));
      };
      req.onerror = () => reject(req.error ?? new Error("Sticker getAll failed"));
    });
  } catch {
    return [];
  }
}

export async function addCustomSticker(file: File): Promise<CustomSticker | null> {
  try {
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const dataUrl = await readFileAsDataUrl(file);
    const svgText = isSvg ? await file.text() : undefined;
    const entry: CustomSticker = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name.replace(/\.(png|jpe?g|gif|webp|svg)$/i, "") || "Sticker",
      dataUrl,
      svgText,
      addedAt: Date.now(),
    };
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Sticker put failed"));
    });
    notify();
    return entry;
  } catch {
    return null;
  }
}

export async function deleteCustomSticker(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Sticker delete failed"));
    });
    notify();
  } catch {
    // Best-effort.
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
