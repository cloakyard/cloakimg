// ErrorBoundary.tsx — Unified render-error catch surface.
//
// One component covers the three distinct recovery shapes the app
// needs, selected via the `variant` prop:
//
//   • "modal" (default) — fixed full-screen sheet with error details,
//     Copy button, GitHub issue link, and a "Go to home" primary
//     action. The app-level catch-all in `main.tsx` uses this — it's
//     for unrecoverable failures where the safest option is to bounce
//     the user back to landing.
//
//   • "card" — absolute-inset card inside a positioned parent with up
//     to two configurable action buttons. UnifiedEditor wraps the
//     editor subtree in this so a render error inside a tool panel /
//     fabric internal / AI worker callback recovers in place ("Try
//     again" remounts the children) without dropping the user back
//     to landing. The retry-via-key-bump is built in: when the user
//     taps the primary action and no `onClick` is provided, the
//     boundary defaults to `defaultRetry` which bumps the children's
//     key.
//
//   • "silent" — renders null on error. Used for non-essential
//     subtrees (e.g. the AI consent host). A failure there shouldn't
//     blank out the rest of the editor; the next user-driven AI
//     interaction remounts the boundary's children with fresh state.
//
// Logging routes through `aiLog.error(subsystem, …)` so the
// `[ai] <subsystem>` prefix in the console groups failures by area
// (panel, consent, runtime, …). The "modal" variant also keeps the
// legacy `[CloakIMG] Unhandled render error` prefix that older bug
// reports may grep for.
//
// Built standalone (not via ModalFrame) because the boundary must
// keep working even if shared infrastructure is what threw.

import { Component, createRef, Fragment, type ErrorInfo, type ReactNode } from "react";
import { I } from "./icons";
import { GITHUB_NEW_ISSUE_URL } from "../constants/links";
import { aiLog } from "../editor/ai/log";

/** Subsystem tag for log routing. Mirrors the tag list in
 *  `editor/ai/log.ts` so each render-error log lands under the same
 *  console filter as the manual `aiLog.*` calls in that area. */
type Subsystem = "panel" | "consent" | "runtime" | "worker" | "segment" | "subjectMask" | "preview";

interface ActionConfig {
  label: string;
  icon?: ReactNode;
  /** Click handler. Omitted in card variant means "use the default
   *  retry behaviour" (bumps the retry key, remounts children). */
  onClick?: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Presentation mode. Defaults to "modal" for back-compat with the
   *  app-level usage in main.tsx. */
  variant?: "modal" | "card" | "silent";
  /** Override for the surface title. */
  title?: string;
  /** Override for the body description. Falls back to a variant-
   *  appropriate default when omitted. */
  description?: string;
  /** Primary action button. In modal variant, omitting falls back to
   *  the legacy "Go to home" + window.location.assign('/'). In card
   *  variant, omitting falls back to a key-bump retry. Silent ignores
   *  this entirely. */
  primaryAction?: ActionConfig;
  /** Optional secondary action. Renders below primary in card variant
   *  and is ignored in modal (which already exposes Copy + GitHub).
   *  Silent ignores this entirely. */
  secondaryAction?: ActionConfig;
  /** Subsystem tag for aiLog routing. Defaults to "panel" — most
   *  editor render failures originate in a tool panel. */
  subsystem?: Subsystem;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
  /** Bumped on retry so React tears down + remounts the children
   *  fresh. Wrapped in a keyed Fragment in render() so toggling this
   *  is enough to re-run mount effects in the recovered subtree. */
  retryKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    componentStack: "",
    copied: false,
    retryKey: 0,
  };
  private primaryRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const subsystem = this.props.subsystem ?? "panel";
    const variant = this.props.variant ?? "modal";
    this.setState({ componentStack: info.componentStack ?? "" });
    aiLog.error(subsystem, `${variant} boundary caught render error`, error, {
      componentStack: info.componentStack ?? "",
      variant,
    });
    // Preserve the legacy console prefix for the app-level catch so
    // existing bug reports referencing `[CloakIMG] Unhandled render
    // error` still grep-match.
    if (variant === "modal") {
      console.error("[CloakIMG] Unhandled render error:", error, info);
    }
  }

  componentDidUpdate(_: ErrorBoundaryProps, prev: ErrorBoundaryState) {
    if (!prev.error && this.state.error) {
      this.primaryRef.current?.focus();
    }
  }

  defaultGoHome = () => {
    this.setState({ error: null, componentStack: "", copied: false });
    // Navigate to the app root rather than reloading — if the error
    // was triggered by a route or query state, a plain reload would
    // re-throw.
    window.location.assign(`${window.location.origin}/`);
  };

  defaultRetry = () => {
    // Reset the error state and bump retryKey so the keyed Fragment
    // around children remounts the entire subtree. Most transient
    // render errors (a stale ref, a fabric race, an AI callback that
    // resolved against an unmounted tree) clear on remount.
    this.setState((prev) => ({
      error: null,
      componentStack: "",
      copied: false,
      retryKey: prev.retryKey + 1,
    }));
  };

  handleCopy = async () => {
    const payload = buildDetailsText(this.state.error, this.state.componentStack);
    try {
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1800);
    } catch {
      // Clipboard denied — select the <pre> so the user can copy manually.
      const pre = document.getElementById("ci-error-details");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  render() {
    const { error, componentStack, copied, retryKey } = this.state;
    const variant = this.props.variant ?? "modal";

    if (!error) {
      // Wrapping in a keyed Fragment lets the retry handler remount
      // the entire subtree by bumping retryKey. Without this, React
      // would reconcile against the existing tree and a sticky error
      // state would re-fire immediately on the next render.
      return <Fragment key={retryKey}>{this.props.children}</Fragment>;
    }

    if (variant === "silent") {
      // Render nothing — the rest of the page stays mounted. The next
      // user-driven interaction (panel re-mount, scope toggle) will
      // remount the boundary's children with fresh state.
      return null;
    }

    if (variant === "card") return this.renderCard(error);
    return this.renderModal(error, componentStack, copied);
  }

  private renderCard(error: Error): ReactNode {
    // Card variant: small recovery surface positioned absolutely
    // inside a positioned parent (UnifiedEditor's <main>). Two action
    // slots — primary defaults to "Try again" (key bump), secondary
    // is whatever the caller passes (typically "Back to start").
    const primary = this.props.primaryAction;
    const primaryOnClick = primary?.onClick ?? this.defaultRetry;
    const primaryLabel = primary?.label ?? "Try again";
    const primaryIcon = primary?.icon ?? <I.Refresh size={14} />;

    const secondary = this.props.secondaryAction;
    const title = this.props.title ?? "The editor hit a snag";
    const description =
      this.props.description ??
      "Your image is still on this device — nothing was uploaded. Try the action again, or head back to start to pick a fresh image.";

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cloak-eb-title"
        className="absolute inset-0 z-[200] flex items-center justify-center bg-page-bg/90 px-6 backdrop-blur-md dark:bg-dark-page-bg/90"
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-7 py-8 text-center shadow-xl dark:border-dark-border dark:bg-dark-surface">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-coral-500/12 text-coral-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-coral-500/15" />
            <I.Triangle size={26} stroke={1.75} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div id="cloak-eb-title" className="text-[17px] font-semibold tracking-tight">
              {title}
            </div>
            <div className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              {description}
            </div>
            {error.message && (
              <div className="t-mono mt-2 max-h-20 overflow-auto rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-left text-[11px] wrap-break-word text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted">
                {error.message}
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              ref={this.primaryRef}
              type="button"
              onClick={primaryOnClick}
              className="btn btn-primary btn-sm w-full justify-center"
            >
              {primaryIcon}
              {primaryLabel}
            </button>
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick ?? this.defaultRetry}
                className="btn btn-secondary btn-sm w-full justify-center"
              >
                {secondary.icon}
                {secondary.label}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  private renderModal(error: Error, componentStack: string, copied: boolean): ReactNode {
    // Modal variant: fixed full-screen sheet. Default primary is "Go
    // to home"; callers can override but typically don't.
    const details = buildDetailsText(error, componentStack);
    const issueUrl = buildGithubIssueUrl(error, componentStack);
    const title = this.props.title ?? "Something broke unexpectedly";
    const primary = this.props.primaryAction;
    const primaryOnClick = primary?.onClick ?? this.defaultGoHome;
    const primaryLabel = primary?.label ?? "Go to home";
    const primaryIcon = primary?.icon ?? <I.Refresh size={14} />;

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ci-error-title"
        className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-6"
        style={{
          background: "rgba(20,14,8,0.32)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div
          className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl border border-border-soft bg-surface/85 backdrop-blur-xl backdrop-saturate-150 sm:max-h-[min(820px,calc(100svh-48px))] sm:max-w-160 sm:rounded-3xl dark:border-dark-border dark:bg-dark-surface/85"
          style={{ boxShadow: "var(--shadow-modal)" }}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border-soft px-5 pt-5 pb-4 sm:gap-3.5 sm:px-6 sm:pt-6 dark:border-dark-border-soft">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
              <I.AlertTriangle size={20} stroke={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="ci-error-title" className="t-headline text-[17px] sm:text-[18px]">
                {title}
              </h2>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-text-muted sm:text-[13px] dark:text-dark-text-muted">
                Your image is still on this device — nothing was uploaded. Send the details below
                and we'll fix the bug.
              </p>
            </div>
          </div>

          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="t-eyebrow text-[10px] text-text-muted dark:text-dark-text-muted">
                Error details
              </span>
              <button
                type="button"
                onClick={this.handleCopy}
                aria-label="Copy error details"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2 py-1 text-[11.5px] font-medium text-text-muted transition-colors hover:border-border hover:text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted dark:hover:text-dark-text"
              >
                {copied ? (
                  <>
                    <I.Check size={13} className="text-coral-600 dark:text-coral-300" />
                    Copied
                  </>
                ) : (
                  <>
                    <I.Copy size={13} />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre
              id="ci-error-details"
              className="t-mono m-0 rounded-lg border border-border-soft bg-page-bg p-3 text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text"
            >
              {details}
            </pre>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-soft bg-page-bg/55 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4 sm:pb-4 dark:border-dark-border-soft dark:bg-dark-page-bg/55">
            <a
              href={issueUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-secondary btn-sm justify-center"
            >
              <I.Github size={14} />
              Report on GitHub
            </a>
            <button
              ref={this.primaryRef}
              type="button"
              onClick={primaryOnClick}
              className="btn btn-primary btn-sm justify-center"
            >
              {primaryIcon}
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function buildDetailsText(error: Error | null, componentStack: string): string {
  if (!error) return "";
  const parts = [
    `Message: ${error.message || "(no message)"}`,
    error.name ? `Name:    ${error.name}` : "",
    `Where:   ${window.location.pathname}${window.location.search}`,
    `When:    ${new Date().toISOString()}`,
    `Agent:   ${navigator.userAgent}`,
    "",
    "Stack:",
    error.stack ?? "(no stack)",
  ];
  if (componentStack.trim()) {
    parts.push("", "Component stack:", componentStack.trim());
  }
  return parts.filter((line) => line !== "").join("\n");
}

function buildGithubIssueUrl(error: Error | null, componentStack: string): string {
  const summary = (error?.message ?? "Unknown error").replace(/\s+/g, " ").slice(0, 110);
  const title = `[bug] ${summary}`;
  const body = [
    "## What happened",
    "_What were you doing when this error appeared (which tool, which file format, etc.)?_",
    "",
    "## Error details",
    "```",
    buildDetailsText(error, componentStack),
    "```",
  ].join("\n");
  const params = new URLSearchParams({ title, body, labels: "bug" });
  return `${GITHUB_NEW_ISSUE_URL}?${params.toString()}`;
}
