import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-xs",
      md: "px-6 py-3 text-sm",
      lg: "px-8 py-4 text-base",
    };

    return (
      <button
        type="button"
        ref={ref}
        className={`
          ${sizeClasses[size]}
          bg-transparent text-[var(--color-silver-muted)]
          border border-[rgba(77,70,53,0.3)]
          rounded-[var(--radius-button)]
          font-bold uppercase tracking-[0.1em]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)]
          active:scale-[0.97]
          disabled:opacity-30 disabled:cursor-not-allowed
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
