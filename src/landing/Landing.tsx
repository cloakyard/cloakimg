// Landing.tsx — The single way into the editor: sunset-backed hero with
// "Open editor" CTA. The CTA opens a StartModal whose result is the
// initial document for the editor.

import { useEffect, useState } from "react";
import { Grainient } from "../components/Grainient";
import { I } from "../components/icons";
import { SamplePhoto } from "../components/SamplePhoto";
import { GRAINIENT_DARK, GRAINIENT_LIGHT, GRAINIENT_MOTION } from "../constants/grainient";
import { usePrefersDark } from "../utils/usePrefersDark";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { PrivacyModal } from "./PrivacyModal";
import { StartModal, type StartChoice } from "./StartModal";

interface Props {
  onStart: (choice: StartChoice) => void;
  /** Optional: signal that the user has shown intent to enter the
   *  editor (opened the StartModal). Lets the parent prefetch the
   *  editor + Fabric chunk so the lazy import resolves instantly when
   *  the user confirms. Best-effort, fire-and-forget. */
  onIntent?: () => void;
}

export function Landing({ onStart, onIntent }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [width, setWidth] = useState(typeof window === "undefined" ? 1280 : window.innerWidth);
  const isDark = usePrefersDark();

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The phone breakpoint here gates the StartModal layout (which still
  // takes a prop). Tailwind's `sm:` covers everything else.
  const isPhone = width < 600;
  const palette = isDark ? GRAINIENT_DARK : GRAINIENT_LIGHT;

  return (
    <div className="relative min-h-full">
      {/* Sunset-toned animated backdrop. Palette + motion live in
          src/constants/grainient.ts so the editor shell and the
          landing hero render the same gradient. The .grainient-fixed
          class positions it as a page backdrop: fixed inset-0, z-0,
          with the iOS URL-bar mask. */}
      <Grainient className="grainient-fixed" {...GRAINIENT_MOTION} {...palette} />
      <div className="relative z-1">
        <Header />

        <section className="mx-auto max-w-275 px-5 pt-14 pb-10 text-center sm:px-8 sm:pt-24 sm:pb-20">
          <h1 className="t-hero mx-auto mb-4.5 max-w-205">
            A photo editor that <em>respects your photos.</em>
          </h1>
          <p className="t-subtitle mx-auto mb-7 max-w-160">
            Crop, redact, retouch and export — with on-device AI for{" "}
            <em>subject detection, background removal, smart crop, and portrait blur</em>. Models
            run in your browser. Your photo never leaves this tab.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                onIntent?.();
                setModalOpen(true);
              }}
              onMouseEnter={onIntent}
              onFocus={onIntent}
            >
              <I.ArrowRight size={16} /> Open editor
            </button>
          </div>
          {/* Trust strip — V4 (May 2026): condensed from a 4-pill
              line to a 3-item dot-separated row. On phones the prior
              layout stacked into 4 vertical rows, eating the fold;
              the new strip wraps to at most 2 rows even at 320 px.
              Privacy + offline + open-source are the three claims that
              matter; "no sign-in" is implied by "stays on device". */}
          <div className="mt-5.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12.5px] font-medium text-text-muted">
            <span className="flex items-center gap-1.5">
              <I.Lock size={13} /> Stays on your device
            </span>
            <span aria-hidden="true" className="text-text-muted/40">
              ·
            </span>
            <span className="flex items-center gap-1.5">
              <I.Sparkles size={13} className="text-coral-500 dark:text-coral-400" />
              On-device AI
            </span>
            <span aria-hidden="true" className="text-text-muted/40">
              ·
            </span>
            <span className="flex items-center gap-1.5">
              <I.Refresh size={13} /> Works offline
            </span>
          </div>
        </section>

        <section className="mx-auto max-w-275 px-5 pb-15 sm:px-8 sm:pb-25">
          {/* Photo frame — V4 minimalist treatment (May 2026).
              The prior dark coffee matte + heavy 0 30px 60px shadow
              competed with the sunset grainient for visual weight
              against the cream page. V4 swaps the matte for a hairline
              card on the same paper tone as the page and uses a single
              soft shadow on the photo itself, so the sunset is what
              the eye lands on. */}
          <div className="overflow-hidden rounded-3xl border border-border-soft bg-surface/60 p-2 backdrop-blur-sm sm:p-2.5">
            <SamplePhoto
              aspect="16/10"
              variant="sunset"
              style={{
                width: "100%",
                borderRadius: "var(--r-2xl)",
                boxShadow: "0 8px 24px -10px rgba(30,18,10,0.18)",
              }}
            />
          </div>
        </section>

        <Features />

        <Footer onPrivacy={() => setPrivacyOpen(true)} />
      </div>

      {modalOpen && (
        <StartModal
          isPhone={isPhone}
          onCancel={() => setModalOpen(false)}
          onConfirm={(choice) => {
            setModalOpen(false);
            onStart(choice);
          }}
        />
      )}

      {privacyOpen && <PrivacyModal isPhone={isPhone} onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}
