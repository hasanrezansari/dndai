"use client";

import {
  FEED_SEMANTIC_FILTERS,
  type FeedSemanticFilter,
} from "@/lib/feed/feed-semantic-filter";

export interface FeedSemanticChipsProps {
  value: FeedSemanticFilter;
  onChange: (next: FeedSemanticFilter) => void;
  className?: string;
}

export function FeedSemanticChips({
  value,
  onChange,
  className = "",
}: FeedSemanticChipsProps) {
  return (
    <div
      className={`scrollbar-hide flex shrink-0 gap-1.5 overflow-x-auto pb-1 ${className}`}
      role="tablist"
      aria-label="Feed filter"
    >
      {FEED_SEMANTIC_FILTERS.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`shrink-0 rounded-[var(--radius-pill)] border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-colors min-h-[36px] ${
              active
                ? "border-[var(--color-gold-rare)]/45 bg-[color-mix(in_srgb,var(--color-gold-rare)_12%,transparent)] text-[var(--color-gold-rare)]"
                : "border-[var(--border-ui)] bg-[var(--color-deep-void)]/60 text-[var(--outline)] hover:text-[var(--color-silver-dim)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
