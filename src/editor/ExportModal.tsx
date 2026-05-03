// ExportModal.tsx — Format · quality · size with a live preview and
// real-bytes estimated size. On Download we run the export pipeline,
// build an object URL, and click an anchor for the user.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearDraft } from "../landing/draft";
import { I } from "../icons";
import { ModalFrame } from "../ModalFrame";
import { PropRow, Segment, Slider, Spinner, ToggleSwitch } from "./atoms";
import { useEditor } from "./EditorContext";
import { toast } from "./Toasts";
import { useFocusReturn, useFocusTrap } from "./useFocusReturn";
import {
  estimateBytes,
  estimateBytesByEncode,
  type ExportSettings,
  exportDoc,
  isHeicEncodeSupported,
  settingsToFormat,
} from "./exportPipeline";
import { exifToFields } from "./tools/exif";
import type { MetaToggles } from "./toolState";
import type { Layout } from "./types";

const META_TOGGLES: { label: string; key: keyof MetaToggles }[] = [
  { label: "Strip GPS", key: "stripGPS" },
  { label: "Strip camera info", key: "stripCamera" },
  { label: "Strip timestamp", key: "stripTimestamp" },
  { label: "Keep ICC profile", key: "keepICC" },
];

interface Props {
  layout: Layout;
  settings: ExportSettings;
  onPatch: (next: Partial<ExportSettings>) => void;
  onClose: () => void;
}

export type { ExportSettings };

const BASE_FORMATS = ["JPG", "PNG", "WebP", "AVIF"] as const;

export function ExportModal({ layout, settings, onPatch, onClose }: Props) {
  const { doc, layers, toolState, patchTool, getFabricCanvas, flushPendingApply } = useEditor();
  const isMobile = layout === "mobile";
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [heicSupported, setHeicSupported] = useState(false);
  // Gate preview generation on a one-shot flush of any pending tool
  // apply (Adjust/Filter/Crop sliders that haven't been committed yet).
  // Running flush in a deferred effect — instead of synchronously in
  // openExport — lets the modal frame paint first, so tapping Export
  // on mobile feels instant even when the bake is slow.
  const [prepared, setPrepared] = useState(false);
  const metaFields = useMemo(() => exifToFields(doc?.exif ?? null), [doc?.exif]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusReturn(true);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // setTimeout(0) — not queueMicrotask — so the browser gets a chance
  // to paint the modal between mount and the (potentially heavy)
  // canvas bake. queueMicrotask would run before paint and defeat the
  // purpose.
  useEffect(() => {
    const id = window.setTimeout(() => {
      flushPendingApply();
      setPrepared(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [flushPendingApply]);

  // Probe Safari-only HEIC encode support once on mount. Other engines
  // silently fall back to PNG, so we keep the option hidden there.
  useEffect(() => {
    let cancelled = false;
    void isHeicEncodeSupported().then((ok) => {
      if (!cancelled) setHeicSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const formats = useMemo(
    () => (heicSupported ? [...BASE_FORMATS, "HEIC"] : BASE_FORMATS.slice()),
    [heicSupported],
  );

  // If the user had HEIC selected and the probe came back negative
  // (or they re-opened on a different browser), fall back to AVIF —
  // closest in-spirit cross-browser option.
  useEffect(() => {
    if (!heicSupported && settings.format === 4) {
      onPatch({ format: 3 });
    }
  }, [heicSupported, settings.format, onPatch]);

  // Preview the working canvas as an <img> so it reflects the current
  // working state including Fabric overlays (text, shapes, stickers,
  // strokes). Mirrors the bake step in `exportDoc` so the preview
  // matches what the user will actually download. Waits on `prepared`
  // so it sees the post-flush doc.working, not a stale frame.
  useEffect(() => {
    if (!doc || !prepared) return;
    let cancelled = false;
    const off = document.createElement("canvas");
    off.width = doc.width;
    off.height = doc.height;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(doc.working, 0, 0);
    const fc = getFabricCanvas();
    if (fc) {
      for (const obj of fc.getObjects()) {
        if (!obj.visible) continue;
        obj.render(ctx);
      }
    }
    off.toBlob((b) => {
      if (cancelled || !b) return;
      const url = URL.createObjectURL(b);
      setPreviewUrl(url);
    }, "image/png");
    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, prepared, getFabricCanvas]);

  const targetW = useMemo(() => {
    if (!doc) return 0;
    return settings.width ?? Math.round(doc.width * (settings.sizeBucket === 2 ? 0.5 : 1));
  }, [doc, settings.sizeBucket, settings.width]);
  const targetH = useMemo(() => {
    if (!doc) return 0;
    return settings.height ?? Math.round(doc.height * (settings.sizeBucket === 2 ? 0.5 : 1));
  }, [doc, settings.height, settings.sizeBucket]);

  // Cheap synchronous fallback that renders immediately, then a real
  // thumb-encode pass refines it (within ~5% of actual export size).
  const fallbackEstimate = useMemo(
    () => estimateBytes(targetW, targetH, settings),
    [settings, targetH, targetW],
  );
  const [estimate, setEstimate] = useState(fallbackEstimate);
  useEffect(() => {
    setEstimate(fallbackEstimate);
    if (!doc) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void estimateBytesByEncode(doc.working, targetW, targetH, settings).then((bytes) => {
        if (!cancelled) setEstimate(bytes);
      });
    }, 120); // debounce slider drags
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [doc, fallbackEstimate, settings, targetH, targetW]);

  const download = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const result = await exportDoc(doc, layers, settings, toolState.meta, getFabricCanvas());
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      // Successful export → drop the auto-saved draft, otherwise the
      // landing page would offer to "resume" something the user has
      // already shipped.
      void clearDraft();
      toast.success(`Exported ${result.fileName}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.warn(msg, 6000);
    } finally {
      setBusy(false);
    }
  }, [doc, getFabricCanvas, layers, onClose, settings, toolState.meta]);

  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-180"
      labelledBy="export-title"
      dialogRef={dialogRef}
      dialogClassName={isMobile ? "flex-col" : "flex-row"}
    >
      <div
        className={`flex items-center justify-center overflow-hidden bg-canvas-bg ${
          isMobile ? "h-44 shrink-0 p-3" : "min-h-80 flex-1 p-6"
        }`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Export preview"
            className={`rounded-xs ${
              isMobile ? "max-h-full max-w-full object-contain" : "max-h-90 max-w-full"
            }`}
            style={{ boxShadow: "0 8px 24px -6px rgba(0,0,0,0.4)" }}
          />
        ) : (
          <Spinner label="Preparing preview…" />
        )}
      </div>

      <div className={`flex flex-col ${isMobile ? "min-h-0 w-full flex-1" : "w-80"}`}>
        <div
          className={`scroll-thin flex flex-col gap-3.5 ${
            isMobile ? "min-h-0 flex-1 overflow-y-auto px-4.5 pt-4.5 pb-3" : "px-5.5 pt-5.5 pb-3"
          }`}
        >
          <div>
            <div className="t-eyebrow mb-1 text-[10px]">Export</div>
            <div id="export-title" className="t-headline text-lg">
              Save your image
            </div>
          </div>

          <PropRow label="Format">
            <Segment
              options={formats}
              active={settings.format}
              onChange={(i) => onPatch({ format: i })}
            />
          </PropRow>
          {heicSupported && settings.format === 4 && (
            <p className="-mt-2 text-[11px] leading-[1.45] text-text-muted dark:text-dark-text-muted">
              HEIC export uses Safari's native encoder. For the same wide-gamut + small-file
              benefits in Chrome/Firefox, use AVIF.
            </p>
          )}

          <PropRow
            label="Quality"
            value={
              settingsToFormat(settings) === "png"
                ? "lossless"
                : `${Math.round(settings.quality * 100)}%`
            }
          >
            <Slider value={settings.quality} accent onChange={(v) => onPatch({ quality: v })} />
          </PropRow>
          <PropRow label="Size">
            <Segment
              options={["Original", "@2x", "@1x"]}
              active={settings.sizeBucket}
              onChange={(i) => onPatch({ sizeBucket: i, width: undefined, height: undefined })}
            />
          </PropRow>

          <PropRow label="Resize to">
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <DimInput label="W" value={targetW} onChange={(n) => onPatch({ width: n })} />
              <I.X size={11} className="text-text-muted dark:text-dark-text-muted" />
              <DimInput label="H" value={targetH} onChange={(n) => onPatch({ height: n })} />
            </div>
          </PropRow>

          <div className="flex items-center justify-between rounded-lg bg-page-bg p-2.5 text-[11.5px] dark:bg-dark-page-bg">
            <span className="text-text-muted dark:text-dark-text-muted">Estimated size</span>
            <span className="t-mono font-semibold">{formatBytes(estimate)}</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-soft bg-page-bg dark:border-dark-border-soft dark:bg-dark-page-bg">
            <button
              type="button"
              onClick={() => setMetaOpen((o) => !o)}
              aria-expanded={metaOpen}
              className={`flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-2.5 py-2 font-[inherit] text-xs font-semibold text-text dark:text-dark-text ${
                metaOpen ? "border-b border-border-soft dark:border-dark-border-soft" : ""
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <I.Tag size={12} /> Metadata
                <span className="text-[10.5px] font-normal text-text-muted dark:text-dark-text-muted">
                  {metaFields.length > 0 ? `${metaFields.length} fields` : "none"}
                </span>
              </span>
              <I.ChevronDown
                size={14}
                stroke={2.25}
                className="text-text-muted dark:text-dark-text-muted"
                style={{
                  transform: metaOpen ? "rotate(180deg)" : "none",
                  transition: "transform 120ms ease",
                }}
              />
            </button>
            {metaOpen && (
              <div className="flex flex-col gap-2.5 px-2.5 pt-2.5 pb-3">
                {metaFields.length > 0 && (
                  <div className="t-mono rounded-md border border-border-soft bg-surface px-2.5 py-2 text-[11px] leading-7 dark:border-dark-border-soft dark:bg-dark-surface">
                    {metaFields.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-text-muted dark:text-dark-text-muted">{k}</span>
                        <span className="text-right text-text dark:text-dark-text">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  {META_TOGGLES.map((row) => (
                    <div key={row.key} className="flex items-center justify-between text-xs">
                      <span>{row.label}</span>
                      <ToggleSwitch
                        on={toolState.meta[row.key]}
                        onChange={(next) =>
                          patchTool("meta", { ...toolState.meta, [row.key]: next })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className={`flex shrink-0 gap-2 ${
            isMobile
              ? "border-t border-border-soft px-4.5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] dark:border-dark-border-soft"
              : "px-5.5 pb-5.5"
          }`}
        >
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex-2 justify-center"
            onClick={download}
            disabled={busy}
          >
            <I.Download size={13} /> {busy ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function formatBytes(n: number): string {
  if (n > 1024 * 1024) return `~ ${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n > 1024) return `~ ${Math.round(n / 1024)} KB`;
  return `~ ${n} B`;
}

function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="t-mono flex flex-1 items-center gap-1.5 rounded-md border border-border bg-page-bg px-2.5 py-1.5 dark:border-dark-border dark:bg-dark-page-bg">
      <span className="text-[10.5px] text-text-muted dark:text-dark-text-muted">{label}</span>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(Math.max(1, +e.target.value || 0))}
        className="w-full min-w-0 border-none bg-transparent font-[inherit] text-[12.5px] text-text outline-none dark:text-dark-text"
      />
    </div>
  );
}
