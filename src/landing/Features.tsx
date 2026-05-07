// Features.tsx — "Why CloakIMG" section. A multi-coloured feature
// grid that sits above the Footer's How-it-works / Cloakyard bento.
// Mirrors the corresponding "Why CloakPDF" section so the family
// reads consistently across products.

import type { ReactNode } from "react";
import { I } from "../components/icons";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <I.UserCheck size={20} />,
    title: "No sign-up",
    description: "No accounts, no email, no passwords. Start editing the moment the page loads.",
  },
  {
    icon: <I.EyeOff size={20} />,
    title: "No tracking",
    description: "Zero analytics, zero telemetry, zero third-party scripts. You stay invisible.",
  },
  {
    icon: <I.ShieldCheck size={20} />,
    title: "Local-first",
    description: "Every byte stays in your browser. Nothing is ever uploaded to any server.",
  },
  {
    icon: <I.Sparkles size={20} />,
    title: "On-device AI",
    description:
      "Background removal, smart crop, portrait blur, and subject-scoped tone edits all run in-browser via WebGPU. The model loads once with your explicit consent — three sizes from 6 MB to 25 MB so you choose speed vs. fidelity.",
  },
  {
    icon: <I.WifiOff size={20} />,
    title: "Works offline",
    description:
      "After the first visit, every tool — including AI features — keeps working without a connection. The model bytes live in your browser cache, not a remote API.",
  },
  {
    icon: <I.Rocket size={20} />,
    title: "Installable as a PWA",
    description:
      "Add CloakIMG to your home screen for a full-screen, app-like experience that launches in one tap.",
  },
  {
    icon: <I.Smartphone size={20} />,
    title: "Mobile, tablet & desktop",
    description:
      "Every tool adapts fluidly across screen sizes and follows your system's light or dark theme — edit on the go, finalise at your desk.",
  },
  {
    icon: <I.Layers size={20} />,
    title: "All-in-one canvas",
    description:
      "Crop, retouch, redact, adjust, filter, frame, shapes, text — one workspace for every photo chore.",
  },
  {
    icon: <I.GitFork size={20} />,
    title: "Free & open source",
    description:
      "MIT-licensed and on GitHub. Fork it, self-host it, or audit every byte — nothing is hidden.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-275 px-5 pt-2 pb-10 sm:px-8 sm:pt-4 sm:pb-16">
      <div className="mb-8 text-center sm:mb-12">
        <div className="t-eyebrow mb-2.5">Why CloakIMG</div>
        <h2 className="t-display m-0 text-text dark:text-dark-text">
          Everything you need, nothing you don&rsquo;t.
        </h2>
        <p className="t-subtitle mx-auto mt-3 max-w-140 dark:text-dark-text-muted">
          A modern photo editor that respects your privacy — built for people who care about their
          images and their craft.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <FeatureItem key={f.title} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureItem({ icon, title, description }: Feature) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-coral-50 text-coral-600 dark:bg-coral-900/30 dark:text-coral-300"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="mb-1 text-[14.5px] font-semibold tracking-[-0.005em] text-text dark:text-dark-text">
          {title}
        </div>
        <div className="text-[13.5px] leading-[1.55] text-text-muted dark:text-dark-text-muted">
          {description}
        </div>
      </div>
    </div>
  );
}
