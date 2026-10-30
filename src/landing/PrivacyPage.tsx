import type { ReactNode } from "react";
import { PrivacyPage as AirPrivacyPage, type PrivacySection } from "../../docs/air/privacy.tsx";
import { GITHUB_ISSUES_URL, GITHUB_REPO_DISPLAY, GITHUB_REPO_URL } from "../constants/links";
import { Header } from "./Header";
import { Footer } from "./Footer";
const sections: PrivacySection[] = [
  {
    id: "local-processing",
    title: "Your photos stay on your device",
    body: (
      <>
        <p>
          Cropping, retouching, redaction, adjustments, filters, frames, and export run locally in
          your browser. CloakIMG does not send image content, metadata, or document data to a server
          because no image-upload route exists.
        </p>
      </>
    ),
  },
  {
    id: "on-device-ai",
    title: "Optional models run in this browser",
    body: (
      <>
        <p>
          Subject segmentation, face detection, and depth estimation use neural networks that run on
          your device through WebAssembly, WebGPU, or the browser main thread. Image bytes are not
          sent to a cloud inference API.
        </p>
        <ul>
          <li>Before the first download, CloakIMG shows the model and approximate size.</li>
          <li>Static model weights may be cached locally for reuse.</li>
          <li>An uncached capability needs a network connection only for its model files.</li>
        </ul>
      </>
    ),
  },
  {
    id: "data-tracking",
    title: "No accounts, advertising, or analytics",
    body: (
      <>
        <p>
          CloakIMG does not collect names, email addresses, account details, usage analytics, device
          identifiers, or behavioural profiles. It has no accounts and installs no advertising or
          analytics scripts.
        </p>
      </>
    ),
  },
  {
    id: "local-storage",
    title: "Offline data remains on this device",
    body: (
      <>
        <p>
          The browser cache, a Service Worker, and IndexedDB can retain app assets, optional model
          files, and the Recents list for offline use. This data stays on your device and can be
          removed through the browser’s site-data controls.
        </p>
      </>
    ),
  },
  {
    id: "hosting",
    title: "The static host may keep standard access logs",
    body: (
      <>
        <p>
          The hosting provider may temporarily retain ordinary request information—such as an IP
          address, asset path, timestamp, and browser headers—for security and operations. These
          requests deliver app or model assets and do not contain your image content.
        </p>
      </>
    ),
  },
  {
    id: "source-rights",
    title: "The privacy model is independently auditable",
    body: (
      <>
        <p>
          Inspect the complete implementation at{" "}
          <PolicyLink href={GITHUB_REPO_URL}>{GITHUB_REPO_DISPLAY}</PolicyLink>. Because CloakIMG
          does not collect personal data, there is no account record for us to disclose, correct,
          export, or delete.
        </p>
        <p>
          Ask a policy question through{" "}
          <PolicyLink href={GITHUB_ISSUES_URL}>GitHub Issues</PolicyLink>. If this policy changes,
          the revised document and date will appear here.
        </p>
      </>
    ),
  },
];
function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
export function PrivacyPage() {
  return (
    <div className="img-site">
      <a href="#main" className="air-page-skip air-button">
        Skip to main content
      </a>
      <Header reading />
      <main id="main" tabIndex={-1} className="air-page-width">
        <AirPrivacyPage
          product="CloakIMG"
          home={import.meta.env.BASE_URL}
          date="2026-07-29"
          lead="CloakIMG is a static, client-side image editor. Your photo content and metadata are processed inside this browser tab and are never sent to an image-upload service."
          sections={sections}
        />
      </main>
      <Footer privacy />
    </div>
  );
}
