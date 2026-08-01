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
import { ColorPicker } from "../ColorPicker";
import { InlineSpinner, PropRow, Segment, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { cancelMaskDetection, MaskConsentError, requestModelPicker } from "../ai/subjectMask";
import { MaskReadyPill } from "../ai/ui/MaskReadyPill";
import { SmartActionError } from "../ai/ui/SmartActionError";
import { useSubjectMask } from "../ai/useSubjectMask";
import { DetectionProgressCard } from "../ai/ui/DetectionStatus";
import { applyAlphaThreshold } from "./aiInspector";
import {
  backgroundFillForMode,
  backgroundFillLabel,
  backgroundPalette,
  compositeCutout,
  type BackgroundFill,
} from "./backgroundFill";
import { computeAutoParams, looksAlreadyRemoved, removeBackground } from "./removeBg";
import { type BgQuality, getTierById } from "../ai/runtime/bgModels";
import type { SmartRemoveProgress } from "../ai/runtime/segment";

const MODES = ["Auto", "Chroma"] as const;

export function RemoveBgPanel() {
  const { toolState, patchTool, doc, commit, runBusy, layout } = useEditor();
  const isMobile = layout === "mobile";
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
  const backgroundFill = backgroundFillForMode(toolState.bgFillMode);
  const appliedTreatment =
    doc?.backgroundTreatment === "solid" ||
    doc?.backgroundTreatment === "gradient" ||
    doc?.backgroundTreatment === "vignette"
      ? doc.backgroundTreatment
      : null;

  // Re-derive on every render so it tracks undo / redo. Cheap — touches
  // four 1px-thick strips of the perimeter.
  const alreadyRemoved = useMemo(
    () =>
      doc
        ? doc.backgroundTreatment === "transparent" ||
          (doc.backgroundTreatment === "original" && looksAlreadyRemoved(doc.working))
        : false,
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
    if (!doc || appliedTreatment || (alreadyRemoved && backgroundFill === "transparent")) {
      return;
    }
    setBgError(null);
    const busyLabel = alreadyRemoved
      ? "Adding background…"
      : backgroundFill === "transparent"
        ? "Removing background…"
        : "Replacing background…";
    void runBusy(busyLabel, () => {
      let cutout: HTMLCanvasElement | null = null;
      let composed: HTMLCanvasElement | null = null;
      try {
        if (!alreadyRemoved) {
          cutout = removeBackground(doc.working, {
            threshold: toolState.genericStrength,
            feather: toolState.feather,
            sample: parseHexSample(toolState.bgSample),
          });
        }
        const transparentSource = cutout ?? doc.working;
        const output =
          backgroundFill === "transparent"
            ? transparentSource
            : (composed = compositeCutout(
                transparentSource,
                backgroundFill,
                toolState.bgFillColor,
              ));
        copyInto(doc.working, output);
        doc.backgroundTreatment = backgroundFill;
        patchTool("bgSample", null);
        patchTool("bgPickActive", false);
        commit(commitLabel(backgroundFill, alreadyRemoved));
      } catch (err) {
        setBgError(err instanceof Error ? err.message : "Couldn't remove background");
      } finally {
        if (composed) releaseCanvas(composed);
        if (cutout) releaseCanvas(cutout);
      }
    });
  }, [
    alreadyRemoved,
    appliedTreatment,
    backgroundFill,
    commit,
    doc,
    patchTool,
    runBusy,
    toolState.bgSample,
    toolState.bgFillColor,
    toolState.feather,
    toolState.genericStrength,
  ]);

  const applyAuto = useCallback(async () => {
    if (!doc || appliedTreatment || (alreadyRemoved && backgroundFill === "transparent")) {
      return;
    }
    setBgError(null);
    setApplying(true);
    try {
      // A transparent source needs no second segmentation pass. This is
      // the fast path for imported PNG cutouts and for Remove BG → pick
      // background as a two-step workflow.
      if (alreadyRemoved) {
        const composed = compositeCutout(doc.working, backgroundFill, toolState.bgFillColor);
        copyInto(doc.working, composed);
        releaseCanvas(composed);
        doc.backgroundTreatment = backgroundFill;
        commit(commitLabel(backgroundFill, true));
        return;
      }
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
      // Confidence threshold — map the user's 0..1 slider into the
      // alpha cutoff used at apply time. Below the cutoff, pixels
      // get fully transparent (treated as background); above, they
      // keep their model-reported alpha. The default 0.5 reproduces
      // the previous behaviour, so users who never touch the dial
      // see identical output to the pre-dial version.
      applyAlphaThreshold(cut, toolState.bgConfidence);
      let composed: HTMLCanvasElement | null = null;
      try {
        const output =
          backgroundFill === "transparent"
            ? cut
            : (composed = compositeCutout(cut, backgroundFill, toolState.bgFillColor));
        copyInto(doc.working, output);
      } finally {
        if (composed) releaseCanvas(composed);
      }
      doc.backgroundTreatment = backgroundFill;
      // The mask is now identical to the working canvas alpha-keyed,
      // so further scoped tools won't benefit from re-detecting.
      // Drop the cache to free its memory.
      subjectMask.invalidate();
      patchTool("bgSample", null);
      patchTool("bgPickActive", false);
      commit(commitLabel(backgroundFill, false));
    } catch (err) {
      // Consent flow surfaces via the host modal, not as an error
      // chip. Swallow MaskConsentError silently — the user already
      // sees the modal asking permission.
      if (err instanceof MaskConsentError) return;
      setBgError(err instanceof Error ? err.message : "Couldn't remove background");
    } finally {
      setApplying(false);
    }
  }, [
    alreadyRemoved,
    appliedTreatment,
    backgroundFill,
    commit,
    doc,
    patchTool,
    subjectMask,
    toolState.bgConfidence,
    toolState.bgFillColor,
  ]);

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
  const chromaApplyDisabled =
    !!appliedTreatment || (alreadyRemoved ? backgroundFill === "transparent" : !chromaEngaged);

  // Auto-bake registration exists for the mobile footer's global ✓.
  // Desktop/tablet already expose an explicit Apply button; registering
  // Auto there would make a no-op visit look dirty and unexpectedly
  // launch model consent when the user merely switches tools. Chroma
  // still registers on every layout after the user has engaged the
  // keyer because its preview needs to bake on tool switch.
  const applyActive = isAuto ? applyAuto : applyChroma;
  const applyDirty = appliedTreatment
    ? false
    : isAuto
      ? isMobile && (!alreadyRemoved || backgroundFill !== "transparent")
      : !chromaApplyDisabled;
  useApplyOnToolSwitch(applyActive, applyDirty);

  if (appliedTreatment) {
    return (
      <>
        <AppliedBackground treatment={appliedTreatment} />
        <SmartActionError message={bgError} onDismiss={() => setBgError(null)} />
      </>
    );
  }

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
          quality={subjectMask.quality}
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
          maskReady={!!subjectMask.peek()}
          // Confidence dial + AI Inspector toggle — both live in the
          // AutoPanel since they only make sense against the U²-Net
          // mask. Chroma mode has its own threshold knob (the
          // colour-distance slider) and no AI to inspect.
          bgConfidence={toolState.bgConfidence}
          onPatchConfidence={(v) => patchTool("bgConfidence", v)}
          aiInspector={toolState.aiInspector}
          onToggleInspector={() => patchTool("aiInspector", !toolState.aiInspector)}
          backgroundFillMode={toolState.bgFillMode}
          backgroundColor={toolState.bgFillColor}
          onChangeBackgroundFill={(value) => {
            patchTool("bgFillMode", value);
            setBgError(null);
          }}
          onChangeBackgroundColor={(value) => {
            patchTool("bgFillColor", value);
            setBgError(null);
          }}
          // Only offer Cancel while the *central* detection is
          // running. The applying-to-canvas window after detection
          // resolves isn't cancellable in any honest sense — the
          // mask is already in memory, the commit is synchronous-ish.
          onCancel={
            subjectMask.state.status === "loading" ? () => cancelMaskDetection() : undefined
          }
          onChangeModel={() => requestModelPicker(subjectMask.quality)}
          onApply={() => void applyAuto()}
          showApplyButton={!isMobile}
        />
      ) : (
        <ChromaPanel
          feather={toolState.feather}
          threshold={toolState.genericStrength}
          bgSample={toolState.bgSample}
          bgPickActive={toolState.bgPickActive}
          alreadyRemoved={alreadyRemoved}
          applyDisabled={chromaApplyDisabled}
          backgroundFillMode={toolState.bgFillMode}
          backgroundColor={toolState.bgFillColor}
          onChangeBackgroundFill={(value) => {
            patchTool("bgFillMode", value);
            setBgError(null);
          }}
          onChangeBackgroundColor={(value) => {
            patchTool("bgFillColor", value);
            setBgError(null);
          }}
          onPatchFeather={(v) => patchTool("feather", v)}
          onPatchThreshold={(v) => patchTool("genericStrength", v)}
          onTogglePick={togglePick}
          onClearSample={clearSample}
          onAutoTune={autoTune}
          onApply={applyChroma}
          showApplyButton={!isMobile}
        />
      )}

      <SmartActionError message={bgError} onDismiss={() => setBgError(null)} />
    </>
  );
}

// ── Auto mode ──────────────────────────────────────────────────────

interface AutoProps {
  /** Friendly key (small / medium / large), driven by the central
   *  subject-mask service so the row reflects whatever the user
   *  actually picked in the consent / switch modal — not whatever
   *  toolState happens to be. */
  quality: BgQuality;
  alreadyRemoved: boolean;
  busy: boolean;
  progress: SmartRemoveProgress | null;
  /** Confidence threshold for the U²-Net cut. 0 = aggressive (keep
   *  every pixel the model touched, even uncertain edges); 1 =
   *  conservative (only super-confident subject pixels). Applied at
   *  apply time, not preview — re-running mask thresholding live as
   *  the user drags would mean re-reading the cut bitmap on every
   *  tick. */
  bgConfidence: number;
  onPatchConfidence: (v: number) => void;
  /** AI Inspector toggle — paints the model's mask as a coral
   *  overlay so the user can see what would get cut before they
   *  commit. Pairs with the Confidence dial: change the dial, watch
   *  the overlay's coverage move. */
  aiInspector: boolean;
  onToggleInspector: () => void;
  backgroundFillMode: number;
  backgroundColor: string;
  onChangeBackgroundFill: (value: number) => void;
  onChangeBackgroundColor: (value: string) => void;
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
  /** Open the consent / model-picker modal so the user can switch
   *  tiers. Single source of truth for tier selection — the panel
   *  no longer carries its own three-way Segment. */
  onChangeModel: () => void;
  onApply: () => void;
  /** True when `subjectMask.peek()` returns a cut for the current
   *  source — the Apply will be effectively instant (no detection,
   *  no download). Surfaces as a small green pill above Apply. */
  maskReady: boolean;
  /** Mobile (V3.4+) hides the per-tool Apply button — the global ✓ in
   *  MobileEditorSurface's footer is the universal commit, and the
   *  parent registers `applyAuto` via useApplyOnToolSwitch so ✓ runs
   *  it. Desktop / tablet still surface the visible button. */
  showApplyButton: boolean;
}

function AutoPanel({
  quality,
  alreadyRemoved,
  busy,
  progress,
  warm,
  modelCached,
  bgConfidence,
  onPatchConfidence,
  aiInspector,
  onToggleInspector,
  backgroundFillMode,
  backgroundColor,
  onChangeBackgroundFill,
  onChangeBackgroundColor,
  onCancel,
  onChangeModel,
  onApply,
  maskReady,
  showApplyButton,
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
  const meta = getTierById(quality);
  return (
    <>
      <div className="flex items-center gap-1.5 text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase">
        <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" aria-hidden="true" />
        On-device AI
      </div>
      {/* Model readout. Single source of truth for the tier picker
          lives in MaskConsentModal — the "Change" link re-opens it
          so the user picks their tier in exactly one place. Disabled
          mid-detection because invalidating the in-flight cache to
          switch tiers would cancel the worker and confuse the user. */}
      <PropRow label="Model">
        <div className="flex flex-1 items-center justify-between gap-2 text-[12.5px] text-text">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold">{meta.label}</span>
            <span className="t-mono text-[11px] text-text-muted">~{meta.mb} MB</span>
            {modelCached && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200">
                <I.Check size={9} stroke={2.5} aria-hidden="true" /> Cached
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onChangeModel}
            disabled={busy}
            className="cursor-pointer rounded-md border-none bg-transparent p-0 text-[12px] font-semibold text-coral-600 outline-2 outline-transparent hover:text-coral-700 focus-visible:outline-coral-500 active:text-coral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-coral-300 dark:hover:text-coral-200 dark:active:text-coral-100"
          >
            Change
          </button>
        </div>
      </PropRow>

      {!alreadyRemoved && !busy && <CapabilityHints />}

      {/* Confidence dial — visible whenever Auto is the active mode,
          irrespective of whether a mask has been computed yet (the
          user can pre-set their preference before pressing Apply).
          Disabled while the model is mid-detection because changing
          it mid-flight would do nothing useful (the threshold is
          applied at compositing time, not during inference). */}
      <PropRow label="Confidence" value={`${Math.round(bgConfidence * 100)}%`}>
        <Slider value={bgConfidence} accent defaultValue={0.5} onChange={onPatchConfidence} />
      </PropRow>

      {/* AI Inspector toggle — a row button that flips the overlay
          on/off and surfaces a one-liner explanation when active so
          users know what they're looking at. Disabled when there's
          nothing to inspect yet (no cached mask, alreadyRemoved). */}
      <button
        type="button"
        onClick={onToggleInspector}
        disabled={busy || alreadyRemoved || !maskReady}
        role="switch"
        aria-checked={aiInspector}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-none px-3 py-2 text-left text-[12px] font-semibold outline-2 outline-transparent transition-colors focus-visible:outline-coral-500 active:bg-coral-50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:text-[13px] ${
          aiInspector
            ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
            : "bg-page-bg text-text-muted hover:bg-page-bg/70"
        }`}
        title={
          maskReady
            ? aiInspector
              ? "Hide the AI's view"
              : "Tint the photo to show what the AI sees as the subject"
            : "Run Apply once to compute the mask, then toggle the inspector to inspect it"
        }
      >
        <span className="flex items-center gap-1.5">
          <I.Sparkles size={12} aria-hidden="true" /> See what the AI sees
        </span>
        <span
          aria-hidden="true"
          className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            aiInspector ? "bg-coral-500" : "bg-text-muted/30"
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full bg-surface shadow-[var(--shadow-control)] transition-transform ${
              aiInspector ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
      </button>

      <BackgroundControls
        mode={backgroundFillMode}
        color={backgroundColor}
        onChangeMode={onChangeBackgroundFill}
        onChangeColor={onChangeBackgroundColor}
      />

      {/* "Mask ready" pill — when the cut is already cached for this
          image (some other smart-action ran first), Apply is instant.
          Surfacing this lets the user chain smart actions confidently. */}
      <MaskReadyPill ready={maskReady && !busy && !alreadyRemoved} align="end" />

      {showApplyButton && (
        <button
          type="button"
          className="btn btn-primary justify-center px-2! py-2.25! text-[12.5px]! pointer-coarse:py-3! pointer-coarse:text-[13.5px]!"
          onClick={onApply}
          disabled={(alreadyRemoved && backgroundFillMode === 0) || busy}
          style={{ opacity: (alreadyRemoved && backgroundFillMode === 0) || busy ? 0.6 : 1 }}
        >
          {alreadyRemoved && backgroundFillMode === 0 ? (
            <>
              <I.Check size={13} aria-hidden="true" /> Background removed
            </>
          ) : busy ? (
            <>
              <InlineSpinner /> {progress?.label ?? "Working…"}
            </>
          ) : (
            <>
              <I.Wand size={13} aria-hidden="true" />
              {alreadyRemoved
                ? "Add background"
                : backgroundFillMode > 0
                  ? "Remove + add background"
                  : maskReady
                    ? "Apply cutout"
                    : "Remove background"}
            </>
          )}
        </button>
      )}

      {busy && (
        <DetectionProgressCard
          progress={progress}
          warm={warm}
          fallbackLabel="Detecting subject…"
          onCancel={onCancel}
        />
      )}

      <div className="text-[11.5px] leading-relaxed text-text-muted">
        {alreadyRemoved
          ? backgroundFillMode > 0
            ? "Transparent cutout ready. Apply the selected background without running detection again."
            : "The background is already cleared. Choose a fill above to add one, or leave it transparent."
          : maskReady
            ? "Subject mask ready. Apply the cutout without running detection again."
            : readyForInstant
              ? `${meta.label} model is loaded on this device — detection is instant. Switch tiers anytime via Change.`
              : `Downloads ~${meta.mb} MB on first apply, then runs offline. Pick a different size via Change.`}
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
    <div className="rounded-lg border border-border-soft bg-page-bg px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.04em] text-text-muted uppercase">
        <I.Info size={12} aria-hidden="true" /> What it detects
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] leading-snug">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
          <I.Check size={13} stroke={2.5} aria-hidden="true" /> Works well
        </div>
        <div className="flex items-center gap-1.5 font-semibold text-coral-700 dark:text-coral-300">
          <I.X size={13} stroke={2.5} aria-hidden="true" /> Less reliable
        </div>
        <ul className="list-none space-y-0.5 text-text-muted">
          <li>People, portraits</li>
          <li>Cats, dogs, animals</li>
          <li>Products, food</li>
          <li>Single clear subject</li>
        </ul>
        <ul className="list-none space-y-0.5 text-text-muted">
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
  backgroundFillMode: number;
  backgroundColor: string;
  onChangeBackgroundFill: (value: number) => void;
  onChangeBackgroundColor: (value: string) => void;
  onPatchFeather: (v: number) => void;
  onPatchThreshold: (v: number) => void;
  onTogglePick: () => void;
  onClearSample: () => void;
  onAutoTune: () => void;
  onApply: () => void;
  /** Mobile (V3.4+) hides the per-tool Apply button — see AutoProps. */
  showApplyButton: boolean;
}

function ChromaPanel({
  feather,
  threshold,
  bgSample,
  bgPickActive,
  alreadyRemoved,
  applyDisabled,
  backgroundFillMode,
  backgroundColor,
  onChangeBackgroundFill,
  onChangeBackgroundColor,
  onPatchFeather,
  onPatchThreshold,
  onTogglePick,
  onClearSample,
  onAutoTune,
  onApply,
  showApplyButton,
}: ChromaProps) {
  return (
    <>
      <PropRow label="Edge feather" value={`${Math.round(feather * 30)} px`}>
        <Slider value={feather} accent defaultValue={0.2} onChange={onPatchFeather} />
      </PropRow>
      <PropRow label="Threshold" value={`${Math.round(threshold * 100)}%`}>
        <Slider value={threshold} accent defaultValue={0.5} onChange={onPatchThreshold} />
      </PropRow>
      <PropRow label="Sample">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePick}
            disabled={alreadyRemoved}
            aria-pressed={bgPickActive}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-none px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold outline-2 outline-transparent focus-visible:outline-coral-500 active:bg-page-bg disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:py-2.5 pointer-coarse:text-[12.5px] ${
              bgPickActive
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-page-bg text-text-muted"
            }`}
          >
            <I.Pipette size={12} aria-hidden="true" />
            {bgPickActive ? "Click image…" : "Pick"}
          </button>
          {bgSample && (
            <>
              <span
                role="img"
                aria-label={`Sampled background colour ${bgSample}`}
                className="h-6 w-6 shrink-0 rounded-md border border-border"
                style={{ background: bgSample }}
                title={bgSample}
              />
              <button
                type="button"
                onClick={onClearSample}
                aria-label="Clear sample"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-text-muted outline-2 outline-transparent hover:bg-page-bg focus-visible:outline-coral-500 active:bg-page-bg pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <I.X size={11} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </PropRow>
      <button
        type="button"
        className="btn btn-secondary justify-center px-2! py-1.75! text-[11.5px]! pointer-coarse:py-2.5! pointer-coarse:text-[12.5px]!"
        onClick={onAutoTune}
        disabled={alreadyRemoved}
        style={{ opacity: alreadyRemoved ? 0.5 : 1 }}
      >
        <I.Wand size={12} aria-hidden="true" /> Auto-detect
      </button>
      <BackgroundControls
        mode={backgroundFillMode}
        color={backgroundColor}
        onChangeMode={onChangeBackgroundFill}
        onChangeColor={onChangeBackgroundColor}
      />
      {showApplyButton && (
        <button
          type="button"
          className="btn btn-primary justify-center px-2! py-2.25! text-[12.5px]! pointer-coarse:py-3! pointer-coarse:text-[13.5px]!"
          onClick={onApply}
          disabled={applyDisabled}
          style={{ opacity: applyDisabled ? 0.5 : 1 }}
        >
          {alreadyRemoved && backgroundFillMode === 0 ? (
            <>
              <I.Check size={13} aria-hidden="true" /> Background removed
            </>
          ) : (
            <>
              <I.Layers size={13} aria-hidden="true" />
              {alreadyRemoved
                ? "Add background"
                : backgroundFillMode > 0
                  ? "Remove + add background"
                  : "Remove background"}
            </>
          )}
        </button>
      )}
      <div className="text-[11.5px] leading-relaxed text-text-muted">
        {alreadyRemoved
          ? backgroundFillMode > 0
            ? "Transparent cutout ready. Apply the selected background without keying the image again."
            : "The background is already cleared. Choose a fill above to add one, or leave it transparent."
          : "Auto-detect tunes threshold + feather from the perimeter. Use Pick to click a specific colour on the image — useful when the subject and background share a similar tone."}
      </div>
    </>
  );
}

// ── Output background ─────────────────────────────────────────────

const BACKGROUND_CHOICES: readonly { fill: BackgroundFill; label: string }[] = [
  { fill: "transparent", label: "None" },
  { fill: "solid", label: "Solid" },
  { fill: "gradient", label: "Gradient" },
  { fill: "vignette", label: "Vignette" },
];

interface BackgroundControlsProps {
  mode: number;
  color: string;
  onChangeMode: (value: number) => void;
  onChangeColor: (value: string) => void;
}

function BackgroundControls({ mode, color, onChangeMode, onChangeColor }: BackgroundControlsProps) {
  return (
    <div className="space-y-2.5 border-t border-border-soft pt-2.5">
      <PropRow label="Output background">
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Output background">
          {BACKGROUND_CHOICES.map((choice, index) => {
            const active = index === mode;
            return (
              <button
                key={choice.fill}
                type="button"
                aria-pressed={active}
                onClick={() => onChangeMode(index)}
                className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11.5px] font-semibold outline-2 outline-transparent transition-colors focus-visible:outline-coral-500 active:bg-page-bg pointer-coarse:min-h-11 pointer-coarse:text-[12.5px] ${
                  active
                    ? "border-coral-400 bg-coral-50 text-coral-800 dark:border-coral-500 dark:bg-coral-900/25 dark:text-coral-200"
                    : "border-border-soft bg-page-bg text-text-muted hover:border-border hover:bg-surface"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-6 w-6 shrink-0 rounded border border-border ${
                    choice.fill === "transparent" ? "checker" : ""
                  }`}
                  style={backgroundSwatch(choice.fill, color)}
                />
                <span className="truncate">{choice.label}</span>
              </button>
            );
          })}
        </div>
      </PropRow>

      {mode > 0 ? (
        <PropRow label="Base colour">
          <ColorPicker
            value={color}
            onChange={onChangeColor}
            label="Choose background colour"
            enableEyedropper={false}
          />
        </PropRow>
      ) : null}

      <div className="flex gap-1.5 rounded-md border border-border-soft bg-page-bg px-2.5 py-2 text-[10.75px] leading-relaxed text-text-muted">
        <I.Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Plain white or light grey is safest for official photos. Gradient and vignette are for
          non-official portrait prints.
        </span>
      </div>
    </div>
  );
}

function backgroundSwatch(fill: BackgroundFill, color: string) {
  if (fill === "transparent") return undefined;
  const palette = backgroundPalette(color, fill);
  if (fill === "solid") return { background: palette.first };
  if (fill === "gradient") {
    return { background: `linear-gradient(135deg, ${palette.first}, ${palette.second})` };
  }
  return {
    background: `radial-gradient(circle at 50% 42%, ${palette.first}, ${palette.second})`,
  };
}

function AppliedBackground({ treatment }: { treatment: "solid" | "gradient" | "vignette" }) {
  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-3 py-3 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-900/15 dark:text-emerald-200"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <I.Check size={14} stroke={2.5} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block text-[12.5px]">
          {backgroundFillLabel(treatment)} background applied
        </strong>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-200/75">
          The replacement is baked into this history step. Undo once to choose another style or
          colour.
        </span>
      </span>
    </div>
  );
}

function commitLabel(fill: BackgroundFill, backgroundWasTransparent: boolean): string {
  if (fill === "transparent") return "Remove BG";
  return backgroundWasTransparent ? "Add background" : "Replace background";
}

function parseHexSample(hex: string | null): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
