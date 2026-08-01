// Landing.tsx — CloakIMG's functional workbench landing. The visual
// language follows the CloakPDF sibling while the instrument is a real
// local image input, not a decorative product mock-up.

import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { I } from "../components/icons";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { PrivacyModal } from "./PrivacyModal";
import { StartModal, type StartChoice } from "./StartModal";

interface Props {
  onStart: (choice: StartChoice) => void;
  onIntent?: () => void;
}

const WORKFLOW = [
  {
    number: "01",
    title: "Open",
    copy: "Choose a photo. The browser reads it directly from your device.",
  },
  {
    number: "02",
    title: "Work",
    copy: "Retouch, grade, redact, replace backgrounds, or frame an ID photo on one canvas.",
  },
  {
    number: "03",
    title: "Export",
    copy: "Write an image, or an exact passport and visa print sheet, back to your device.",
  },
] as const;

export function Landing({ onStart, onIntent }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isPhone = width < 600;
  const openStart = () => {
    onIntent?.();
    setModalOpen(true);
  };

  return (
    <div className="cloak-site">
      <a href="#main" className="cloak-skip-link">
        Skip to main content
      </a>

      <Header
        right={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openStart}
            onMouseEnter={onIntent}
            onFocus={onIntent}
          >
            Open editor
            <I.ArrowRight size={14} />
          </button>
        }
      />

      <main id="main">
        <section className="site-frame cloak-hero" aria-labelledby="home-title">
          <div className="cloak-hero__intro">
            <h1 id="home-title" className="cloak-display">
              A complete photo workbench.{" "}
              <span className="cloak-display__accent">Your pixels stay put.</span>
            </h1>

            <div className="cloak-hero__aside">
              <p className="cloak-hero__lede">
                Crop, retouch, replace backgrounds, build passport or visa print sheets, and export
                in one capable web app. Image content remains inside your browser.
              </p>
              <a className="cloak-text-link" href="#workbench">
                Open the workbench
                <I.ArrowRight size={15} className="cloak-link-arrow" />
              </a>
            </div>
          </div>

          <div
            id="workbench"
            className="cloak-workbench"
            onMouseEnter={onIntent}
            onFocus={onIntent}
          >
            <div className="cloak-instrument-bar">
              <span>Live web app / local image pipeline</span>
              <span className="cloak-status">
                <span className="cloak-status-dot" aria-hidden="true" />
                Ready in this tab
              </span>
            </div>

            <div className="cloak-workbench__body">
              <ol className="cloak-workbench__steps">
                {WORKFLOW.map((step) => (
                  <li key={step.number} className="cloak-workbench__step">
                    <span className="cloak-workbench__step-number">{step.number}</span>
                    <div>
                      <p className="cloak-workbench__step-title">{step.title}</p>
                      <p className="cloak-workbench__step-copy">{step.copy}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="cloak-workbench__drop">
                <DropZone
                  title="Drop an image to open the editor"
                  subtitle="Or browse your device — JPG, PNG, WebP, AVIF, GIF, HEIC, or HEIF"
                  showPasteButton
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) onStart({ kind: "upload", file });
                  }}
                />
              </div>
            </div>

            <div className="cloak-workbench__footer" aria-label="Workbench architecture">
              {[
                ["Browser", "Execution"],
                ["Canvas", "Raster editing"],
                ["On device", "Optional AI"],
                ["Local file", "Export"],
              ].map(([value, label]) => (
                <div key={value} className="cloak-workbench__metric">
                  <span className="cloak-workbench__metric-value">{value}</span>
                  <span className="cloak-workbench__metric-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Features />
        <Footer onPrivacy={() => setPrivacyOpen(true)} />
      </main>

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
