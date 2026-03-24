"use client";

import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
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

export function useToast(): {
  toast: (message: string, type?: Toast["type"]) => void;
  dismiss: (id: string) => void;
} {
  const push = useToastStore((s) => s.push);
  const dismiss = useToastStore((s) => s.dismiss);
  return {
    toast: (message, type = "info") => {
      push({ message, type });
    },
    dismiss,
  };
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
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[min(100vw-2rem,360px)] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto text-left w-full rounded-[var(--radius-card)] glass px-4 py-3 text-sm text-[var(--color-silver-muted)] border animate-slide-up ${toastAccent(t.type)}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
