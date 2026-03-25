"use client";

import type { HTMLAttributes } from "react";

interface PillSelectProps<T extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  wrap?: boolean;
}

export function PillSelect<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  wrap = true,
  className = "",
  ...rest
}: PillSelectProps<T>) {
  const height =
    size === "md"
      ? "min-h-[44px] px-5 py-2.5 text-xs"
      : "min-h-9 px-3 py-1.5 text-[11px]";

  return (
    <div
      className={`flex gap-2 ${wrap ? "flex-wrap" : "flex-nowrap"} ${className}`}
      role="group"
      {...rest}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`
              rounded-[var(--radius-pill)] font-bold uppercase tracking-wider
              transition-all duration-[var(--duration-med)]
              [transition-timing-function:var(--ease-out-soft)]
              active:scale-[0.95]
              ${height}
              ${
                selected
                  ? "bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] shadow-lg shadow-[rgba(242,202,80,0.1)]"
                  : "bg-[var(--surface-high)] text-[var(--color-silver-dim)] border border-[rgba(77,70,53,0.1)] hover:text-[var(--color-silver-muted)]"
              }
            `.trim()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
