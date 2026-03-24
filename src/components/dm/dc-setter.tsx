"use client";

import { useCallback, useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";

export interface DcSetterProps {
  onSet: (dc: number) => void;
  onClose?: () => void;
}

const PRESETS = [
  { label: "Easy", value: 10 },
  { label: "Medium", value: 15 },
  { label: "Hard", value: 20 },
  { label: "Deadly", value: 25 },
] as const;

export function DcSetter({ onSet, onClose }: DcSetterProps) {
  const [value, setValue] = useState(15);

  const clamp = useCallback((n: number) => Math.min(30, Math.max(5, n)), []);

  const apply = useCallback(() => {
    onSet(clamp(value));
    onClose?.();
  }, [clamp, onClose, onSet, value]);

  return (
    <div className="glass-heavy space-y-3 rounded-[var(--radius-button)] border border-[var(--color-gold-rare)]/25 p-3 ring-1 ring-[var(--color-gold-rare)]/15">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setValue(p.value)}
            className="min-h-[44px] rounded-[var(--radius-chip)] border border-white/12 bg-[var(--color-midnight)]/90 px-3 text-sm text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/40 active:scale-[0.98]"
          >
            {p.label} ({p.value})
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm text-[var(--color-silver-muted)]">
        <span className="shrink-0">DC</span>
        <input
          type="number"
          min={5}
          max={30}
          value={value}
          onChange={(e) => setValue(clamp(Number(e.target.value) || 5))}
          className="min-h-[44px] w-full rounded-[var(--radius-chip)] border border-white/10 bg-[var(--color-deep-void)]/80 px-3 text-base text-[var(--color-silver-muted)] focus:border-[var(--color-gold-rare)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-rare)]/30"
        />
      </label>
      <div className="flex gap-2">
        <GoldButton
          type="button"
          size="md"
          className="min-h-[44px] flex-1"
          onClick={() => void apply()}
        >
          Set
        </GoldButton>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[var(--radius-button)] border border-white/12 px-4 text-sm text-[var(--color-silver-dim)] active:scale-[0.98]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
