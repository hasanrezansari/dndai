"use client";

import Link from "next/link";
import { useCallback } from "react";
import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
  action?: { label: string; href: string };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id"> & { id?: string }) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? crypto.randomUUID();
    const duration = t.duration ?? 3000;
    set((s) => ({
      toasts: [...s.toasts, { ...t, id, duration }],
    }));
    if (duration > 0) {
      window.setTimeout(() => get().dismiss(id), duration);
    }
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export type ToastOptions = {
  duration?: number;
  action?: { label: string; href: string };
};

export function useToast(): {
  toast: (
    message: string,
    type?: Toast["type"],
    options?: ToastOptions,
  ) => void;
  dismiss: (id: string) => void;
} {
  const push = useToastStore((s) => s.push);
  const dismissStore = useToastStore((s) => s.dismiss);
  const toast = useCallback(
    (message: string, type: Toast["type"] = "info", options?: ToastOptions) => {
      push({
        message,
        type,
        duration: options?.duration,
        action: options?.action,
      });
    },
    [push],
  );
  const dismiss = useCallback((id: string) => dismissStore(id), [dismissStore]);
  return { toast, dismiss };
}

function toastAccent(type: Toast["type"]): string {
  if (type === "error")
    return "border-[rgba(255,68,68,0.35)] shadow-[0_0_24px_rgba(139,37,0,0.25)]";
  if (type === "success")
    return "border-[rgba(212,175,55,0.35)] shadow-[0_0_20px_rgba(212,175,55,0.12)]";
  return "border-[rgba(27,77,110,0.45)] shadow-[0_0_20px_rgba(27,77,110,0.2)]";
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[100] flex flex-col gap-2 max-w-[min(100vw-2rem,360px)] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto text-left w-full rounded-[var(--radius-card)] glass px-4 py-3 text-sm text-[var(--color-silver-muted)] border animate-slide-up flex flex-col gap-2 ${toastAccent(t.type)}`}
        >
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="text-left w-full"
          >
            {t.message}
          </button>
          {t.action ? (
            <Link
              href={t.action.href}
              className="text-xs font-medium text-[var(--color-gold-rare)] underline underline-offset-2 hover:text-[var(--color-gold-support)] self-start"
              onClick={(e) => e.stopPropagation()}
            >
              {t.action.label}
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
