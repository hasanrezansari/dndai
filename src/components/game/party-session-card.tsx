"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  /** Use for secondary / meta cards (carry, lens). */
  variant?: "primary" | "muted";
  /** Override default body typography (e.g. mixed layouts in one card). */
  contentClassName?: string;
};

/**
 * Shared card chrome for party gameplay only — keeps Scene / recap / meta visually distinct.
 */
export function PartySessionCard({
  title,
  children,
  className = "",
  variant = "primary",
  contentClassName = "text-sm leading-relaxed text-[var(--color-silver-muted)]",
}: Props) {
  const shell =
    variant === "muted"
      ? "border-white/12 bg-black/25 shadow-none"
      : "border-[rgba(77,70,53,0.24)] bg-[var(--surface-container)]/55 shadow-[0_10px_40px_rgba(0,0,0,0.18)]";
  return (
    <section
      className={`rounded-[var(--radius-card)] border px-4 py-3 ${shell} ${className}`}
    >
      <h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
        {title}
      </h3>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
