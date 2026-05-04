// ReloadPrompt.tsx — PWA service-worker update banner. Shown on the
// landing page when a new SW version is available, or briefly when the
// app first becomes installable for offline use.
//
// A translucent floating card at the bottom-center matching the modal
// aesthetic, with an "Update" button when needRefresh and a
// self-dismissing "ready offline" toast on first install.

import { useCallback, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { I } from "../components/icons";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELOAD_FALLBACK_MS = 1500;

export function ReloadPrompt() {
  // Stash the SW update interval so the unmount cleanup can clear it.
  // `useRegisterSW`'s onRegisteredSW callback fires once outside React's
  // lifecycle, so we need our own ref to plumb the timer ID back out.
  const updateIntervalRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
      }
      updateIntervalRef.current = window.setInterval(async () => {
        if (registration.installing || !navigator) return;
        if ("connection" in navigator && !navigator.onLine) return;
        try {
          const resp = await fetch(swUrl, { cache: "no-store" });
          if (resp.status === 200) await registration.update();
        } catch {
          // Network blip — try again next interval.
        }
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    return () => {
      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, []);

  // Edge cases on freshly-launched origins can drop workbox-window's
  // controlling event. Fall back to an explicit reload so the Update
  // button is never a no-op.
  const handleUpdate = useCallback(() => {
    void updateServiceWorker(true);
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  }, [updateServiceWorker]);

  const close = useCallback(() => {
    setOfflineReady(false);
    setNeedRefresh(false);
  }, [setOfflineReady, setNeedRefresh]);

  useEffect(() => {
    if (!offlineReady) return;
    const id = setTimeout(close, 4000);
    return () => clearTimeout(id);
  }, [offlineReady, close]);

  if (!offlineReady && !needRefresh) return null;

  const Icon = needRefresh ? I.Refresh : I.ShieldCheck;
  const title = needRefresh ? "Update available" : "Ready offline";
  const body = needRefresh
    ? "A new version of CloakIMG is ready to install."
    : "CloakIMG is now installed for offline use.";

  return (
    <div
      className="fixed right-4 bottom-4 left-4 z-100 flex justify-center sm:right-6 sm:bottom-6 sm:left-auto sm:justify-end"
      role="status"
      aria-live="polite"
    >
      <div
        className="relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border border-border-soft bg-surface/85 p-4 text-text backdrop-blur-xl backdrop-saturate-150 sm:w-auto sm:min-w-80 dark:border-dark-border dark:bg-dark-surface/85 dark:text-dark-text"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-50 text-coral-600 dark:bg-coral-900/30 dark:text-coral-300">
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-text dark:text-dark-text">
            {title}
          </p>
          <p className="mt-0.5 text-[12px] leading-[1.45] text-text-muted dark:text-dark-text-muted">
            {body}
          </p>
          {needRefresh && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={close} className="btn btn-ghost btn-sm">
                Later
              </button>
              <button type="button" onClick={handleUpdate} className="btn btn-primary btn-sm">
                <I.Refresh size={13} /> Update
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:bg-slate-900/6 hover:text-text dark:text-dark-text-muted dark:hover:bg-white/10 dark:hover:text-dark-text"
        >
          <I.X size={14} />
        </button>
      </div>
    </div>
  );
}
