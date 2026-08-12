// ReloadPrompt.tsx — PWA service-worker update banner. Shown on the
// landing page when a new SW version is available, or briefly when the
// core editor shell has been cached for offline use.
//
// A compact floating status instrument at the bottom edge, with an
// "Update" button when needRefresh and a
// self-dismissing cache-status toast on first install.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { I } from "../components/icons";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const UPDATE_CHECK_THROTTLE_MS = 60 * 1000;
const OFFLINE_READY_DISMISS_MS = 4000;
const RELOAD_FALLBACK_MS = 1500;
const TOAST_EXIT_MS = 160;
const REDUCED_TOAST_EXIT_MS = 120;

export function ReloadPrompt() {
  const updateIntervalRef = useRef<number | null>(null);
  const reloadFallbackRef = useRef<number | null>(null);
  const offlineDismissRef = useRef<number | null>(null);
  const promptExitRef = useRef<number | null>(null);
  const closeRequestedRef = useRef(false);
  const wasVisibleRef = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const swUrlRef = useRef("");
  const lastCheckRef = useRef(0);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const pointerInsideRef = useRef(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [closing, setClosing] = useState(false);

  const checkForUpdate = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration || registration.installing || !navigator.onLine) return;

    const now = Date.now();
    if (now - lastCheckRef.current < UPDATE_CHECK_THROTTLE_MS) return;
    lastCheckRef.current = now;

    try {
      const response = await fetch(swUrlRef.current, { cache: "no-store" });
      if (response.status === 200) await registration.update();
    } catch {
      // A network blip is non-fatal; retry on the next interval or refocus.
    }
  }, []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      swUrlRef.current = swUrl;
      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
      }
      updateIntervalRef.current = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);

    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      if (reloadFallbackRef.current !== null) {
        window.clearTimeout(reloadFallbackRef.current);
        reloadFallbackRef.current = null;
      }
      if (offlineDismissRef.current !== null) {
        window.clearTimeout(offlineDismissRef.current);
        offlineDismissRef.current = null;
      }
      if (promptExitRef.current !== null) {
        window.clearTimeout(promptExitRef.current);
        promptExitRef.current = null;
      }
    };
  }, [checkForUpdate]);

  // Edge cases on freshly-launched origins can drop workbox-window's
  // controlling event. Fall back to an explicit reload so the Update
  // button is never a no-op.
  const handleUpdate = useCallback(() => {
    if (isUpdating) return;
    setIsUpdating(true);
    void updateServiceWorker(true).catch(() => window.location.reload());
    reloadFallbackRef.current = window.setTimeout(
      () => window.location.reload(),
      RELOAD_FALLBACK_MS,
    );
  }, [isUpdating, updateServiceWorker]);

  const close = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setClosing(true);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    promptExitRef.current = window.setTimeout(
      () => {
        setOfflineReady(false);
        setNeedRefresh(false);
        promptExitRef.current = null;
      },
      reduceMotion ? REDUCED_TOAST_EXIT_MS : TOAST_EXIT_MS,
    );
  }, [setOfflineReady, setNeedRefresh]);

  const visible = offlineReady || needRefresh;
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      closeRequestedRef.current = false;
      setClosing(false);
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const clearOfflineDismiss = useCallback(() => {
    if (offlineDismissRef.current === null) return;
    window.clearTimeout(offlineDismissRef.current);
    offlineDismissRef.current = null;
  }, []);

  const scheduleOfflineDismiss = useCallback(() => {
    clearOfflineDismiss();
    if (!offlineReady || needRefresh) return;
    if (pointerInsideRef.current || promptRef.current?.contains(document.activeElement)) return;
    offlineDismissRef.current = window.setTimeout(close, OFFLINE_READY_DISMISS_MS);
  }, [clearOfflineDismiss, close, needRefresh, offlineReady]);

  useEffect(() => {
    scheduleOfflineDismiss();
    return clearOfflineDismiss;
  }, [clearOfflineDismiss, scheduleOfflineDismiss]);

  if (!visible) return null;

  const Icon = needRefresh ? I.Refresh : I.ShieldCheck;
  const title = needRefresh ? "Update available" : "Core editor cached";
  const body = needRefresh
    ? "Reload to apply the latest version of CloakIMG."
    : "The editor interface is available offline. AI models and some formats may still need a connection.";
  const dismissLabel = needRefresh ? "Dismiss update notification" : "Dismiss offline status";

  const pauseOfflineDismiss = () => {
    pointerInsideRef.current = true;
    clearOfflineDismiss();
  };

  const resumeOfflineDismiss = () => {
    pointerInsideRef.current = false;
    scheduleOfflineDismiss();
  };

  return (
    <div
      className="pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[var(--z-toast)] flex justify-center sm:right-[max(1.5rem,env(safe-area-inset-right))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:left-auto sm:justify-end"
      data-testid="pwa-toast-positioner"
    >
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {title}. {body}
      </span>
      <div
        ref={promptRef}
        data-state={needRefresh ? "update" : "offline"}
        className={`pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 text-text shadow-[var(--shadow-popover)] sm:w-auto sm:min-w-80 ${
          closing ? "ci-toast-exit" : "ci-toast-enter"
        }`}
        onPointerEnter={pauseOfflineDismiss}
        onPointerLeave={resumeOfflineDismiss}
        onFocusCapture={clearOfflineDismiss}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            scheduleOfflineDismiss();
          }
        }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-coral-200 bg-coral-50 text-coral-600 dark:border-coral-800 dark:bg-[var(--color-accent-soft)] dark:text-coral-400">
          <Icon size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-text">{title}</p>
          <p className="mt-0.5 text-[12px] leading-[1.45] text-text-muted">{body}</p>
          {needRefresh && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={isUpdating}
                className="btn btn-ghost btn-sm"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={isUpdating}
                aria-busy={isUpdating}
                className="btn btn-primary btn-sm"
              >
                <I.Refresh
                  size={13}
                  aria-hidden="true"
                  style={isUpdating ? { animation: "ci-spin 0.9s linear infinite" } : undefined}
                />
                {isUpdating ? "Updating…" : "Update"}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isUpdating}
          aria-label={dismissLabel}
          className="btn btn-ghost btn-icon-sm -mt-1 -mr-1"
        >
          <I.X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
