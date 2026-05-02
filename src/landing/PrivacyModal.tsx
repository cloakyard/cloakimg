// PrivacyModal.tsx — Inline popup version of the privacy policy.
// CloakPDF renders this as a full page; CloakIMG keeps the landing
// surface free of routes, so we surface the same copy in a modal.

import { useEffect } from "react";
import { I } from "../icons";
import { ModalCloseButton, ModalFrame } from "../ModalFrame";

interface Props {
  onClose: () => void;
}

const REPO_URL = "https://github.com/sumitsahoo/cloakimg";

export function PrivacyModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalFrame onClose={onClose} labelledBy="privacy-title">
      <div className="flex items-start gap-4 px-6 pt-6 pb-3 sm:px-7 sm:pt-7">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral-50 text-coral-600 dark:bg-coral-900/30 dark:text-coral-300">
          <I.ShieldCheck size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="privacy-title"
            className="text-[19px] font-semibold tracking-[-0.015em] text-text dark:text-dark-text"
          >
            Privacy Policy
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted dark:text-dark-text-muted">
            Last updated: April 30, 2026
          </p>
        </div>
        <ModalCloseButton onClose={onClose} label="Close privacy policy" />
      </div>

      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto border-t border-border-soft px-6 py-5 text-[13px] leading-[1.6] text-text-muted sm:px-7 dark:border-dark-border-soft dark:text-dark-text-muted">
        <Section title="Overview">
          CloakIMG is a free, open-source photo editor that runs entirely in your web browser. We
          are committed to your privacy. This policy explains what data we collect (spoiler: none)
          and how the application works.
        </Section>

        <Section title="Your Photos Stay on Your Device">
          All image processing — cropping, retouching, redaction, adjustments, filters, frames,
          export, every operation — is performed locally in your browser. Your photos are{" "}
          <strong className="text-text dark:text-dark-text">never uploaded</strong> to any server.
          No image content, metadata, or document data is transmitted over the network.
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
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-coral-600 hover:underline dark:text-coral-400"
          >
            github.com/sumitsahoo/cloakimg
          </a>{" "}
          to verify these claims independently.
        </Section>

        <Section title="Your Rights (GDPR & Similar)">
          Because we do not collect any personal data, there is nothing for us to disclose, correct,
          or delete on your behalf. If you have questions about this policy, you can reach out via{" "}
          <a
            href={`${REPO_URL}/issues`}
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

      <div className="flex items-center justify-end gap-2 border-t border-border-soft px-6 py-4 sm:px-7 dark:border-dark-border-soft">
        <button type="button" onClick={onClose} className="btn btn-primary btn-sm">
          Got it
        </button>
      </div>
    </ModalFrame>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13.5px] font-semibold text-text dark:text-dark-text">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
