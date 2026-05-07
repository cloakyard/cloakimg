// EditorErrorBoundary.tsx — Editor-scoped recovery boundary.
//
// The global ErrorBoundary in src/components/ catches render errors
// anywhere in the tree, but its only recovery is "Go to home" which
// navigates the user back to the landing page — losing their place
// inside the editor. That's the right answer for a hard React tree
// failure, but for transient errors inside the editor surface (an
// AI worker callback that arrives mid-render, a fabric internal that
// throws on a single tool change, a model-download race) we'd rather
// offer in-place recovery first: "Try again" remounts just the
// editor children, "Back to start" routes through the editor's own
// onExit callback so the user lands on the landing page with their
// recents preserved instead of a hard reload.
//
// Sitting between UnifiedEditor and EditorProvider means the
// boundary's fallback UI does NOT have access to useEditor() — the
// provider is unmounted while we're showing the fallback. That's
// fine: the only handle the boundary needs is `onExit`, which the
// caller passes in directly.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { I } from "../components/icons";
import { aiLog } from "./ai/log";

interface Props {
  children: ReactNode;
  /** Called when the user picks "Back to start". Same callback the
   *  TopBar's exit-to-landing button uses, so behaviour is
   *  consistent. */
  onExit: () => void;
}

interface State {
  error: Error | null;
  retryKey: number;
}

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Route through aiLog rather than console.error so the same
    // `[ai] *` log filter that catches AI-subsystem messages also
    // surfaces editor-tree crashes when the user is debugging a
    // session. The "panel" subsystem is the closest fit — most
    // editor render failures originate in a tool panel.
    aiLog.error("panel", "editor subtree threw during render", error, {
      componentStack: info.componentStack ?? "",
    });
  }

  handleRetry = () => {
    // Bumping the retryKey re-mounts the children fresh — providers
    // re-initialise, lazy effects rerun, fabric/canvas references
    // are recreated. Most transient render errors clear on remount.
    this.setState((prev) => ({ error: null, retryKey: prev.retryKey + 1 }));
  };

  handleExit = () => {
    this.setState({ error: null, retryKey: this.state.retryKey + 1 });
    this.props.onExit();
  };

  override render(): ReactNode {
    const { error, retryKey } = this.state;
    if (!error) {
      // Wrapping in a keyed fragment lets handleRetry tear down +
      // remount the entire subtree by bumping the key — without it,
      // React would reconcile against the existing tree and a sticky
      // error state would re-fire immediately.
      return <div key={retryKey}>{this.props.children}</div>;
    }
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cloak-editor-error-title"
        className="absolute inset-0 z-[200] flex items-center justify-center bg-page-bg/90 px-6 backdrop-blur-md dark:bg-dark-page-bg/90"
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-7 py-8 text-center shadow-xl dark:border-dark-border dark:bg-dark-surface">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-coral-500/12 text-coral-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-coral-500/15" />
            <I.Triangle size={26} stroke={1.75} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div id="cloak-editor-error-title" className="text-[17px] font-semibold tracking-tight">
              The editor hit a snag
            </div>
            <div className="text-[13px] leading-relaxed text-text-muted dark:text-dark-text-muted">
              Your image is still on this device — nothing was uploaded. Try the action again, or
              head back to start to pick a fresh image.
            </div>
            {error.message && (
              <div className="t-mono mt-2 max-h-20 overflow-auto rounded-md border border-border-soft bg-page-bg px-2.5 py-1.5 text-left text-[11px] wrap-break-word text-text-muted dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text-muted">
                {error.message}
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="btn btn-primary btn-sm w-full justify-center"
            >
              <I.Refresh size={14} /> Try again
            </button>
            <button
              type="button"
              onClick={this.handleExit}
              className="btn btn-secondary btn-sm w-full justify-center"
            >
              <I.ArrowRight size={14} style={{ transform: "scaleX(-1)" }} />
              Back to start
            </button>
          </div>
        </div>
      </div>
    );
  }
}
