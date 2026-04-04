import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-xs min-h-[40px]",
      md: "px-6 py-3 text-sm min-h-[44px]",
      lg: "px-8 py-4 text-base min-h-[48px]",
    };

    return (
      <button
        type="button"
        ref={ref}
        className={`
          ${sizeClasses[size]}
          inline-flex items-center justify-center
          bg-transparent text-[var(--color-silver-muted)]
          border border-[var(--border-ui-strong)]
          rounded-[var(--radius-button)]
          font-bold uppercase tracking-[0.1em]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)]
          active:scale-[0.97]
          disabled:opacity-30 disabled:cursor-not-allowed
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
          ${className}
        `.trim()}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  },
);

GhostButton.displayName = "GhostButton";
