interface ClassCardProps {
  icon: string;
  imageUrl?: string;
  label: string;
  role: string;
  selected: boolean;
  onClick: () => void;
}

export function ClassCard({
  icon,
  imageUrl,
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
          relative flex flex-col items-center justify-end gap-1.5 px-3 py-3 h-[124px] w-[108px]
          rounded-[var(--radius-card)] border transition-all duration-300
          ${
            selected
              ? "bg-[var(--surface-high)] selected-glow border-[var(--color-gold-rare)]/40"
              : "bg-[var(--color-midnight)] border-[var(--border-ui)] hover:bg-[var(--surface-container)] hover:border-[var(--border-ui-strong)]"
          }
        `.trim()}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/35 to-transparent" />
        <span className="relative text-2xl leading-none select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]" aria-hidden>
          {icon}
        </span>
        <span
          className={`relative text-xs font-bold text-center leading-tight ${
            selected
              ? "text-[var(--color-gold-rare)]"
              : "text-[var(--color-silver-muted)]"
          }`}
        >
          {label}
        </span>
        <span className="relative text-[9px] uppercase tracking-[0.15em] text-[var(--outline)] text-center font-bold">
          {role}
        </span>
      </div>
    </button>
  );
}
