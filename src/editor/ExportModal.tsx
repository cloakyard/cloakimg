import { NumberField } from "./NumberField";
// ExportModal.tsx — Format · quality · size with a live preview and
// real-bytes estimated size. On Download we run the export pipeline,
// build an object URL, and click an anchor for the user.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearDraft } from "../landing/draft";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame } from "../components/ModalFrame";
import { PropRow, Segment, Spinner, SwitchField, SliderField } from "./atoms";
import { startBlobDownload } from "./download";
import { useEditor } from "./EditorContext";
import { PrivacyAuditCard } from "./PrivacyAuditCard";
import {
  estimateBytes,
  estimateBytesByEncode,
  type ExportSettings,
  exportDoc,
  formatSupportsQuality,
  renderCompositeCanvas,
  resolveExportDimensions,
  settingsToFormat,
} from "./exportPipeline";
import { exifToFields } from "./tools/exif";
import type { MetaToggles } from "./toolState";
import type { Layout } from "./types";
import { formatBytesRough } from "../utils/formatBytes";

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

const FORMATS = ["JPG", "PNG", "WebP", "AVIF", "HEIC"] as const;

export function ExportModal({ layout, settings, onPatch, onClose }: Props) {
  const { doc, layers, toolState, patchTool, getFabricCanvas, flushPendingApply } = useEditor();
  const isMobile = layout === "mobile";
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Inline error state — populated when exportDoc throws so the user
  // can read the failure right next to the Download button instead of
  // chasing a transient toast.
  const [exportError, setExportError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // Mobile renders the metadata section inline (always expanded) so
  // the strip toggles are unmissable; desktop keeps the accordion to
  // save vertical space. On mobile the accordion previously hid the
  // toggles below the scroll fold even when expanded, since the new
  // content rendered below the visible viewport.
  const [metaOpen, setMetaOpen] = useState(false);
  // Gate preview generation on a one-shot flush of any pending tool
  // apply (Adjust/Filter/Crop sliders that haven't been committed yet).
  // Running flush in a deferred effect — instead of synchronously in
  // openExport — lets the modal frame paint first, so tapping Export
  // on mobile feels instant even when the bake is slow.
  const [prepared, setPrepared] = useState(false);
  const metaFields = useMemo(() => exifToFields(doc?.exif ?? null), [doc?.exif]);
  const modalRef = useRef<HTMLDivElement>(null);
  // Esc handling lives in ModalFrame so it routes through the animated
  // close lifecycle — removing the duplicate here lets the sheet slide
  // down on Esc instead of vanishing instantly.

  // setTimeout(0) — not queueMicrotask — so the browser gets a chance
  // to paint the modal between mount and the (potentially heavy)
  // canvas bake. queueMicrotask would run before paint and defeat the
  // purpose. flushPendingApply is now async (chunked bake), so we
  // wait for it to complete before flipping `prepared`; otherwise
  // the export preview would snapshot pre-apply pixels.
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      void (async () => {
        await flushPendingApply();
        if (!cancelled) setPrepared(true);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [flushPendingApply]);

  // Preview the exact composite path used by export so persistent
  // Fabric layers are included and tool-only guides are omitted. Wait
  // on `prepared` so this sees the post-flush doc.working, not a stale
  // frame from before Crop / Resize / Perspective was committed.
  useEffect(() => {
    if (!doc || !prepared) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const off = renderCompositeCanvas(doc, layers, doc.width, doc.height, getFabricCanvas());
    off.toBlob((b) => {
      if (cancelled || !b) return;
      objectUrl = URL.createObjectURL(b);
      previewUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    }, "image/png");
    return () => {
      cancelled = true;
      if (objectUrl && previewUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        previewUrlRef.current = null;
      }
    };
  }, [doc, layers, prepared, getFabricCanvas]);

  const targetDimensions = useMemo(
    () =>
      doc ? resolveExportDimensions(doc.width, doc.height, settings) : { width: 0, height: 0 },
    [doc, settings],
  );
  const targetW = targetDimensions.width;
  const targetH = targetDimensions.height;

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

  const [copied, setCopied] = useState(false);
  const copyToClipboard = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    setExportError(null);
    try {
      // Encode at full canvas resolution as PNG. Clipboard interop is
      // tightest with PNG — Slack, Mail, Photos, Messages and basically
      // every other app accept it. Skipping the user's Format choice
      // here is intentional: clipboard isn't a download, it's a paste
      // target, and PNG is the lingua franca.
      const out = document.createElement("canvas");
      out.width = doc.width;
      out.height = doc.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");
      ctx.drawImage(doc.working, 0, 0);
      const fc = getFabricCanvas();
      if (fc) {
        for (const obj of fc.getObjects()) {
          if (!obj.visible) continue;
          obj.render(ctx);
        }
      }
      const blob = await new Promise<Blob | null>((r) => out.toBlob((b) => r(b), "image/png"));
      if (!blob) throw new Error("Browser refused to encode PNG");
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error("Clipboard image copy isn't supported in this browser");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setBusy(false);
    }
  }, [doc, getFabricCanvas]);

  const download = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    setExportError(null);
    try {
      const result = await exportDoc(doc, layers, settings, toolState.meta, getFabricCanvas());

      // Download and Share are distinct user intents. The primary
      // Download action must never invoke navigator.share: on Safari
      // and macOS that opens the system share sheet, exactly contrary
      // to the button label. A same-document download anchor gives the
      // browser a real file download on desktop and mobile browsers.
      startBlobDownload(result.blob, result.fileName);
      // Successful export → drop the auto-saved draft, otherwise the
      // landing page would offer to "resume" something the user has
      // already shipped. The browser's own download UI is the success
      // confirmation; we just close the modal.
      void clearDraft();
      onClose();
    } catch (err) {
      // Show the error inline in the modal so the user can read it,
      // adjust settings, and retry — instead of a transient toast
      // that vanishes before they finish reading on a slow network.
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }, [doc, getFabricCanvas, layers, onClose, settings, toolState.meta]);

  return (
    <ModalFrame onClose={onClose} labelledBy="export-title" modalRef={modalRef}>
      <div className="cloak-dialog__header">
        <h2 id="export-title" className="cloak-dialog__title">
          Save your image
        </h2>
        <ModalCloseButton onClose={onClose} label="Close export" />
      </div>
      <div className="cloak-dialog__body flex flex-col gap-4">
        <div className="img-export-preview">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Export preview"
              width={doc?.width ?? 1}
              height={doc?.height ?? 1}
              className="h-auto w-auto max-w-full object-contain"
              style={{ boxShadow: "var(--air-shadow-menu)" }}
            />
          ) : (
            <Spinner label="Preparing preview…" />
          )}
        </div>
        {/* Pre-export Privacy Audit — surfaces visible faces +
              GPS-in-EXIF before the user clicks Download. Sits ABOVE
              the format/quality controls so the safety check is the
              first thing they see. Hidden when there's no doc (the
              modal is briefly visible during prepare). */}
        {doc && (
          <PrivacyAuditCard
            stripGPS={toolState.meta.stripGPS}
            onPatchMeta={(next) => patchTool("meta", { ...toolState.meta, ...next })}
          />
        )}

        <PropRow label="Format">
          <Segment
            options={FORMATS}
            active={settings.format}
            onChange={(i) => onPatch({ format: i })}
          />
        </PropRow>
        {settings.format === 4 && (
          <p className="-mt-2 text-[0.8125rem] leading-[1.45] text-text-muted">
            HEIC is encoded locally as a HEIF/HEVC file. The first export may take a little longer
            while the private on-device codec loads.
          </p>
        )}

        <SliderField
          label="Quality"
          readOnlyValue={
            !formatSupportsQuality(settingsToFormat(settings))
              ? settingsToFormat(settings) === "png"
                ? "Lossless"
                : "Optimized"
              : undefined
          }
          value={settings.quality}
          accent
          defaultValue={0.92}
          onChange={
            formatSupportsQuality(settingsToFormat(settings))
              ? (v) => onPatch({ quality: v })
              : undefined
          }
        />
        <PropRow label="Size">
          <Segment
            options={["Original", "@2x", "@1x"]}
            active={settings.sizeBucket}
            onChange={(i) => onPatch({ sizeBucket: i, width: undefined, height: undefined })}
          />
        </PropRow>

        <PropRow label="Resize to" value="ratio locked">
          <div className="img-dimensions" title="Aspect ratio locked">
            <DimInput
              label="W"
              value={targetW}
              onChange={(n) => onPatch({ width: n, height: undefined })}
            />
            <I.Lock size={11} className="shrink-0 text-text-muted" aria-hidden="true" />
            <DimInput
              label="H"
              value={targetH}
              onChange={(n) => onPatch({ width: undefined, height: n })}
            />
          </div>
        </PropRow>

        <div className="flex items-center justify-between rounded-lg bg-page-bg p-2.5 text-[0.8125rem]">
          <span className="text-text-muted">Estimated size</span>
          <span className="tabular-nums font-medium">{formatBytesRough(estimate)}</span>
        </div>

        <MetadataSection
          isMobile={isMobile}
          metaFields={metaFields}
          metaOpen={metaOpen}
          setMetaOpen={setMetaOpen}
          toggles={META_TOGGLES}
          meta={toolState.meta}
          onPatch={(key, next) => patchTool("meta", { ...toolState.meta, [key]: next })}
        />

        {exportError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-danger bg-[var(--air-danger-soft)] px-3 py-2 text-[0.8125rem] text-danger"
          >
            <I.AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Export failed</div>
              <div className="wrap-break-word opacity-80">{exportError}</div>
            </div>
            <button
              type="button"
              onClick={() => setExportError(null)}
              aria-label="Dismiss error"
              className="btn btn-ghost btn-icon-sm shrink-0"
            >
              <I.X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="cloak-dialog__footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={copyToClipboard}
          disabled={busy}
          title="Copy edited image to clipboard as PNG"
        >
          {copied ? (
            <I.Check size={16} aria-hidden="true" />
          ) : (
            <I.Copy size={16} aria-hidden="true" />
          )}{" "}
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
          <I.Download size={16} aria-hidden="true" /> {busy ? "Exporting…" : "Download"}
        </button>
      </div>
    </ModalFrame>
  );
}

/** EXIF read-out + strip-toggle row. Mobile renders inline (always
 *  expanded) so the toggles can't be hidden below the scroll fold;
 *  desktop keeps the accordion to save vertical space. */
function MetadataSection({
  isMobile,
  metaFields,
  metaOpen,
  setMetaOpen,
  toggles,
  meta,
  onPatch,
}: {
  isMobile: boolean;
  metaFields: Array<[string, string]>;
  metaOpen: boolean;
  setMetaOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  toggles: { label: string; key: keyof MetaToggles }[];
  meta: MetaToggles;
  onPatch: (key: keyof MetaToggles, next: boolean) => void;
}) {
  const body = (
    <div className="flex flex-col gap-2.5">
      {metaFields.length > 0 && (
        <div className="tabular-nums rounded-md border border-border-soft bg-surface px-2.5 py-2 text-[0.8125rem] leading-7">
          {metaFields.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-text-muted">{k}</span>
              <span className="text-right text-text">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {toggles.map((row) => (
          <SwitchField
            key={row.key}
            label={row.label}
            on={meta[row.key]}
            onChange={(next) => onPatch(row.key, next)}
          />
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-2.5 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text">
          <I.Tag size={12} /> Metadata
          <span className="text-[0.8125rem] font-normal text-text-muted">
            {metaFields.length > 0 ? `${metaFields.length} fields` : "none"}
          </span>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-soft bg-page-bg">
      <button
        type="button"
        onClick={() => setMetaOpen((o) => !o)}
        aria-expanded={metaOpen}
        className={`flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-2.5 py-2 font-[inherit] text-xs font-medium text-text ${
          metaOpen ? "border-b border-border-soft" : ""
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <I.Tag size={12} /> Metadata
          <span className="text-[0.8125rem] font-normal text-text-muted">
            {metaFields.length > 0 ? `${metaFields.length} fields` : "none"}
          </span>
        </span>
        <I.ChevronDown
          size={14}
          stroke={2.25}
          className="text-text-muted"
          style={{
            transform: metaOpen ? "rotate(180deg)" : "none",
            transition: "transform var(--air-motion-press) var(--air-ease-out)",
          }}
        />
      </button>
      {metaOpen && <div className="px-2.5 pt-2.5 pb-3">{body}</div>}
    </div>
  );
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
    <label className="img-dimension">
      <span>{label}</span>
      <NumberField
        value={value}
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        unit="px"
        label={label === "W" ? "Width" : label === "H" ? "Height" : label}
        onCommit={onChange}
      />
    </label>
  );
}
