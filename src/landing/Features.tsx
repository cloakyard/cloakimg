// Features.tsx — "Why CloakIMG" section. V4 minimalist treatment
// (May 2026): condensed from 9 features to 6 with one-sentence
// descriptions, bare icons in coral (no filled chip backdrop), and a
// 2-col tablet / 3-col desktop rhythm. The prior 9-item grid with
// uneven copy density (some items had 3-sentence paragraphs, others
// had one) read as templated; the new shape gives each claim equal
// visual weight and lets the cream page breathe between rows.
//
// Mirrors the equivalent "Why CloakPDF" section across the Cloakyard
// family.

import type { ReactNode } from "react";
import { I } from "../components/icons";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <I.ShieldCheck size={22} />,
    title: "Local-first, no sign-up",
    description:
      "Every byte stays in your browser. No accounts, no telemetry, no third-party scripts.",
  },
  {
    icon: <I.Sparkles size={22} />,
    title: "On-device AI",
    description:
      "Background removal, smart crop, portrait blur and subject-scoped edits — all in-browser via WebGPU.",
  },
  {
    icon: <I.WifiOff size={22} />,
    title: "Works offline",
    description:
      "After first load, every tool keeps working without a connection. Installable as a PWA.",
  },
  {
    icon: <I.Smartphone size={22} />,
    title: "Mobile, tablet & desktop",
    description:
      "One canvas that adapts to every screen and follows your system's light or dark theme.",
  },
  {
    icon: <I.Layers size={22} />,
    title: "All-in-one canvas",
    description:
      "Crop, retouch, redact, adjust, filter, frame, shapes, text — one workspace for every photo chore.",
  },
  {
    icon: <I.GitFork size={22} />,
    title: "Free & open source",
    description:
      "MIT-licensed on GitHub. Fork it, self-host it, or audit every byte — nothing is hidden.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-275 px-5 pt-2 pb-10 sm:px-8 sm:pt-4 sm:pb-16">
      {/* Left-aligned header — the one band that breaks the otherwise
          center-stacked landing rhythm, so the page has a moment of
          asymmetry against the symmetric feature grid below. */}
      <div className="mb-10 max-w-160 sm:mb-14">
        <div className="t-eyebrow mb-2.5">Why CloakIMG</div>
        <h2 className="t-display m-0 text-text">The whole toolkit, none of the tracking.</h2>
        <p className="t-subtitle mt-3 max-w-140">
          A modern photo editor that respects your privacy — built for people who care about their
          images and their craft.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 sm:gap-y-10 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <FeatureItem key={f.title} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureItem({ icon, title, description }: Feature) {
  return (
    // Bare coral icon (no filled chip backdrop) + stacked text. The
    // prior 9 × coral-50 icon-square pattern read as templated AI grid;
    // bare icons let each feature stand on the typography alone.
    <div className="flex flex-col gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-start text-coral-600 dark:text-coral-400"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-text">{title}</div>
        <div className="mt-1 text-[13px] leading-[1.55] text-text-muted">{description}</div>
      </div>
    </div>
  );
}
