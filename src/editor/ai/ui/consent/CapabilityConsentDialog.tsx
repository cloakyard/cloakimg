// CapabilityConsentDialog.tsx — Generic, capability-agnostic consent
// dialog. Replaces the segment-specific MaskConsentDialog for new
// capabilities; the legacy mask flow keeps using its existing dialog
// until that migration is done.
//
// Shape and visual rhythm match MaskConsentDialog 1:1 — same modal
// frame, same tier-row layout, same privacy footer, same button
// pattern — so users see one consistent "AI download" surface no
// matter which capability triggered it.
//
// Per-capability copy comes from `family.consent` (title, body,
// privacy bullets, button verbs). Tier metadata (label, mb, strength,
// tradeoff, recommended) comes from `family.tiers`. The dialog itself
// is purely presentation — persistence (toolState, localStorage) is
// the host's job.

import { useCallback, useEffect, useState } from "react";
import { I } from "../../../../components/icons";
import { ModalCloseButton, ModalFrame } from "../../../../components/ModalFrame";
import { useEditorReadOnly } from "../../../EditorContext";
import {
  type CapabilityFamily,
  type CapabilityTier,
  tierById,
  tiersForLayout,
} from "../../capability/types";

interface Props {
  family: CapabilityFamily;
  /** Tier id the caller initially asks for. The user can change it
   *  inside the dialog before accepting; we only commit on accept. */
  initialTierId: string;
  /** Returns whether each tier's bytes are already on disk. Called
   *  per tier when the dialog mounts so we can stamp the "Already
   *  downloaded" pill. */
  isTierCached: (tier: CapabilityTier<unknown>) => Promise<boolean>;
  /** User accepted the download at the chosen tier. */
  onAccept: (tierId: string) => void;
  /** User dismissed the dialog. */
  onDismiss: () => void;
  /** True when opened from "Change model size" rather than as the
   *  first-time consent prompt. */
  switchMode?: boolean;
}

export function CapabilityConsentDialog({
  family,
  initialTierId,
  isTierCached,
  onAccept,
  onDismiss,
  switchMode = false,
}: Props) {
  const { layout } = useEditorReadOnly();
  const visibleTiers = tiersForLayout(family.tiers, layout);
  // Defensive: if a prior session left the preference at a tier that's
  // hidden on the current layout (e.g. "large" on mobile), downgrade
  // the initial pick so the radio actually reflects something visible.
  const safeInitial: string = visibleTiers.some((t) => t.id === initialTierId)
    ? initialTierId
    : (visibleTiers[0]?.id ?? family.tiers[0]?.id ?? "");
  const [picked, setPicked] = useState<string>(safeInitial);
  const [cachedTiers, setCachedTiers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const tiers = tiersForLayout(family.tiers, layout);
    void Promise.all(tiers.map(async (t) => [t.id, await isTierCached(t)] as const)).then(
      (entries) => {
        if (cancelled) return;
        const next = new Set<string>();
        for (const [id, cached] of entries) if (cached) next.add(id);
        setCachedTiers(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [family, isTierCached, layout]);

  const accept = useCallback(() => {
    onAccept(picked);
  }, [onAccept, picked]);

  const isMobile = layout === "mobile";
  const pickedTier = picked ? tierById(family.tiers, picked) : null;
  const pickedSize = pickedTier?.mb ?? 0;
  const pickedCached = cachedTiers.has(picked);

  return (
    <ModalFrame
      onClose={onDismiss}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-130"
      labelledBy="cloak-capability-consent-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
            <I.Sparkles size={16} />
          </div>
          <div id="cloak-capability-consent-title" className="t-headline truncate text-base">
            {switchMode ? family.consent.switchTitle : family.consent.title}
          </div>
        </div>
        <ModalCloseButton onClose={onDismiss} iconSize={14} />
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          {switchMode ? family.consent.switchBody : family.consent.body}
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
            {family.consent.privacy.map((line, i) => (
              <li key={i}>· {line}</li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className={`flex shrink-0 items-center justify-end gap-2 border-t border-border-soft dark:border-dark-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          {switchMode ? "Cancel" : "Not now"}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={accept}>
          {!(switchMode && pickedCached) && <I.Download size={13} />}
          {switchMode && pickedCached
            ? `${family.consent.useVerb} ${pickedSize} MB model`
            : `${family.consent.downloadVerb} ${pickedSize} MB`}
        </button>
      </div>
    </ModalFrame>
  );
}
