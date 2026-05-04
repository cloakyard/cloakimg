// StartModal.tsx — The single entry into the editor. Either upload an
// image (drag/drop, paste, or file picker) or pick a blank canvas
// preset. The result is a `StartChoice` the parent can hand to the
// editor.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DropZone } from "../DropZone";
import { ColorPicker } from "../editor/ColorPicker";
import { I } from "../icons";
import { ModalCloseButton, ModalFrame } from "../ModalFrame";
import { clearDraft, type DraftEntry, draftToFile, loadDraft } from "./draft";
import {
  clearRecents,
  deleteRecent,
  listRecents,
  type RecentEntry,
  recentToFile,
  subscribeRecents,
} from "./recents";

type Tab = "upload" | "blank";

export interface CanvasPreset {
  name: string;
  w: number;
  h: number;
  hint: string;
}

export const PRESETS: CanvasPreset[] = [
  { name: "Square", w: 1080, h: 1080, hint: "Instagram post" },
  { name: "Portrait", w: 1080, h: 1350, hint: "IG portrait" },
  { name: "Story", w: 1080, h: 1920, hint: "9:16 vertical" },
  { name: "Landscape", w: 1920, h: 1080, hint: "16:9 widescreen" },
  { name: "A4", w: 2480, h: 3508, hint: "300 dpi print" },
  { name: "Custom", w: 0, h: 0, hint: "Set your own" },
];

export type StartChoice =
  | { kind: "upload"; file: File }
  | { kind: "blank"; w: number; h: number; background: string | null };

interface Props {
  initialTab?: Tab;
  isPhone: boolean;
  onCancel: () => void;
  onConfirm: (choice: StartChoice) => void;
}

export function StartModal({ initialTab = "upload", isPhone, onCancel, onConfirm }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [presetIdx, setPresetIdx] = useState(0);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [bg, setBg] = useState("#ffffff");
  const [bgEnabled, setBgEnabled] = useState(true);

  const handleConfirm = useCallback(() => {
    if (tab === "upload") {
      if (!uploadFile) return;
      onConfirm({ kind: "upload", file: uploadFile });
      return;
    }
    const p = PRESETS[presetIdx];
    if (!p) return;
    const isCustom = !p.w;
    const w = isCustom ? customW : p.w;
    const h = isCustom ? customH : p.h;
    onConfirm({ kind: "blank", w, h, background: bgEnabled ? bg : null });
  }, [bg, bgEnabled, customH, customW, onConfirm, presetIdx, tab, uploadFile]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (uploadFile || tab === "blank")) handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleConfirm, onCancel, tab, uploadFile]);

  const canConfirm = tab === "upload" ? !!uploadFile : true;

  return (
    <ModalFrame onClose={onCancel} bottomSheet={isPhone}>
      <ModalHeader isPhone={isPhone} onCancel={onCancel} />
      <ModalTabs tab={tab} setTab={setTab} isPhone={isPhone} />

      <div className={`flex-1 overflow-y-auto ${isPhone ? "p-5" : "p-7"}`}>
        {tab === "upload" ? (
          <UploadTab isPhone={isPhone} file={uploadFile} onFile={setUploadFile} />
        ) : (
          <BlankTab
            isPhone={isPhone}
            presetIdx={presetIdx}
            setPresetIdx={setPresetIdx}
            customW={customW}
            customH={customH}
            setCustomW={setCustomW}
            setCustomH={setCustomH}
            bg={bg}
            setBg={setBg}
            bgEnabled={bgEnabled}
            setBgEnabled={setBgEnabled}
          />
        )}
      </div>

      <ModalFooter
        isPhone={isPhone}
        ctaLabel={tab === "upload" ? "Open in editor" : "Create canvas"}
        canConfirm={canConfirm}
        onCancel={onCancel}
        onConfirm={handleConfirm}
      />
    </ModalFrame>
  );
}

function ModalHeader({ isPhone, onCancel }: { isPhone: boolean; onCancel: () => void }) {
  return (
    <div className={`flex items-start ${isPhone ? "px-5 pt-4.5 pb-1" : "px-7 pt-6 pb-2"}`}>
      <div className="min-w-0 flex-1">
        <div className="t-eyebrow mb-1.5">Start a new project</div>
        <div className="t-headline">How would you like to begin?</div>
        {/* Privacy reassurance lives in the header now — it sets the
            tone before the user picks anything, instead of crowding
            the action footer with a stray label. */}
        <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted dark:text-dark-text-muted">
          <I.Lock size={11} stroke={2.25} className="text-coral-600 dark:text-coral-400" />
          Files never leave your browser
        </div>
      </div>
      <ModalCloseButton onClose={onCancel} className="-mr-1.5" />
    </div>
  );
}

function ModalTabs({
  tab,
  setTab,
  isPhone,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  isPhone: boolean;
}) {
  const items: { id: Tab; label: string; Icon: typeof I.Upload }[] = [
    { id: "upload", label: "Upload an image", Icon: I.Upload },
    { id: "blank", label: "Blank canvas", Icon: I.FileImage },
  ];
  return (
    <div
      className={`flex gap-1 border-b border-border-soft dark:border-dark-border-soft ${
        isPhone ? "px-5 pt-2" : "px-7 pt-3"
      }`}
    >
      {items.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-3.5 py-2.5 font-[inherit] text-[13px] font-semibold transition-colors ${
              active
                ? "border-b-2 border-coral-500 text-coral-700 dark:text-coral-400"
                : "border-b-2 border-transparent text-text-muted dark:text-dark-text-muted"
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

function ModalFooter({
  isPhone,
  ctaLabel,
  canConfirm,
  onCancel,
  onConfirm,
}: {
  isPhone: boolean;
  ctaLabel: string;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Footer is buttons-only now. The privacy reassurance moved into
  // the header so the action row can focus purely on what to do next.
  return (
    <div
      className={`flex shrink-0 items-center justify-end gap-2.5 border-t border-border-soft bg-page-bg dark:border-dark-border-soft dark:bg-dark-page-bg ${
        isPhone ? "px-5 py-3.5 pb-[max(env(safe-area-inset-bottom),14px)]" : "px-7 py-4"
      }`}
    >
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onConfirm}
        disabled={!canConfirm}
      >
        {ctaLabel}
        <I.ArrowRight size={14} />
      </button>
    </div>
  );
}

function UploadTab({
  isPhone,
  file,
  onFile,
}: {
  isPhone: boolean;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <div>
      <DropZone
        isPhone={isPhone}
        selectedFile={file}
        onFiles={(files) => {
          const f = files[0];
          if (f) onFile(f);
        }}
      />
      <DraftResumeRow onPick={onFile} />
      <RecentsRow onPick={onFile} />
    </div>
  );
}

function DraftResumeRow({ onPick }: { onPick: (f: File | null) => void }) {
  const [draft, setDraft] = useState<DraftEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((d) => {
      if (!cancelled) setDraft(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!draft) return null;

  const ageMins = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60_000));
  const ageLabel = ageMins < 60 ? `${ageMins} min ago` : `${Math.round(ageMins / 60)} h ago`;

  return (
    <div className="mt-5.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="t-eyebrow t-eyebrow-slate text-[10px]">Resume · saved locally</span>
        <button
          type="button"
          onClick={() => {
            void clearDraft();
            setDraft(null);
          }}
          className="cursor-pointer border-none bg-transparent font-[inherit] text-[10.5px] text-text-muted dark:text-dark-text-muted"
        >
          Discard
        </button>
      </div>
      <button
        type="button"
        onClick={() => onPick(draftToFile(draft))}
        title={`Resume editing ${draft.fileName}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-coral-200 bg-coral-50/60 p-2.5 text-left font-[inherit] dark:border-coral-900/50 dark:bg-coral-900/15"
      >
        {draft.thumbUrl ? (
          <img src={draft.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-page-bg dark:bg-dark-page-bg">
            <I.FileImage size={18} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-text dark:text-dark-text">
            {draft.fileName}
          </div>
          <div className="text-[11px] text-text-muted dark:text-dark-text-muted">
            {draft.width} × {draft.height} · {ageLabel}
          </div>
        </div>
        <I.ArrowRight size={14} className="shrink-0 text-coral-700 dark:text-coral-300" />
      </button>
    </div>
  );
}

function RecentsRow({ onPick }: { onPick: (f: File | null) => void }) {
  const [items, setItems] = useState<RecentEntry[]>([]);
  // Subscribe so the row refreshes when other windows / future-loaded
  // recents arrive (rememberRecent fires after the editor opens).
  useSyncExternalStore(
    subscribeRecents,
    () => items,
    () => items,
  );
  useEffect(() => {
    let cancelled = false;
    void listRecents().then((r) => {
      if (!cancelled) setItems(r);
    });
    const unsub = subscribeRecents(() => {
      void listRecents().then((r) => {
        if (!cancelled) setItems(r);
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="mt-5.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="t-eyebrow t-eyebrow-slate text-[10px]">Recent · stored locally</span>
        <button
          type="button"
          onClick={() => void clearRecents()}
          className="cursor-pointer border-none bg-transparent font-[inherit] text-[10.5px] text-text-muted dark:text-dark-text-muted"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.slice(0, 8).map((r) => (
          <div
            key={r.id}
            className="relative aspect-square overflow-hidden rounded-lg border border-border bg-page-bg dark:border-dark-border dark:bg-dark-page-bg"
          >
            <button
              type="button"
              onClick={() => onPick(recentToFile(r))}
              title={r.name}
              className="absolute inset-0 cursor-pointer border-none bg-transparent p-0"
            >
              {r.thumbUrl ? (
                <img src={r.thumbUrl} alt={r.name} className="h-full w-full object-cover" />
              ) : (
                <I.FileImage size={20} />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void deleteRecent(r.id);
              }}
              aria-label={`Remove ${r.name} from recents`}
              className="absolute top-1 right-1 flex h-4.5 w-4.5 cursor-pointer items-center justify-center rounded-full border-none bg-black/55 p-0 text-white"
            >
              <I.X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlankTab({
  isPhone,
  presetIdx,
  setPresetIdx,
  customW,
  customH,
  setCustomW,
  setCustomH,
  bg,
  setBg,
  bgEnabled,
  setBgEnabled,
}: {
  isPhone: boolean;
  presetIdx: number;
  setPresetIdx: (i: number) => void;
  customW: number;
  customH: number;
  setCustomW: (n: number) => void;
  setCustomH: (n: number) => void;
  bg: string;
  setBg: (c: string) => void;
  bgEnabled: boolean;
  setBgEnabled: (on: boolean) => void;
}) {
  return (
    <div>
      <div className={`grid gap-2.5 ${isPhone ? "grid-cols-2" : "grid-cols-3"}`}>
        {PRESETS.map((p, i) => {
          const isCustom = !p.w;
          const active = i === presetIdx;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => setPresetIdx(i)}
              aria-pressed={active}
              className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl p-3 text-left font-[inherit] transition-[border-color,background-color,box-shadow] duration-150 ${
                active
                  ? "border-2 border-coral-500 bg-coral-50 shadow-[0_0_0_3px_rgba(245,97,58,0.12)] dark:bg-coral-900/25"
                  : "border-2 border-transparent bg-surface ring-1 ring-border hover:border-coral-200 dark:bg-dark-surface dark:ring-dark-border"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-coral-500 text-white"
                >
                  <I.Check size={10} stroke={3} />
                </span>
              )}
              <div
                className={`flex h-16 items-center justify-center rounded-lg ${
                  isCustom
                    ? "border-[1.5px] border-dashed border-border bg-transparent dark:border-dark-border"
                    : "border border-border-soft bg-page-bg dark:border-dark-border-soft dark:bg-dark-page-bg"
                }`}
              >
                {isCustom ? (
                  <I.Plus size={22} className="text-text-muted dark:text-dark-text-muted" />
                ) : (
                  <div
                    className="rounded-xs border border-border bg-white dark:border-dark-border"
                    style={{
                      width: p.w >= p.h ? 52 : 52 * (p.w / p.h),
                      height: p.h >= p.w ? 36 : 36 * (p.h / p.w),
                      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                    }}
                  />
                )}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-text dark:text-dark-text">
                  {p.name}
                </div>
                <div className="t-mono mt-px text-[11px] text-text-muted dark:text-dark-text-muted">
                  {p.w ? `${p.w} × ${p.h}` : "Set your own"}
                </div>
                <div className="mt-px text-[10.5px] text-text-muted dark:text-dark-text-muted">
                  {p.hint}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* On phones the row stacks: CUSTOM heading on its own line,
          then W × H px on a single non-wrapping row (this is the bit
          that previously broke W and H onto separate rows), then
          Background controls below. Wider viewports collapse the
          three groups back into a single flex-wrap row with the
          background pushed to the right via sm:ml-auto. */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl bg-page-bg p-3.5 dark:bg-dark-page-bg sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
        <div className="t-eyebrow t-eyebrow-slate text-[10px]">Custom</div>
        <div className="flex items-center gap-2 sm:gap-2.5">
          <DimensionInput label="W" value={customW} onChange={setCustomW} />
          <I.X size={11} className="shrink-0 text-text-muted dark:text-dark-text-muted" />
          <DimensionInput label="H" value={customH} onChange={setCustomH} />
          <div className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-muted">
            px
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted dark:text-dark-text-muted">
            <input
              type="checkbox"
              checked={bgEnabled}
              onChange={(e) => setBgEnabled(e.target.checked)}
              aria-label="Fill canvas with a background color"
              className="h-3.5 w-3.5 cursor-pointer accent-coral-500"
            />
            <span>Background</span>
          </label>
          {bgEnabled ? (
            <div className="w-32">
              <ColorPicker value={bg} onChange={setBg} enableEyedropper={false} />
            </div>
          ) : (
            <span className="t-mono rounded-lg border border-dashed border-border bg-page-bg px-2.5 py-1.5 text-[11px] text-text-muted dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text-muted">
              Transparent
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="t-mono flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] dark:border-dark-border dark:bg-dark-surface">
      <span className="text-[11px] text-text-muted dark:text-dark-text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(20000, +e.target.value || 0)))}
        className="w-17.5 border-none bg-transparent font-[inherit] text-[13px] text-text outline-none dark:text-dark-text"
      />
    </div>
  );
}
