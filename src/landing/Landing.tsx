import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { I } from "../components/icons";
import { Landscape } from "./Landscape";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { StartModal, type StartChoice } from "./StartModal";

interface Props {
  onStart: (choice: StartChoice) => void;
  onIntent?: () => void;
}

export function Landing({ onStart, onIntent }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(
    () => window.matchMedia?.("(max-width: 640px)").matches ?? false,
  );

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 640px)");
    if (!media) return;
    const update = () => setIsPhone(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // A missed file drop must not navigate away from the entry flow. Text and
  // links keep their native drag behaviour; accepted drops stop at DropZone.
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  return (
    <div className="img-site">
      <a href="#main" className="img-skip air-button">
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <section className="img-hero air-page-width" aria-labelledby="home-title">
          <h1 id="home-title">
            Your photos. <span>Your way.</span>
          </h1>
          <p className="img-lede">
            A little retouching or a whole new look. Edit, compose and export with a complete photo
            toolkit, right on your device.
          </p>
          <Landscape />
          <div
            id="workbench"
            className="img-entry"
            tabIndex={-1}
            onPointerEnter={onIntent}
            onFocus={onIntent}
          >
            <DropZone
              title="Drop an image to start"
              subtitle="One image · JPG, PNG, WebP, AVIF, GIF, HEIC or HEIF"
              onFiles={(files) => {
                const file = files[0];
                if (file) onStart({ kind: "upload", file });
              }}
            />
            <button
              type="button"
              className="air-button air-button--quiet"
              onClick={() => {
                onIntent?.();
                setModalOpen(true);
              }}
              onPointerEnter={onIntent}
              onFocus={onIntent}
            >
              Open editor <I.ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="img-entry-note">
              Start a blank canvas, resume a draft or reopen a recent photo.
            </p>
          </div>
        </section>
        <Features />
      </main>
      <Footer />
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
    </div>
  );
}
