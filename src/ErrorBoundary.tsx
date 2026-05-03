// ErrorBoundary.tsx — Top-level catch for render failures (lazy-chunk
// load errors, exceptions inside the editor, fabric internals, etc.)
// that would otherwise unmount the React tree and leave a white page.
//
// Modeled after CloakResume's ErrorBoundary but adapted to the
// CloakIMG palette (coral accent, sunset chrome) and shared UI tokens.
// Built standalone (not via ModalFrame) because the boundary must
// keep working even if shared infrastructure is what threw.

import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { I } from "./icons";

const GITHUB_REPO = "sumitsahoo/cloakimg";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional override for the surface title. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: "", copied: false };
  private homeRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("[CloakIMG] Unhandled render error:", error, info);
  }

  componentDidUpdate(_: ErrorBoundaryProps, prev: ErrorBoundaryState) {
    if (!prev.error && this.state.error) {
      this.homeRef.current?.focus();
    }
  }

  // Navigate to the app root rather than reloading — if the error was
  // triggered by a route or query state, a plain reload would re-throw.
  handleGoHome = () => {
    this.setState({ error: null, componentStack: "", copied: false });
    window.location.assign(`${window.location.origin}/`);
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
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;

    const details = buildDetailsText(error, componentStack);
    const issueUrl = buildGithubIssueUrl(error, componentStack);
    const title = this.props.title ?? "Something broke unexpectedly";

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
              ref={this.homeRef}
              type="button"
              onClick={this.handleGoHome}
              className="btn btn-primary btn-sm justify-center"
            >
              <I.Refresh size={14} />
              Go to home
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
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}
