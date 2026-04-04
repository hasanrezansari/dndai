"use client";

import type { SessionUiMode } from "@/lib/state/session-ui-mode";

const MODES: {
  id: SessionUiMode;
  label: string;
  title: string;
}[] = [
  { id: "spotlight", label: "Spotlight", title: "Stage + beat strip" },
  { id: "classic", label: "Classic", title: "Scroll-first chat log" },
  {
    id: "chronicle",
    label: "Chronicle",
    title: "Turn-by-turn tome (grouped beats)",
  },
];

export interface SessionViewModeToggleProps {
  mode: SessionUiMode;
  onChange: (mode: SessionUiMode) => void;
}

export function SessionViewModeToggle({
  mode,
  onChange,
}: SessionViewModeToggleProps) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-[var(--radius-chip)] border border-[var(--border-ui-strong)] bg-[var(--color-deep-void)]/90 p-1"
      role="group"
      aria-label="Session layout"
    >
      {MODES.map(({ id, label, title }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            title={title}
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`min-h-[44px] rounded-[calc(var(--radius-chip)-4px)] px-1.5 py-2 text-[8px] font-black uppercase leading-tight tracking-[0.08em] transition-colors sm:px-2 sm:text-[9px] sm:tracking-[0.1em] ${
              active
                ? "bg-[var(--surface-high)] text-[var(--color-gold-rare)] shadow-[inset_0_0_0_1px_rgba(242,202,80,0.2)]"
                : "text-[var(--outline)] hover:text-[var(--color-silver-muted)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
