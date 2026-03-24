import { type HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "heavy";
  glow?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { variant = "default", glow = false, className = "", children, ...props },
    ref,
  ) => {
    const base = variant === "heavy" ? "glass-heavy" : "glass";
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
