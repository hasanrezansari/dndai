import { GlassCard } from "@/components/ui/glass-card";

interface ClassCardProps {
  icon: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}

export function ClassCard({ icon, label, selected, onClick }: ClassCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        shrink-0 min-w-[88px] min-h-[44px] rounded-[var(--radius-card)] text-left
        transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
        active:scale-[0.98]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
        ${selected ? "ring-2 ring-[var(--color-gold-rare)] shadow-[0_0_20px_rgba(212,175,55,0.35)]" : "ring-0 ring-transparent"}
      `.trim()}
    >
      <GlassCard
        className={`
          flex flex-col items-center justify-center gap-1 px-2 py-3 h-[100px] w-[88px]
          ${selected ? "glow-gold" : ""}
        `.trim()}
      >
        <span className="text-3xl leading-none select-none" aria-hidden>
          {icon}
        </span>
        <span className="text-xs font-medium text-center text-[var(--color-silver-muted)] leading-tight px-0.5">
          {label}
        </span>
      </GlassCard>
    </button>
  );
}
