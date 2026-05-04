// Header.tsx — Sticky frosted header used on the landing page. The
// editor renders its own TopBar so this is landing-only.
//
// Layout: brand logo+wordmark on the left; right side carries a
// privacy chip + GitHub source link. Mirrors the CloakPDF Layout
// header so the Cloakyard family reads consistently.

import type { ReactNode } from "react";
import { BrandMark, I } from "../components/icons";
import { GITHUB_REPO_URL } from "../constants/links";

interface Props {
  right?: ReactNode;
  compact?: boolean;
}

export function Header({ right, compact = false }: Props) {
  return (
    <header
      className={`sticky top-0 z-50 flex items-center gap-3.5 border-b border-border-soft bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 dark:border-dark-border-soft dark:bg-dark-surface-glass ${
        compact ? "px-2.5 py-2.5" : "px-4 py-3"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <BrandMark size={compact ? 32 : 40} />
        <div
          className="logo-wordmark"
          style={{ fontSize: compact ? 17 : 19, letterSpacing: "-0.025em" }}
        >
          Cloak<span>IMG</span>
        </div>
      </div>
      <div className="flex-1" />
      {right ?? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-1 text-[12.5px] font-medium tracking-tight text-text-muted whitespace-nowrap dark:text-dark-text-muted">
            <I.ShieldCheck size={14} stroke={2} />
            <span className="sm:hidden">Private</span>
            <span className="hidden sm:inline lg:hidden">100% Private</span>
            <span className="hidden lg:inline">100% Private · Open Source</span>
          </span>
          <span aria-hidden="true" className="h-5 w-px bg-border dark:bg-dark-border" />
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted no-underline transition-colors hover:bg-slate-900/5 hover:text-text dark:text-dark-text-muted dark:hover:bg-white/5 dark:hover:text-dark-text"
          >
            <I.Github size={18} />
          </a>
        </div>
      )}
    </header>
  );
}
