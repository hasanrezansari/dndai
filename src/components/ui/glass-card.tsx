import { type HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "heavy" | "surface";
  glow?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { variant = "default", glow = false, className = "", children, ...props },
    ref,
  ) => {
    const base =
      variant === "heavy"
        ? "glass-heavy"
        : variant === "surface"
          ? "bg-[var(--surface-high)] border border-[var(--border-ui)] rounded-[var(--radius-card)]"
          : "glass";
    const glowClass = glow ? "glow-gold" : "";

    return (
      <div
        className={`${base} ${glowClass} ${className}`}
        {...props}
        ref={ref}
      >
        {children}
      </div>
    );
  },
);

GlassCard.displayName = "GlassCard";
