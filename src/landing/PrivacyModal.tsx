// PrivacyModal.tsx — Inline popup version of the privacy policy.
// CloakPDF renders this as a full page; CloakIMG keeps the landing
// surface free of routes, so we surface the same copy in a modal.

import { I } from "../components/icons";
import { GITHUB_ISSUES_URL, GITHUB_REPO_DISPLAY, GITHUB_REPO_URL } from "../constants/links";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";

interface Props {
  isPhone: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isPhone, onClose }: Props) {
  return (
    <ModalFrame onClose={onClose} bottomSheet={isPhone} labelledBy="privacy-title">
      <PrivacyBody onClose={onClose} />
    </ModalFrame>
  );
}

function PrivacyBody({ onClose }: { onClose: () => void }) {
  const animatedClose = useModalClose();
  // Wrap in an arrow that drops the click event — animatedClose's
  // optional `onSettled` arg would otherwise receive the MouseEvent.
  const dismiss = () => (animatedClose ? animatedClose() : onClose());
  return (
    <>
      <div className="cloak-dialog__header items-start">
        <div className="cloak-dialog__icon">
          <I.ShieldCheck size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="privacy-title"
            className="text-[19px] font-semibold tracking-[-0.015em] text-text"
          >
            Privacy Policy
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">Last updated: July 29, 2026</p>
        </div>
        <ModalCloseButton onClose={onClose} label="Close privacy policy" />
      </div>

      <div className="cloak-dialog__body scroll-thin space-y-6 px-6 py-5 text-[13px] leading-[1.6] text-text-muted sm:px-7">
        <Section title="Overview">
          CloakIMG is a free, open-source photo editor that runs entirely in your web browser. We
          are committed to your privacy. This policy explains the app’s local processing model and
          the limited network requests needed to deliver its code and optional model files.
        </Section>

        <Section title="Your Photos Stay on Your Device">
          All image processing — cropping, retouching, redaction, adjustments, filters, frames,
          export, every operation — is performed locally in your browser. Your photos are{" "}
          <strong className="text-text">never uploaded</strong> to any server. No image content,
          metadata, or document data is transmitted over the network.
        </Section>

        <Section title="On-Device AI — Your Images Never See the Cloud">
          <p>
            Some tools use neural networks for subject segmentation, face detection, or depth
            estimation. Those models run{" "}
            <strong className="text-text">entirely inside your browser, on your device</strong> via
            WebAssembly, WebGPU, or the browser’s main thread. We do not send your image to a cloud
            inference API.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-text-muted/60">
            <li>
              Before a first-time model download, CloakIMG shows the model, approximate byte size,
              and available quality tiers. Model files are cached locally for reuse when the browser
              allows it.
            </li>
            <li>
              The model itself ships as static weights. Inference is deterministic and read-only —
              nothing about your photo is sent back to us, the model author, or anyone else.
            </li>
            <li>
              A cached model can continue to work offline. An uncached capability needs a network
              connection for its first, consented download.
            </li>
          </ul>
        </Section>

        <Section title="No Personal Data Collected">
          <p>We do not collect, store, or process any personal information, including:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-text-muted/60">
            <li>Names, email addresses, or account details (there are no accounts)</li>
            <li>IP addresses or device identifiers</li>
            <li>Usage analytics or behavioural tracking</li>
            <li>Cookies or persistent identifiers of any kind</li>
          </ul>
        </Section>

        <Section title="No Cookies or Tracking">
          CloakIMG does not use cookies, local storage for tracking purposes, or any third-party
          analytics or advertising scripts. The application may use your browser&apos;s cache, a
          Service Worker, and IndexedDB (for the Recents list) to enable offline use; this data is
          stored only on your device and is never sent anywhere.
        </Section>

        <Section title="Third-Party Services">
          CloakIMG does not integrate any third-party analytics, advertising, or data-collection
          services. The application is hosted as a static site; standard web-server access logs (IP
          address, requested path, timestamp) may be retained by the hosting provider for security
          and operational purposes, subject to that provider&apos;s own privacy policy. No image
          content is included in these logs.
        </Section>

        <Section title="Open Source">
          CloakIMG is open source. You can inspect the full source code at{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-coral-600 hover:underline dark:text-coral-400"
          >
            {GITHUB_REPO_DISPLAY}
          </a>{" "}
          to verify these claims independently.
        </Section>

        <Section title="Your Rights (GDPR & Similar)">
          Because we do not collect any personal data, there is nothing for us to disclose, correct,
          or delete on your behalf. If you have questions about this policy, you can reach out via{" "}
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-coral-600 hover:underline dark:text-coral-400"
          >
            GitHub Issues
          </a>
          .
        </Section>

        <Section title="Changes to This Policy">
          If this policy ever changes, the updated version will be published here with a revised
          date at the top. Given the privacy-by-design nature of this application, significant
          changes are unlikely.
        </Section>
      </div>

      <div className="cloak-dialog__footer px-6 sm:px-7">
        <button type="button" onClick={dismiss} className="btn btn-primary btn-sm">
          Got it
        </button>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13.5px] font-semibold text-text">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
