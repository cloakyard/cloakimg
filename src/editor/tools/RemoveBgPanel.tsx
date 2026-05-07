// RemoveBgPanel.tsx — Two background-removal modes:
//
//   • Auto (default) — runs a U²-Net (IS-Net) segmentation model in a
//     web worker. One click handles complex scenes (people, animals,
//     products) that the chroma keyer can't touch. The model + ONNX
//     runtime are downloaded once on first use and cached by the
//     service worker so subsequent removes are offline + instant.
//     Detection runs through the central subject-mask service so a
//     mask cached by another tool (Adjust scoped to Subject, etc.)
//     makes Apply effectively free.
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
import { InlineSpinner, PropRow, Segment, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { cancelMaskDetection, MaskConsentError } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { DetectionProgressCard } from "./DetectionStatus";
import { computeAutoParams, looksAlreadyRemoved, removeBackground } from "./removeBg";
import type { SmartRemoveProgress } from "./ai/segment";

const MODES = ["Auto", "Chroma"] as const;
const QUALITY_LABELS = ["Fast", "Better", "Best"] as const;
// Short hint shown under the Apply button when the model is *not*
// already cached. Once the bytes are local the panel switches to a
// dedicated "ready, instant" line so we don't double up the size
// reminder (the previous build accidentally concatenated the two and
// produced "…heavy downloadModel already loaded — detection is
// instant.").
const QUALITY_HINTS = [
  "~44 MB · best for portraits and most photos",
  "~88 MB · sharper edges, slower on first run",
  "~176 MB · highest fidelity, heavy download",
] as const;

export function RemoveBgPanel() {
  const { toolState, patchTool, doc, commit, runBusy } = useEditor();
  const subjectMask = useSubjectMask();
  // Inline error state replaces the older toast — the canvas itself
  // is the success confirmation, and a failure stays pinned next to
  // the Apply button so the user can read it and retry.
  const [bgError, setBgError] = useState<string | null>(null);

  // Auto-mode busy / progress now route through the central
  // subject-mask service: state.status === "loading" means a detection
  // is running (started by this panel or any other scoped tool), and
  // state.progress carries the lib's download / inference reports. We
  // still need a *local* "applying" flag to know when we should react
  // to a fresh "ready" by writing the cut into doc.working — without
  // it, opening this panel after another tool already cached the mask
  // would auto-apply on mount.
  const [applying, setApplying] = useState(false);

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

  // We no longer hold an AbortController here — the central
  // subject-mask service owns the inference promise so other tools
  // can opportunistically reuse it. Switching away while a detection
  // is in flight just leaves the service to finish; the result lands
  // in the cache for whichever tool the user opens next.

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
    setApplying(true);
    try {
      // Routes through the shared mask service — if another tool
      // already detected the subject for this image, this returns the
      // cached cut instantly and we skip straight to compositing.
      // requestExplicit clears the dismiss latch so a prior "Not now"
      // doesn't make the Apply button silently no-op.
      const cut = await subjectMask.requestExplicit();
      // Defensive: if the source dimensions changed mid-flight (Crop
      // ran after we kicked off detection), the cut won't match
      // doc.working. Bail rather than commit a misaligned image.
      if (cut.width !== doc.working.width || cut.height !== doc.working.height) {
        setBgError("The image changed during detection — try Remove again.");
        return;
      }
      copyInto(doc.working, cut);
      // The mask is now identical to the working canvas alpha-keyed,
      // so further scoped tools won't benefit from re-detecting.
      // Drop the cache to free its memory.
      subjectMask.invalidate();
      patchTool("bgSample", null);
      patchTool("bgPickActive", false);
      commit("Remove BG");
    } catch (err) {
      // Consent flow surfaces via the host dialog, not as an error
      // chip. Swallow MaskConsentError silently — the user already
      // sees the modal asking permission.
      if (err instanceof MaskConsentError) return;
      setBgError(err instanceof Error ? err.message : "Couldn't remove background");
    } finally {
      setApplying(false);
    }
  }, [alreadyRemoved, commit, doc, patchTool, subjectMask]);

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
          // The "busy" flag spans both the central detection (driven
          // by another scoped tool or this very Apply click) AND this
          // panel's own commit step. Subscribing to subjectMask.state
          // means the Apply button stays in the busy state if the
          // user hopped over to Adjust → Subject scope which kicked
          // off detection, then jumped back here.
          busy={applying || subjectMask.state.status === "loading"}
          progress={subjectMask.state.progress}
          warm={subjectMask.state.warm}
          modelCached={subjectMask.state.modelCached}
          // Only offer Cancel while the *central* detection is
          // running. The applying-to-canvas window after detection
          // resolves isn't cancellable in any honest sense — the
          // mask is already in memory, the commit is synchronous-ish.
          onCancel={
            subjectMask.state.status === "loading" ? () => cancelMaskDetection() : undefined
          }
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
  /** Has detection ever completed in this session? Drives the
   *  "first-time download (cold)" vs "already downloaded (warm)" copy
   *  in the progress card. */
  warm: boolean;
  /** Are the bytes for the chosen quality already in CacheStorage from
   *  a prior session? Distinct from `warm` — `modelCached` survives
   *  page reloads, `warm` only survives within this tab. */
  modelCached: boolean;
  /** Honest cancel. When defined, the inline progress card renders a
   *  Cancel link that terminates the AI worker and returns the panel
   *  to idle. Undefined while the panel is just compositing the cut
   *  into doc.working — that step isn't cancellable. */
  onCancel?: () => void;
  onApply: () => void;
}

function AutoPanel({
  quality,
  onQuality,
  alreadyRemoved,
  busy,
  progress,
  warm,
  modelCached,
  onCancel,
  onApply,
}: AutoProps) {
  // Three distinct surfaces, no concatenation:
  //   1. ready (warm or cached) — emphasise "instant" so the user
  //      knows there's no wait this time.
  //   2. busy — DetectionProgressCard owns the surface.
  //   3. cold — a single sentence stating the size + privacy promise.
  // Concatenating the two cases produced the "heavy downloadModel
  // already loaded" run-on; this split avoids that class of bug
  // entirely.
  const readyForInstant = warm || modelCached;
  return (
    <>
      <div className="flex items-center gap-1.5 text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
        <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
        On-device AI
      </div>
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
            <InlineSpinner /> {progress?.label ?? "Working…"}
          </>
        ) : (
          <>
            <I.Wand size={13} /> Remove background
          </>
        )}
      </button>

      {busy && (
        <DetectionProgressCard
          progress={progress}
          warm={warm}
          fallbackLabel="Detecting subject…"
          onCancel={onCancel}
        />
      )}

      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {alreadyRemoved
          ? "The background is already cleared. Undo to bring it back, or place a new image to start over."
          : readyForInstant
            ? `Model is loaded on this device — detection is instant. (${QUALITY_HINTS[quality] ?? ""})`
            : `${QUALITY_HINTS[quality] ?? ""}. Downloads once on apply, then runs offline.`}
      </div>
    </>
  );
}

// ── Capability hints ───────────────────────────────────────────────
// Two-column "Works well / Less reliable" so users have realistic
// expectations before they hit Remove. Visible by default in Auto
// mode (not behind a toggle) — these are the most-asked questions
// and tucking them away leads to the same confusion every time.

function CapabilityHints() {
  return (
    <div className="rounded-lg border border-border-soft bg-page-bg px-3 py-2.5 dark:border-dark-border-soft dark:bg-dark-page-bg">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
        <I.Info size={12} /> What it detects
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] leading-snug">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
          <I.Check size={13} stroke={2.5} /> Works well
        </div>
        <div className="flex items-center gap-1.5 font-semibold text-coral-700 dark:text-coral-300">
          <I.X size={13} stroke={2.5} /> Less reliable
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
