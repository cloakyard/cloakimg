// StickerPanel.tsx — Phase F4.5+. Two grids: built-in vector stickers
// (Path-based, recolourable) and user-uploaded ones (PNG / JPG / SVG)
// stored in IndexedDB. Click to select, then click the canvas to drop.

import { useCallback, useEffect, useState } from "react";
import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";
import { PropRow } from "../atoms";
import {
  addCustomSticker,
  type CustomSticker,
  deleteCustomSticker,
  listCustomStickers,
  subscribeCustomStickers,
} from "./customStickers";
import { STICKERS } from "./stickers";

export function StickerPanel() {
  const { toolState, patchTool } = useEditor();
  const [customs, setCustoms] = useState<CustomSticker[]>([]);
  const [busy, setBusy] = useState(false);

  // Live-load + subscribe so multiple tabs / future uploads stay in sync.
  useEffect(() => {
    let cancelled = false;
    void listCustomStickers().then((c) => {
      if (!cancelled) setCustoms(c);
    });
    const unsub = subscribeCustomStickers(() => {
      void listCustomStickers().then((c) => {
        if (!cancelled) setCustoms(c);
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const onUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      try {
        // Add each file in order; the most recent ends up first in the
        // grid because the list is sorted by addedAt desc.
        for (const f of Array.from(files)) {
          if (!f.type.startsWith("image/") && !/\.svg$/i.test(f.name)) continue;
          const entry = await addCustomSticker(f);
          if (entry) {
            patchTool("customStickerId", entry.id);
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [patchTool],
  );

  return (
    <>
      <PropRow label="Built-in">
        <div className="grid grid-cols-4 gap-1.5">
          {STICKERS.map((s, i) => {
            const active = i === toolState.stickerKind && !toolState.customStickerId;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  patchTool("stickerKind", i);
                  patchTool("customStickerId", null);
                }}
                title={s.name}
                aria-label={s.name}
                aria-pressed={active}
                className={`flex aspect-square cursor-pointer items-center justify-center rounded-md bg-surface p-1 dark:bg-dark-surface ${
                  active
                    ? "border-2 border-coral-500"
                    : "border border-border dark:border-dark-border"
                }`}
              >
                <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden>
                  <path d={s.d} fill={s.fill} />
                </svg>
              </button>
            );
          })}
        </div>
      </PropRow>
      <PropRow label="Your stickers">
        <div className="grid grid-cols-4 gap-1.5">
          {customs.map((c) => {
            const active = c.id === toolState.customStickerId;
            return (
              <div key={c.id} className="relative aspect-square">
                <button
                  type="button"
                  onClick={() => patchTool("customStickerId", c.id)}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={active}
                  className={`flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-md bg-surface p-1 dark:bg-dark-surface ${
                    active
                      ? "border-2 border-coral-500"
                      : "border border-border dark:border-dark-border"
                  }`}
                >
                  <img src={c.dataUrl} alt={c.name} className="h-full w-full object-contain" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteCustomSticker(c.id);
                    if (active) patchTool("customStickerId", null);
                  }}
                  aria-label={`Remove ${c.name}`}
                  className="absolute top-0.5 right-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-black/55 p-0 text-white"
                >
                  <I.X size={9} />
                </button>
              </div>
            );
          })}
          <label
            className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-page-bg p-1 text-text-muted dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text-muted"
            title="Upload PNG / JPG / SVG"
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,.svg"
              multiple
              onChange={(e) => {
                void onUpload(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
              disabled={busy}
            />
            <I.Plus size={14} />
            <span className="text-[9.5px] font-semibold">Add</span>
          </label>
        </div>
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click on the canvas to drop the selected sticker. Drop your own PNG / JPG / SVG into the
        grid above; they're stored locally and persist across sessions.
      </div>
    </>
  );
}
