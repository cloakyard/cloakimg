// Toasts.tsx — Tiny ephemeral status notifications. Used to confirm
// destructive bakes ("Adjust applied", "Resized to 1080×1080"), long
// ops ("Removing background…"), and ambient feedback ("Draft saved").
//
// The toast tray is mounted once near the top of the editor shell,
// and every component speaks to it through the global `toast()` /
// `showToast()` helpers — no prop drilling.

import { useEffect, useState } from "react";
import { I } from "../icons";

export type ToastTone = "info" | "success" | "warn";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Lifetime in ms. Undefined → auto-pick by tone. */
  durationMs?: number;
}

let nextId = 1;
const subscribers = new Set<(t: Toast[]) => void>();
let queue: Toast[] = [];

function publish() {
  for (const cb of subscribers) cb(queue);
}

/** Push a toast onto the tray. Returns the id so callers can dismiss
 *  it manually (e.g. a long-running op that started a "in progress"
 *  toast and wants to swap it for a "done" toast). */
export function showToast(message: string, tone: ToastTone = "info", durationMs?: number): number {
  const id = nextId++;
  queue = [...queue, { id, message, tone, durationMs }];
  publish();
  const ttl = durationMs ?? (tone === "warn" ? 5000 : 2400);
  if (Number.isFinite(ttl)) {
    setTimeout(() => dismissToast(id), ttl);
  }
  return id;
}

export function dismissToast(id: number) {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) publish();
}

/** Drop-in alias so call sites read more naturally:
 *  `toast.success("Saved")`, `toast.warn("Couldn't open file")`. */
export const toast = {
  info: (msg: string, ms?: number) => showToast(msg, "info", ms),
  success: (msg: string, ms?: number) => showToast(msg, "success", ms),
  warn: (msg: string, ms?: number) => showToast(msg, "warn", ms),
};

export function ToastTray() {
  const [items, setItems] = useState<Toast[]>(queue);
  useEffect(() => {
    const fn = (t: Toast[]) => setItems(t);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-150 flex -translate-x-1/2 flex-col items-center gap-1.5"
    >
      {items.map((t) => (
        <ToastChip key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastChip({ toast: t }: { toast: Toast }) {
  const Icon =
    t.tone === "success"
      ? I.Check
      : t.tone === "warn"
        ? I.ShieldCheck // closest icon we already ship; intentionally not alarming
        : I.Layers;
  const colour =
    t.tone === "success"
      ? "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-900/30 dark:text-emerald-200"
      : t.tone === "warn"
        ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-900/30 dark:text-amber-200"
        : "border-border bg-surface text-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-text";
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium shadow-[0_4px_14px_-4px_rgba(0,0,0,0.18)] ${colour}`}
    >
      <Icon size={12} />
      <span>{t.message}</span>
      <button
        type="button"
        onClick={() => dismissToast(t.id)}
        aria-label="Dismiss"
        className="ml-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-60 hover:opacity-100"
      >
        <I.X size={9} />
      </button>
    </div>
  );
}
