// MaskConsentDialog.tsx — Transparent opt-in for the on-device subject
// detection model. Pops the first time any tool needs subject /
// background segmentation when the model bytes aren't already in the
// browser's CacheStorage. Once the user accepts, we remember it for
// the rest of the session — switching tools or images shouldn't
// re-prompt for an asset they've already authorised.
//
// Goals:
//   • No surprise downloads. The dialog states the size, the model
//     name, and what the model does before any bytes hit the wire.
//   • Quality choice is part of the same tap, not a separate panel.
//     The "Best" tier (~168 MB ISNet fp32) is hidden on phones — too
//     heavy for typical mobile storage budgets and the fp16 tier is
//     visually indistinguishable on phone-class screens. Tablets keep
//     the option (iPad-class RAM + storage handle 168 MB fine); only
//     the small-screen mobile layout hides it.
//   • Privacy: the panel reiterates that the model + image stay on
//     this device, since "do you want to download an AI model" reads
//     scarier than "do you want me to call an API" otherwise.
//
// Layout responds to viewport: bottom sheet on mobile, centered card
// on tablet/desktop. Re-uses ModalFrame for the backdrop so the
// dimming / blur is consistent with the other editor modals.

import { useCallback, useEffect, useState } from "react";
import { I } from "../../../components/icons";
import { ModalCloseButton, ModalFrame } from "../../../components/ModalFrame";
import { useEditorActions, useEditorReadOnly } from "../../EditorContext";
import { type BgQuality, getTierById, tiersForLayout } from "../runtime/bgModels";
import { savePreferredQuality } from "../runtime/preferredQuality";
import { isModelCached } from "../runtime/segment";

interface Props {
  /** Quality the caller initially asked for. The user can change it
   *  inside the dialog before accepting; we only commit `bgQuality`
   *  when they tap Download. */
  initialQuality: BgQuality;
  /** User accepted the download at the chosen tier. */
  onAccept: (quality: BgQuality) => void;
  /** User dismissed the dialog. */
  onDismiss: () => void;
  /** True when the dialog was opened from "Change model size" rather
   *  than as the first-time consent prompt. The dialog re-uses the
   *  same picker UI, but adapts copy so it reads as a switch
   *  ("Choose a model size" + "Use {N} MB") rather than a fresh
   *  download solicitation. The user has already granted consent —
   *  they just want to pick a different tier. */
  switchMode?: boolean;
}

export function MaskConsentDialog({
  initialQuality,
  onAccept,
  onDismiss,
  switchMode = false,
}: Props) {
  const { layout } = useEditorReadOnly();
  const { patchTool } = useEditorActions();
  const visibleTiers = tiersForLayout(layout);
  // Defensive: if a prior session left `bgQuality` at "large" and the
  // user is now on a mobile layout where Best is hidden, downgrade
  // the initial pick so the radio actually reflects something
  // visible. Without this the dialog would show no selected tier and
  // the Download button would advertise an unavailable size.
  const safeInitial: BgQuality = visibleTiers.some((t) => t.id === initialQuality)
    ? initialQuality
    : (visibleTiers[0]?.id ?? "small");
  const [picked, setPicked] = useState<BgQuality>(safeInitial);
  // Track which tiers are already on disk from a prior session — those
  // get a "ready" badge so the user can pick a free option without
  // hesitating, and we still surface the current selection's status.
  const [cachedTiers, setCachedTiers] = useState<Set<BgQuality>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Recompute the visible tier list inside the effect so the deps
    // stay primitive (`layout`) rather than the derived array — the
    // hook lint can't see that `tiersForLayout` is pure of `layout`.
    const tiers = tiersForLayout(layout);
    void Promise.all(tiers.map(async (t) => [t.id, await isModelCached(t.id)] as const)).then(
      (entries) => {
        if (cancelled) return;
        const next = new Set<BgQuality>();
        for (const [id, cached] of entries) if (cached) next.add(id);
        setCachedTiers(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [layout]);

  const accept = useCallback(() => {
    const idx = getTierById(picked).index;
    patchTool("bgQuality", idx);
    // Remember the choice across sessions so the editor boots into
    // this tier next visit instead of always defaulting to Fast. The
    // restore path in EditorContext validates the bytes are still on
    // disk before honouring this — clearing the browser cache resets
    // the default the same way it always did.
    savePreferredQuality(picked);
    onAccept(picked);
  }, [onAccept, patchTool, picked]);

  const isMobile = layout === "mobile";

  return (
    <ModalFrame
      onClose={onDismiss}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-130"
      labelledBy="cloak-mask-consent-title"
    >
      {/* Sticky header — same icon-+-title-+-close-X pattern that
          ConfirmDialog / FilePropertiesModal / ExportModal use. The
          subtitle moved into the body so the header stays a single
          fixed-height row that lines up across modals. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
            <I.Sparkles size={16} />
          </div>
          <div id="cloak-mask-consent-title" className="t-headline truncate text-base">
            {switchMode ? "Choose a model size" : "Download the AI model"}
          </div>
        </div>
        <ModalCloseButton onClose={onDismiss} iconSize={14} />
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          {switchMode
            ? "Switch between the three tiers below. Sizes you've already used in this browser run instantly — others download once and cache for next time."
            : "Subject-aware tools (smart crop, scoped adjustments, portrait blur, smart redact) need a segmentation model. It runs entirely on this device — your image is never uploaded."}
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
            Pick a model size
          </div>
          {visibleTiers.map((tier) => {
            const active = picked === tier.id;
            const cached = cachedTiers.has(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setPicked(tier.id)}
                aria-pressed={active}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border bg-page-bg px-3 py-2.5 text-left dark:bg-dark-page-bg ${
                  active
                    ? "border-coral-500 ring-2 ring-coral-500/30"
                    : "border-border-soft dark:border-dark-border-soft"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active
                      ? "border-coral-500 bg-coral-500"
                      : "border-border dark:border-dark-border"
                  }`}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[12.5px] font-semibold text-text dark:text-dark-text">
                      {tier.label}
                    </span>
                    <span className="t-mono text-[11px] text-text-muted dark:text-dark-text-muted">
                      ~{tier.mb} MB
                    </span>
                    {tier.recommended && !cached && (
                      <span className="rounded-full border border-coral-300/70 bg-coral-50 px-1.5 py-px text-[10px] font-semibold text-coral-700 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200">
                        Recommended
                      </span>
                    )}
                    {cached && (
                      <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200">
                        Already downloaded
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-text dark:text-dark-text">
                    {tier.strength}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-text-muted dark:text-dark-text-muted">
                    {tier.tradeoff}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-border-soft bg-page-bg px-3 py-2 dark:border-dark-border-soft dark:bg-dark-page-bg">
          <div className="mb-1 flex items-center gap-1.5 text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
            <I.ShieldCheck size={11} /> Privacy
          </div>
          <ul className="m-0 list-none space-y-0.5 p-0 text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
            <li>· Model + your image stay in this browser tab.</li>
            <li>· One download — cached for future visits, even offline.</li>
            <li>· You can switch sizes later from the Remove background panel.</li>
          </ul>
        </div>
      </div>

      {/* Sticky footer — bordered top + safe-area padding on mobile,
          matching ConfirmDialog. Same `btn-ghost btn-sm` for the
          dismissive action so every "back out" button across the app
          reads the same. */}
      <div
        className={`flex shrink-0 items-center justify-end gap-2 border-t border-border-soft dark:border-dark-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          {switchMode ? "Cancel" : "Not now"}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={accept}>
          {/* When switching tiers and the picked size is already on
              disk, omit the download glyph — the action is "use this
              model", not "download". Avoids the misleading visual
              that suggests a fresh download will start. */}
          {!(switchMode && cachedTiers.has(picked)) && <I.Download size={13} />}
          {switchMode && cachedTiers.has(picked)
            ? `Use ${pickedSize(picked)} MB model`
            : `Download ${pickedSize(picked)} MB`}
        </button>
      </div>
    </ModalFrame>
  );
}

function pickedSize(q: BgQuality): number {
  return getTierById(q).mb;
}
