interface StatPillProps {
  label: string;
  value: number;
  highlight?: boolean;
}

export function StatPill({ label, value, highlight }: StatPillProps) {
  const hi = highlight ?? value >= 16;
  return (
    <div
      className={`flex flex-col items-center justify-center px-3 py-4 min-h-[80px] rounded-[var(--radius-card)] border transition-colors ${
        hi
          ? "bg-[var(--surface-high)] border-[var(--color-gold-rare)]/30"
          : "bg-[var(--color-midnight)] border-[rgba(77,70,53,0.15)]"
      }`}
    >
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)] mb-1">
        {label}
      </span>
      <span
        className={`text-3xl font-black tabular-nums font-mono ${
          hi
            ? "text-[var(--color-gold-rare)]"
            : "text-[var(--color-silver-muted)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
