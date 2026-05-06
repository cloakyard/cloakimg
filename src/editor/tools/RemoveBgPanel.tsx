// RemoveBgPanel.tsx — Two background-removal modes:
//
//   • Auto (default) — runs a U²-Net (IS-Net) segmentation model in a
//     web worker. One click handles complex scenes (people, animals,
//     products) that the chroma keyer can't touch. The model + ONNX
//     runtime are downloaded once on first use and cached by the
//     service worker so subsequent removes are offline + instant.
//
//   • Chroma — the original perimeter-sampling chroma keyer. Faster
//     than Auto on flat studio backdrops since it skips the model
//     load entirely; kept as a fallback for that case.
//
// Both modes paint inline progress / errors next to the Apply button
// rather than relying on the global busy spinner — the Auto mode's
// download phase can take 10–30 s on a slow connection and a
// percentage bar feels much more honest than a frozen spinner.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../../components/icons";
import { PropRow, Segment, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { computeAutoParams, looksAlreadyRemoved, removeBackground } from "./removeBg";
import { type BgQuality, smartRemoveBackground, type SmartRemoveProgress } from "./smartRemoveBg";

const MODES = ["Auto", "Chroma"] as const;
const QUALITY_LABELS = ["Fast", "Better", "Best"] as const;
const QUALITY_KEYS: BgQuality[] = ["small", "medium", "large"];
const QUALITY_HINTS = [
  "~44 MB · best for portraits and most photos",
  "~88 MB · sharper edges, slower on first run",
  "~176 MB · highest fidelity, heavy download",
] as const;

export function RemoveBgPanel() {
  const { toolState, patchTool, doc, commit, runBusy } = useEditor();
  // Inline error state replaces the older toast — the canvas itself
  // is the success confirmation, and a failure stays pinned next to
  // the Apply button so the user can read it and retry.
  const [bgError, setBgError] = useState<string | null>(null);
  // Auto-mode progress (download + inference). Held in local state so
  // it can drive a progress bar without bouncing through global tool
  // state, which would re-render every consumer of `useEditor`.
  const [progress, setProgress] = useState<SmartRemoveProgress | null>(null);
  // True while the Auto pipeline is running. We surface it inline on
  // the Apply button instead of via runBusy so the panel stays
  // interactive (user can still cancel by switching tools).
  const [autoBusy, setAutoBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isAuto = toolState.bgMode === 0;

  // Re-derive on every render so it tracks undo / redo. Cheap — touches
  // four 1px-thick strips of the perimeter.
  const alreadyRemoved = useMemo(
    () => (doc ? looksAlreadyRemoved(doc.working) : false),
    // doc.working is mutated in place, so trigger on doc identity.
    [doc],
  );

  // On first entry per doc, reset chroma threshold + feather to 0 so
  // the preview shows the original image untouched. Auto mode doesn't
  // share these sliders.
  const seededFor = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (seededFor.current === doc.working) return;
    seededFor.current = doc.working;
    if (alreadyRemoved) return;
    patchTool("genericStrength", 0);
    patchTool("feather", 0);
  }, [doc, alreadyRemoved, patchTool]);

  // Cancel any in-flight auto removal when the panel unmounts (tool
  // switch, doc replace) so a slow inference doesn't write back to a
  // canvas the user has already moved past.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const autoTune = useCallback(() => {
    if (!doc) return;
    const auto = computeAutoParams(doc.working);
    patchTool("genericStrength", auto.threshold);
    patchTool("feather", auto.feather);
  }, [doc, patchTool]);

  const applyChroma = useCallback(() => {
    if (!doc || alreadyRemoved) return;
    setBgError(null);
    void runBusy("Removing background…", () => {
      try {
        const out = removeBackground(doc.working, {
          threshold: toolState.genericStrength,
          feather: toolState.feather,
          sample: parseHexSample(toolState.bgSample),
        });
        copyInto(doc.working, out);
        releaseCanvas(out);
        patchTool("bgSample", null);
        patchTool("bgPickActive", false);
        commit("Remove BG");
      } catch (err) {
        setBgError(err instanceof Error ? err.message : "Couldn't remove background");
      }
    });
  }, [
    alreadyRemoved,
    commit,
    doc,
    patchTool,
    runBusy,
    toolState.bgSample,
    toolState.feather,
    toolState.genericStrength,
  ]);

  const applyAuto = useCallback(async () => {
    if (!doc || alreadyRemoved) return;
    setBgError(null);
    setProgress({ phase: "download", ratio: 0, label: "Preparing…" });
    setAutoBusy(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const out = await smartRemoveBackground(doc.working, {
        quality: QUALITY_KEYS[toolState.bgQuality] ?? "small",
        signal: ac.signal,
        onProgress: (p) => setProgress(p),
      });
      if (ac.signal.aborted) {
        releaseCanvas(out);
        return;
      }
      copyInto(doc.working, out);
      releaseCanvas(out);
      patchTool("bgSample", null);
      patchTool("bgPickActive", false);
      commit("Remove BG");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setBgError(err instanceof Error ? err.message : "Couldn't remove background");
    } finally {
      setAutoBusy(false);
      setProgress(null);
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, [alreadyRemoved, commit, doc, patchTool, toolState.bgQuality]);

  const togglePick = useCallback(() => {
    patchTool("bgPickActive", !toolState.bgPickActive);
  }, [patchTool, toolState.bgPickActive]);

  const clearSample = useCallback(() => {
    patchTool("bgSample", null);
  }, [patchTool]);

  // Same signal the live preview uses: the user has only "engaged" the
  // chroma keyer once they've run auto-detect, moved a slider, or
  // picked a sample colour. Until then, both the preview and the Apply
  // button stay inert so the canvas keeps showing the original image.
  const chromaEngaged =
    toolState.genericStrength > 0 || toolState.feather > 0 || toolState.bgSample !== null;
  const chromaApplyDisabled = alreadyRemoved || !chromaEngaged;

  return (
    <>
      <PropRow label="Mode">
        <Segment
          options={MODES}
          active={toolState.bgMode}
          onChange={(i) => {
            patchTool("bgMode", i);
            setBgError(null);
          }}
        />
      </PropRow>

      {isAuto ? (
        <AutoPanel
          quality={toolState.bgQuality}
          onQuality={(q) => patchTool("bgQuality", q)}
          alreadyRemoved={alreadyRemoved}
          busy={autoBusy}
          progress={progress}
          onApply={() => void applyAuto()}
        />
      ) : (
        <ChromaPanel
          feather={toolState.feather}
          threshold={toolState.genericStrength}
          bgSample={toolState.bgSample}
          bgPickActive={toolState.bgPickActive}
          alreadyRemoved={alreadyRemoved}
          applyDisabled={chromaApplyDisabled}
          onPatchFeather={(v) => patchTool("feather", v)}
          onPatchThreshold={(v) => patchTool("genericStrength", v)}
          onTogglePick={togglePick}
          onClearSample={clearSample}
          onAutoTune={autoTune}
          onApply={applyChroma}
        />
      )}

      {bgError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
        >
          <I.ShieldCheck size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 wrap-break-word">{bgError}</span>
          <button
            type="button"
            onClick={() => setBgError(null)}
            aria-label="Dismiss error"
            className="-mr-0.5 -mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-60 hover:opacity-100"
          >
            <I.X size={10} />
          </button>
        </div>
      )}
    </>
  );
}

// ── Auto mode ──────────────────────────────────────────────────────

interface AutoProps {
  quality: number;
  onQuality: (q: number) => void;
  alreadyRemoved: boolean;
  busy: boolean;
  progress: SmartRemoveProgress | null;
  onApply: () => void;
}

function AutoPanel({ quality, onQuality, alreadyRemoved, busy, progress, onApply }: AutoProps) {
  const isDownload = progress?.phase === "download";
  const isInference = progress?.phase === "inference" || progress?.phase === "decode";
  const downloadPct = isDownload ? Math.round((progress?.ratio ?? 0) * 100) : null;
  return (
    <>
      <PropRow label="Quality">
        <Segment options={QUALITY_LABELS} active={quality} onChange={onQuality} />
      </PropRow>

      {!alreadyRemoved && !busy && <CapabilityHints />}

      <button
        type="button"
        className="btn btn-primary justify-center"
        onClick={onApply}
        disabled={alreadyRemoved || busy}
        style={{
          fontSize: 12.5,
          padding: "9px",
          opacity: alreadyRemoved || busy ? 0.6 : 1,
        }}
      >
        {alreadyRemoved ? (
          <>
            <I.Check size={13} /> Background removed
          </>
        ) : busy ? (
          <>
            <InlineSpinner /> {progress?.label ?? "Removing…"}
          </>
        ) : (
          <>
            <I.Wand size={13} /> Remove background
          </>
        )}
      </button>

      {busy && progress && (
        <ProgressCard progress={progress} downloadPct={downloadPct} isInference={isInference} />
      )}

      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {alreadyRemoved
          ? "The background is already cleared. Undo to bring it back, or place a new image to start over."
          : `${QUALITY_HINTS[quality] ?? ""} The model downloads once and then runs offline.`}
      </div>
    </>
  );
}

// ── Progress card ──────────────────────────────────────────────────
// Visible during the Auto run. Two modes:
//   • Download — determinate bar, real-byte readout (e.g. "23 / 44 MB"),
//     percentage on the right. This is the dominant phase on first
//     run, so we make it as honest as possible.
//   • Inference — indeterminate sliding-stripe animation. The lib
//     doesn't surface inference progress, so we show motion instead
//     of a fake percentage; the byte readout is hidden.

interface ProgressCardProps {
  progress: SmartRemoveProgress;
  downloadPct: number | null;
  isInference: boolean;
}

function ProgressCard({ progress, downloadPct, isInference }: ProgressCardProps) {
  const widthPct = isInference ? 100 : Math.max(2, Math.round((progress.ratio ?? 0) * 100));
  const bytes = progress.bytesDownloaded ?? 0;
  const total = progress.bytesTotal ?? 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-page-bg px-3 py-2.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-text dark:text-dark-text">
        <span>{progress.label}</span>
        {downloadPct !== null && (
          <span className="t-mono text-coral-700 dark:text-coral-300">{downloadPct}%</span>
        )}
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface dark:bg-dark-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isInference ? undefined : (downloadPct ?? 0)}
        aria-label={progress.label}
      >
        <div
          className={`h-full rounded-full bg-coral-500 ${
            isInference ? "" : "transition-[width] duration-200"
          }`}
          style={{
            width: `${widthPct}%`,
            // Inference is indeterminate — fill the whole track and
            // slide a brighter highlight across it so the user sees
            // motion. Download phase gets a real width-driven bar
            // (the % readout is the truth).
            ...(isInference
              ? {
                  backgroundImage:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                  backgroundSize: "40% 100%",
                  backgroundRepeat: "no-repeat",
                  animation: "ci-bg-shimmer 1.4s linear infinite",
                }
              : {}),
          }}
        />
      </div>
      {total > 0 && !isInference && (
        <div className="flex items-center justify-between text-[10.5px] text-text-muted dark:text-dark-text-muted">
          <span className="t-mono">
            {formatMb(bytes)} / {formatMb(total)}
          </span>
          <span>One-time · cached after</span>
        </div>
      )}
      {isInference && (
        <div className="text-[10.5px] text-text-muted dark:text-dark-text-muted">
          Running on this device. The image never leaves your browser.
        </div>
      )}
    </div>
  );
}

function InlineSpinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      style={{ animation: "ci-spin 0.9s linear infinite" }}
      role="img"
      aria-label="Working"
    >
      <title>Working</title>
      <circle
        cx="6.5"
        cy="6.5"
        r="5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M 6.5 1.5 A 5 5 0 0 1 11.5 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

// ── Capability hints ───────────────────────────────────────────────
// Two-column "Works well / Less reliable" so users have realistic
// expectations before they hit Remove. Visible by default in Auto
// mode (not behind a toggle) — these are the most-asked questions
// and tucking them away leads to the same confusion every time.

function CapabilityHints() {
  return (
    <div className="rounded-lg border border-border-soft bg-page-bg px-2.5 py-2 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
        <I.Info size={11} /> What it detects
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] leading-snug">
        <div className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
          <I.Check size={11} stroke={2.5} /> Works well
        </div>
        <div className="flex items-center gap-1 font-semibold text-coral-700 dark:text-coral-300">
          <I.X size={11} stroke={2.5} /> Less reliable
        </div>
        <ul className="list-none space-y-0.5 text-text-muted dark:text-dark-text-muted">
          <li>People, portraits</li>
          <li>Cats, dogs, animals</li>
          <li>Products, food</li>
          <li>Single clear subject</li>
        </ul>
        <ul className="list-none space-y-0.5 text-text-muted dark:text-dark-text-muted">
          <li>Glass, smoke, water</li>
          <li>Multiple subjects</li>
          <li>Tiny / distant subjects</li>
          <li>Wispy hair detail</li>
        </ul>
      </div>
    </div>
  );
}

// ── Chroma mode ────────────────────────────────────────────────────

interface ChromaProps {
  feather: number;
  threshold: number;
  bgSample: string | null;
  bgPickActive: boolean;
  alreadyRemoved: boolean;
  applyDisabled: boolean;
  onPatchFeather: (v: number) => void;
  onPatchThreshold: (v: number) => void;
  onTogglePick: () => void;
  onClearSample: () => void;
  onAutoTune: () => void;
  onApply: () => void;
}

function ChromaPanel({
  feather,
  threshold,
  bgSample,
  bgPickActive,
  alreadyRemoved,
  applyDisabled,
  onPatchFeather,
  onPatchThreshold,
  onTogglePick,
  onClearSample,
  onAutoTune,
  onApply,
}: ChromaProps) {
  return (
    <>
      <PropRow label="Edge feather" value={`${Math.round(feather * 30)} px`}>
        <Slider value={feather} accent defaultValue={0.2} onChange={onPatchFeather} />
      </PropRow>
      <PropRow label="Threshold" value={`${Math.round(threshold * 100)}%`}>
        <Slider value={threshold} defaultValue={0.5} onChange={onPatchThreshold} />
      </PropRow>
      <PropRow label="Sample">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePick}
            disabled={alreadyRemoved}
            aria-pressed={bgPickActive}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-none px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold ${
              bgPickActive
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-page-bg text-text-muted dark:bg-dark-page-bg dark:text-dark-text-muted"
            }`}
            style={{ opacity: alreadyRemoved ? 0.5 : 1 }}
          >
            <I.Pipette size={12} />
            {bgPickActive ? "Click image…" : "Pick"}
          </button>
          {bgSample && (
            <>
              <span
                className="h-6 w-6 shrink-0 rounded-md border border-border dark:border-dark-border"
                style={{ background: bgSample }}
                title={bgSample}
              />
              <button
                type="button"
                onClick={onClearSample}
                aria-label="Clear sample"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-text-muted dark:text-dark-text-muted"
              >
                <I.X size={11} />
              </button>
            </>
          )}
        </div>
      </PropRow>
      <button
        type="button"
        className="btn btn-secondary justify-center"
        onClick={onAutoTune}
        disabled={alreadyRemoved}
        style={{ fontSize: 11.5, padding: "7px", opacity: alreadyRemoved ? 0.5 : 1 }}
      >
        <I.Wand size={12} /> Auto-detect
      </button>
      <button
        type="button"
        className="btn btn-primary justify-center"
        onClick={onApply}
        disabled={applyDisabled}
        style={{ fontSize: 12.5, padding: "9px", opacity: applyDisabled ? 0.5 : 1 }}
      >
        {alreadyRemoved ? (
          <>
            <I.Check size={13} /> Background removed
          </>
        ) : (
          <>
            <I.Layers size={13} /> Remove background
          </>
        )}
      </button>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {alreadyRemoved
          ? "The background is already cleared. Undo to bring it back, or place a new image to start over."
          : "Auto-detect tunes threshold + feather from the perimeter. Use Pick to click a specific colour on the image — useful when the subject and background share a similar tone."}
      </div>
    </>
  );
}

function parseHexSample(hex: string | null): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
