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
            A minimal photo editor that <em>respects your photos.</em>
          </h1>
          <p className="t-subtitle mx-auto mb-7 max-w-145 dark:text-dark-text-muted">
            Crop, retouch, redact, convert and export — all in one canvas. Files never leave your
            browser.
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
          <div className="mt-5.5 flex flex-wrap justify-center gap-x-4.5 gap-y-2 text-[12.5px] text-text-muted dark:text-dark-text-muted">
            <span className="flex items-center gap-1.5">
              <I.Lock size={12} /> 100% on-device
            </span>
            <span className="flex items-center gap-1.5">
              <I.Refresh size={12} /> Works offline
            </span>
            <span className="flex items-center gap-1.5">
              <I.Check size={12} /> No sign-in
            </span>
          </div>
        </section>

        <section className="mx-auto max-w-275 px-5 pb-15 sm:px-8 sm:pb-25">
          {/* Photo frame: outer card has a dark `bg-canvas-bg` matte
              that reads as the photo's frame. Padding sets the
              frame's thickness; inner radius matches outer minus the
              padding so the two corners feel concentric. */}
          <div
            className="card overflow-hidden bg-canvas-bg p-3 sm:p-4"
            style={{ boxShadow: "0 30px 60px -20px rgba(30,18,10,0.20)" }}
          >
            <SamplePhoto
              aspect="16/10"
              variant="sunset"
              style={{
                width: "100%",
                borderRadius: "var(--r-xl)",
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.4)",
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
