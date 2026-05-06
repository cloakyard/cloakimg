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
//     The "Best" tier (~176 MB) is hidden on phones — the prior copy
//     said "desktop only" but we weren't actually gating, which the
//     user flagged as misleading. Tablets keep the option (iPad-class
//     RAM + storage handle 176 MB fine); only the small-screen
//     mobile layout hides it.
//   • Privacy: the panel reiterates that the model + image stay on
//     this device, since "do you want to download an AI model" reads
//     scarier than "do you want me to call an API" otherwise.
//
// Layout responds to viewport: bottom sheet on mobile, centered card
// on tablet/desktop. Re-uses ModalFrame for the backdrop so the
// dimming / blur is consistent with the other editor modals.

import { useCallback, useEffect, useState } from "react";
import { I } from "../../components/icons";
import { ModalFrame } from "../../components/ModalFrame";
import { useEditorActions, useEditorReadOnly } from "../EditorContext";
import type { Layout } from "../types";
import { type BgQuality, isModelCached } from "./smartRemoveBg";

interface Tier {
  id: BgQuality;
  index: number;
  label: string;
  mb: number;
  hint: string;
  /** When true, this tier only appears on tablet/desktop. The 176 MB
   *  model is heavy for phone storage budgets and most phone use
   *  cases — Fast/Better are the right defaults there. */
  desktopAndTabletOnly?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "small",
    index: 0,
    label: "Fast",
    mb: 44,
    hint: "Best for portraits and most photos. Recommended.",
  },
  {
    id: "medium",
    index: 1,
    label: "Better",
    mb: 88,
    hint: "Sharper edges, slower on first run.",
  },
  {
    id: "large",
    index: 2,
    label: "Best",
    mb: 176,
    hint: "Highest fidelity, heaviest download.",
    desktopAndTabletOnly: true,
  },
];

function tiersForLayout(layout: Layout): Tier[] {
  if (layout === "mobile") return TIERS.filter((t) => !t.desktopAndTabletOnly);
  return TIERS;
}

interface Props {
  /** Quality the caller initially asked for. The user can change it
   *  inside the dialog before accepting; we only commit `bgQuality`
   *  when they tap Download. */
  initialQuality: BgQuality;
  /** User accepted the download at the chosen tier. */
  onAccept: (quality: BgQuality) => void;
  /** User dismissed the dialog. */
  onDismiss: () => void;
}

export function MaskConsentDialog({ initialQuality, onAccept, onDismiss }: Props) {
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
    const idx = TIERS.find((t) => t.id === picked)?.index ?? 0;
    patchTool("bgQuality", idx);
    onAccept(picked);
  }, [onAccept, patchTool, picked]);

  const isMobile = layout === "mobile";

  return (
    <ModalFrame
      onClose={onDismiss}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-120"
      labelledBy="cloak-mask-consent-title"
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300">
            <I.Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="cloak-mask-consent-title"
              className="text-[15px] font-semibold text-text dark:text-dark-text"
            >
              Download the on-device AI model?
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              Subject-aware tools (smart crop, scoped adjustments, portrait blur, smart redact) need
              a segmentation model. It runs entirely on this device — your image is never uploaded.
            </p>
          </div>
        </div>

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
                  <span className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-text dark:text-dark-text">
                      {tier.label}
                    </span>
                    <span className="t-mono text-[11px] text-text-muted dark:text-dark-text-muted">
                      ~{tier.mb} MB
                    </span>
                    {cached && (
                      <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200">
                        Already downloaded
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-text-muted dark:text-dark-text-muted">
                    {tier.hint}
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

      <div className="flex items-center justify-end gap-2 border-t border-border-soft px-5 pt-3 pb-5 sm:px-6 dark:border-dark-border-soft">
        {/* Dismissive action uses the same `btn-ghost btn-sm` style
            as Cancel in StartModal / ConfirmDialog — keeps every
            "back out" button reading the same way across the app. */}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Not now
        </button>
        <button type="button" className="btn btn-primary" onClick={accept}>
          <I.Download size={13} />
          Download {pickedSize(picked)} MB
        </button>
      </div>
    </ModalFrame>
  );
}

function pickedSize(q: BgQuality): number {
  return TIERS.find((t) => t.id === q)?.mb ?? 44;
}
