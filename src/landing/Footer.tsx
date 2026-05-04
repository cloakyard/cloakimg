// Footer.tsx — Landing-only footer with two bento cards (How it works
// + Cloakyard family promo) and a slim attribution row underneath.
// Mirrors the CloakPDF Layout footer so the Cloakyard family reads
// consistently across products.
//
// The editor never mounts this — it lives only on the landing page so
// the working surface stays clean.

import { I } from "../components/icons";
import { GITHUB_AUTHOR_URL, GITHUB_LICENSE_URL, GITHUB_ORG_URL } from "../constants/links";

declare const __APP_VERSION__: string;

interface Props {
  onPrivacy?: () => void;
}

const STEPS = [
  {
    n: 1,
    title: "Open an image",
    description: "Drag a photo onto the canvas, or start from a blank document at any preset size.",
  },
  {
    n: 2,
    title: "Edit in the browser",
    description:
      "Crop, retouch, redact, adjust, filter, frame and more — every byte stays on your device.",
  },
  {
    n: 3,
    title: "Export & download",
    description: "JPEG, PNG, WebP. Strip metadata on export. No watermarks, no sign-up, no queue.",
  },
] as const;

export function Footer({ onPrivacy }: Props) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

  return (
    <footer
      className="relative mt-auto"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-[1100px] px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-7">
        <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* Bento cards. Corner glow is painted as a radial-gradient
              background-image, not an absolute-positioned blurred
              child div. The blurred-child approach hit an iOS Safari
              bug — `overflow-hidden + rounded-2xl + backdrop-filter`
              parent fails to clip a `filter: blur()` child to the
              rounded corner, so the corner where the blob sat read as
              squared off (isolation: isolate / transform: translateZ(0)
              didn't help). A bg-image radial gradient produces the
              same soft corner glow without introducing any filtered
              child to clip — no bug to work around. */}
          {/* How it works card — coral glow anchored top-right */}
          <div
            className="relative flex flex-col rounded-2xl border border-border-soft bg-surface-glass p-5 backdrop-blur-md dark:border-dark-border-soft dark:bg-dark-surface-glass"
            style={{
              backgroundImage:
                "radial-gradient(280px 280px at 100% 0%, rgba(245, 97, 58, 0.18) 0%, rgba(245, 97, 58, 0.06) 38%, transparent 68%)",
            }}
          >
            <div className="relative">
              <div className="t-eyebrow">How it works</div>
              <h3 className="t-title mt-2 text-text sm:text-[19px] dark:text-dark-text">
                From open to export, in three steps.
              </h3>
            </div>
            <ol className="relative mt-4 flex flex-col gap-3 list-none p-0 m-0">
              {STEPS.map((step) => (
                <li key={step.n} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-coral-100 bg-coral-50 text-xs font-semibold leading-none tabular-nums text-coral-700 dark:border-coral-900/60 dark:bg-coral-900/30 dark:text-coral-300"
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold tracking-[-0.005em] text-text dark:text-dark-text">
                      {step.title}
                    </div>
                    <div className="text-[12.5px] leading-[1.55] text-text-muted dark:text-dark-text-muted">
                      {step.description}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Cloakyard family promo card — coral glow anchored bottom-left */}
          <a
            href={GITHUB_ORG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex flex-col justify-between rounded-2xl border border-border-soft bg-surface-glass p-5 text-inherit no-underline backdrop-blur-md transition-colors hover:border-coral-500/45 dark:border-dark-border-soft dark:bg-dark-surface-glass"
            style={{
              backgroundImage:
                "radial-gradient(280px 280px at 0% 100%, rgba(245, 97, 58, 0.14) 0%, rgba(245, 97, 58, 0.05) 38%, transparent 68%)",
            }}
          >
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/icons/cloakyard.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-7 drop-shadow-sm"
                  />
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted dark:text-dark-text-muted">
                    Part of
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-border-soft bg-slate-900/4 px-2 py-px font-mono text-[10px] tabular-nums tracking-tight text-text-muted dark:border-dark-border-soft dark:bg-white/5 dark:text-dark-text-muted">
                  CloakIMG v{version}
                </span>
              </div>
              <h4 className="t-title mt-2.5 text-text dark:text-dark-text">Cloakyard</h4>
              <p className="t-caption mt-1 dark:text-dark-text-muted">
                A family of privacy-focused tools that keep your data on your device.
              </p>
            </div>
            <span className="relative mt-3 inline-flex items-center gap-1 text-xs font-medium text-coral-600 dark:text-coral-400">
              Explore
              <I.ArrowUpRight
                size={12}
                style={{ transition: "transform 150ms" }}
                className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </a>
        </div>

        {/* Slim attribution row */}
        <div className="flex flex-col gap-2 border-t border-border-soft pt-4 text-[12.5px] text-text-muted sm:flex-row sm:items-center sm:gap-4 dark:border-dark-border-soft dark:text-dark-text-muted">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>Built with care by</span>
            <a
              href={GITHUB_AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-text no-underline transition-colors hover:text-coral-600 dark:text-dark-text dark:hover:text-coral-400"
            >
              Sumit Sahoo
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:ml-auto">
            {onPrivacy && (
              <>
                <button
                  type="button"
                  onClick={onPrivacy}
                  className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-[inherit] text-[12.5px] text-text-muted transition-colors hover:text-coral-600 dark:text-dark-text-muted dark:hover:text-coral-400"
                >
                  <I.ShieldCheck size={14} />
                  Privacy
                </button>
                <span aria-hidden="true">·</span>
              </>
            )}
            <a
              href={GITHUB_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-text-muted no-underline transition-colors hover:text-coral-600 dark:text-dark-text-muted dark:hover:text-coral-400"
            >
              <I.Scale size={14} />
              <span>MIT licensed</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
