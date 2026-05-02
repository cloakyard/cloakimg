// ReloadPrompt.tsx — PWA service-worker update banner. Shown on the
// landing page when a new SW version is available, or briefly when the
// app first becomes installable for offline use.
//
// Mirrors the CloakPDF UX: a glassy floating pill at the bottom-center
// with an "Update" button when needRefresh, and a self-dismissing
// "ready offline" toast on first install.

import { useCallback, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { I } from "../icons";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELOAD_FALLBACK_MS = 1500;

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      setInterval(async () => {
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

  return (
    <div
      className="fixed bottom-6 left-1/2 z-100 -translate-x-1/2"
      style={{ maxWidth: "calc(100vw - 32px)" }}
    >
      <div
        className="relative flex items-center gap-3 rounded-2xl border border-border-soft bg-surface-glass py-2.5 pr-3.5 pl-4.5 text-text backdrop-blur-md backdrop-saturate-150 dark:border-dark-border-soft dark:bg-dark-surface-glass dark:text-dark-text"
        style={{ boxShadow: "0 12px 32px -8px rgba(30,18,10,0.25)" }}
      >
        <span className="text-[13px] font-medium">
          {needRefresh ? "A new version is available." : "App ready to work offline."}
        </span>
        {needRefresh && (
          <button
            type="button"
            onClick={handleUpdate}
            className="btn btn-primary"
            style={{ fontSize: 12.5, padding: "6px 14px", borderRadius: 999 }}
          >
            <I.Refresh size={13} /> Update
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="inline-flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:bg-slate-900/6 hover:text-text dark:text-dark-text-muted dark:hover:bg-white/10 dark:hover:text-dark-text"
        >
          <I.X size={14} />
        </button>
      </div>
    </div>
  );
}
