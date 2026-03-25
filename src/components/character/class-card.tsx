interface ClassCardProps {
  icon: string;
  label: string;
  role: string;
  selected: boolean;
  onClick: () => void;
}

export function ClassCard({
  icon,
  label,
  role,
  selected,
  onClick,
}: ClassCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        shrink-0 min-w-[96px] min-h-[44px] text-center
        transition-all duration-200
        active:scale-[0.95]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]
      `.trim()}
    >
      <div
        className={`
          flex flex-col items-center justify-center gap-2 px-3 py-4 h-[120px] w-[104px]
          rounded-[var(--radius-card)] border transition-all duration-300
          ${
            selected
              ? "bg-[var(--surface-high)] selected-glow border-[var(--color-gold-rare)]/40"
              : "bg-[var(--color-midnight)] border-[rgba(77,70,53,0.15)] hover:bg-[var(--surface-container)] hover:border-[rgba(77,70,53,0.3)]"
          }
        `.trim()}
      >
        <span className="text-3xl leading-none select-none" aria-hidden>
          {icon}
        </span>
        <span
          className={`text-xs font-bold text-center leading-tight ${
            selected
              ? "text-[var(--color-gold-rare)]"
              : "text-[var(--color-silver-muted)]"
          }`}
        >
          {label}
        </span>
        <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--outline)] text-center font-bold">
          {role}
        </span>
      </div>
    </button>
  );
}
