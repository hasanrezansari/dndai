import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
    };

    return (
      <button
        type="button"
        ref={ref}
        className={`
          ${sizeClasses[size]}
          bg-transparent text-[var(--color-silver-muted)]
          border border-[rgba(255,255,255,0.12)]
          rounded-[var(--radius-button)]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:border-[var(--color-gold-support)] hover:text-[var(--color-gold-support)]
          active:scale-[0.97]
          disabled:opacity-40 disabled:cursor-not-allowed
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
