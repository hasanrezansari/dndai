import { GlassCard } from "@/components/ui/glass-card";

interface StatPillProps {
  label: string;
  value: number;
  highlight?: boolean;
}

export function StatPill({ label, value, highlight }: StatPillProps) {
  const hi = highlight ?? value >= 16;
  return (
    <GlassCard className="flex flex-col items-center justify-center px-3 py-3 min-h-[72px]">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-silver-dim)] font-medium">
        {label}
      </span>
      <span
        className={`text-2xl font-semibold tabular-nums text-data ${hi ? "text-[var(--color-gold-rare)]" : "text-[var(--color-silver-muted)]"}`}
      >
        {value}
      </span>
    </GlassCard>
  );
}
