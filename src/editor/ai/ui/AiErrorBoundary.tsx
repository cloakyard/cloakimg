// AiErrorBoundary.tsx — Localized error boundary for the AI surface.
//
// Why a local boundary on top of the global one in src/components:
// the global boundary's only recovery is "Go to home", which navigates
// away from the editor. That's the right call for fabric / canvas
// crashes that leave the editor in an unrecoverable state, but it's
// the wrong call for an AI subsystem error (model fetch failed, ONNX
// session crashed, etc.) — those should only blank the AI UI, not
// throw the user out of an unrelated editing session.
//
// This boundary catches render errors thrown specifically by AI UI
// components (MaskConsentHost / dialogs / status chips), routes them
// through aiLog so they're captured for debugging, and renders an
// empty fragment as the fallback. The user can still tap an AI
// affordance again to retry — the next render mounts a fresh boundary
// state.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { aiLog } from "../log";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AiErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    aiLog.error("consent", "AI UI subtree threw during render", error, {
      componentStack: info.componentStack ?? "",
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      // Render nothing — the rest of the editor stays mounted. The next
      // user-driven AI interaction (panel re-mount, scope toggle) will
      // remount this boundary's children with a fresh state machine.
      return null;
    }
    return this.props.children;
  }
}
