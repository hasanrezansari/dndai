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
    size === "md" ? "min-h-[44px] px-4 py-2.5 text-base" : "min-h-9 px-3 py-1.5 text-sm";

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
              rounded-full font-medium transition-all duration-[var(--duration-med)]
              [transition-timing-function:var(--ease-out-soft)]
              active:scale-[0.98]
              ${height}
              ${
                selected
                  ? "bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] shadow-[0_0_16px_rgba(212,175,55,0.25)]"
                  : "bg-transparent text-[var(--color-silver-muted)] border border-[rgba(255,255,255,0.12)] hover:border-[var(--color-gold-support)] hover:text-[var(--color-gold-support)]"
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
