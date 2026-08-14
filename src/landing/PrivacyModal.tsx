// PrivacyModal.tsx — Complete policy inside the shared Cloakyard dialog shell.

import type { ReactNode } from "react";
import { I } from "../components/icons";
import { GITHUB_ISSUES_URL, GITHUB_REPO_DISPLAY, GITHUB_REPO_URL } from "../constants/links";
import { ModalCloseButton, ModalFrame } from "../components/ModalFrame";

const LAST_UPDATED_ISO = "2026-07-29";
const LAST_UPDATED = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeZone: "UTC",
}).format(new Date(`${LAST_UPDATED_ISO}T00:00:00Z`));

const IMAGE_PATH = [
  {
    number: "01",
    title: "Image bytes enter browser memory",
    meta: "Input / local file handle",
  },
  {
    number: "02",
    title: "Canvas, WASM, and optional models do the work",
    meta: "Process / this tab",
  },
  {
    number: "03",
    title: "JPEG, PNG, or WebP returns to your device",
    meta: "Output / browser download",
  },
] as const;

interface Props {
  isPhone: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isPhone, onClose }: Props) {
  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet={isPhone}
      maxWidth="max-w-[68.75rem]"
      labelledBy="privacy-title"
      modalClassName="cloak-privacy-dialog flex-col"
    >
      <div className="cloak-privacy-dialog__bar">
        <p>
          <I.ShieldCheck size={16} />
          CloakIMG / Privacy document
        </p>
        <ModalCloseButton onClose={onClose} label="Close privacy policy" />
      </div>

      <div className="cloak-privacy-dialog__scroll scroll-thin">
        <section className="cloak-privacy-dialog__architecture">
          <div className="cloak-privacy-dialog__promise">
            <p className="cloak-privacy-dialog__kicker">Privacy by architecture</p>
            <h2 id="privacy-title">Your image stays in the frame.</h2>
            <p className="cloak-privacy-dialog__lede">
              CloakIMG is a static, client-side image editor. Your photo content and metadata are
              processed inside this browser tab and are never sent to an image-upload service.
            </p>

            <dl className="cloak-privacy-dialog__facts">
              <div>
                <dt>Last updated</dt>
                <dd>
                  <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED}</time>
                </dd>
              </div>
              <div>
                <dt>Image uploads</dt>
                <dd>None</dd>
              </div>
              <div>
                <dt>Product analytics</dt>
                <dd>None</dd>
              </div>
            </dl>
          </div>

          <div className="cloak-privacy-dialog__path">
            <div className="cloak-privacy-dialog__path-head">
              <span>Image path</span>
              <span>Verified by design</span>
            </div>
            <div className="cloak-privacy-dialog__path-list">
              {IMAGE_PATH.map((item) => (
                <div key={item.number} className="cloak-privacy-dialog__path-row">
                  <span>{item.number}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.meta}</p>
                  </div>
                  <strong>Local</strong>
                </div>
              ))}
            </div>

            <div className="cloak-privacy-dialog__absent">
              <p>Routes not present</p>
              <div>
                <span>Image upload server — none</span>
                <span>Required account — none</span>
                <span>Product analytics — none</span>
              </div>
            </div>
          </div>
        </section>

        <article className="cloak-privacy-policy" aria-label="Complete privacy policy">
          <PolicySection marker="01 / Local processing" title="Your photos stay on your device">
            <p>
              Cropping, retouching, redaction, adjustments, filters, frames, and export run locally
              in your browser. CloakIMG does not send image content, metadata, or document data to a
              server because no image-upload route exists.
            </p>
          </PolicySection>

          <PolicySection marker="02 / On-device AI" title="Optional models run in this browser">
            <p>
              Subject segmentation, face detection, and depth estimation use neural networks that
              run on your device through WebAssembly, WebGPU, or the browser main thread. Image
              bytes are not sent to a cloud inference API.
            </p>
            <ul>
              <li>Before the first download, CloakIMG shows the model and approximate size.</li>
              <li>Static model weights may be cached locally for reuse.</li>
              <li>An uncached capability needs a network connection only for its model files.</li>
            </ul>
          </PolicySection>

          <PolicySection
            marker="03 / Data & tracking"
            title="No accounts, advertising, or analytics"
          >
            <p>
              CloakIMG does not collect names, email addresses, account details, usage analytics,
              device identifiers, or behavioural profiles. It has no accounts and installs no
              advertising or analytics scripts.
            </p>
          </PolicySection>

          <PolicySection marker="04 / Local storage" title="Offline data remains on this device">
            <p>
              The browser cache, a Service Worker, and IndexedDB can retain app assets, optional
              model files, and the Recents list for offline use. This data stays on your device and
              can be removed through the browser’s site-data controls.
            </p>
          </PolicySection>

          <PolicySection
            marker="05 / Hosting"
            title="The static host may keep standard access logs"
          >
            <p>
              The hosting provider may temporarily retain ordinary request information—such as an IP
              address, asset path, timestamp, and browser headers—for security and operations. These
              requests deliver app or model assets and do not contain your image content.
            </p>
          </PolicySection>

          <PolicySection
            marker="06 / Source & rights"
            title="The privacy model is independently auditable"
          >
            <p>
              Inspect the complete implementation at{" "}
              <PolicyLink href={GITHUB_REPO_URL}>{GITHUB_REPO_DISPLAY}</PolicyLink>. Because
              CloakIMG does not collect personal data, there is no account record for us to
              disclose, correct, export, or delete.
            </p>
            <p>
              Ask a policy question through{" "}
              <PolicyLink href={GITHUB_ISSUES_URL}>GitHub Issues</PolicyLink>. If this policy
              changes, the revised document and date will appear here.
            </p>
          </PolicySection>
        </article>
      </div>
    </ModalFrame>
  );
}

function PolicySection({
  marker,
  title,
  children,
}: {
  marker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="cloak-privacy-policy__section">
      <p className="cloak-privacy-policy__marker">{marker}</p>
      <h3>{title}</h3>
      <div className="cloak-privacy-policy__copy">{children}</div>
    </section>
  );
}

function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="cloak-privacy-policy__link">
      {children}
    </a>
  );
}
