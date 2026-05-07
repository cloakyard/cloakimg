// AiSectionHeader.tsx — Small uppercase eyebrow that marks a panel
// section as powered by the on-device subject model. Sparkle icon +
// short label lets users see at a glance which controls trigger
// detection vs which are pure pixel ops.
//
// Used above MaskScopeRow in every scope-aware tool (Adjust, Filter,
// Levels, HSL) and at the top of Remove BG's Auto tab and the
// Background blur panel. Visual rhythm matches the
// CapabilityHints and DetectionStatus eyebrows so the panel reads as
// one cohesive AI surface.

import { I } from "../../../components/icons";

interface Props {
  label?: string;
}

export function AiSectionHeader({ label = "Smart adjustments" }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-[10.75px] font-semibold tracking-[0.04em] text-text-muted uppercase dark:text-dark-text-muted">
      <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
      {label}
    </div>
  );
}
