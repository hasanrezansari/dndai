"use client";

import type { SessionUiMode } from "@/lib/state/session-ui-mode";

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
      className="flex rounded-[var(--radius-chip)] border border-[rgba(77,70,53,0.25)] bg-[var(--color-obsidian)]/85 p-0.5 backdrop-blur-md"
      role="group"
      aria-label="Session layout"
    >
      {(
        [
          { id: "spotlight" as const, label: "Spotlight" },
          { id: "classic" as const, label: "Classic" },
        ] as const
      ).map(({ id, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`min-h-[44px] min-w-[44px] flex-1 rounded-[calc(var(--radius-chip)-2px)] px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition-colors ${
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
