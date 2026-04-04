import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GoldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GoldButton = forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-xs min-h-[40px]",
      md: "px-6 py-3 text-sm min-h-[44px]",
      lg: "px-8 py-4 text-base min-h-[48px]",
    };

    return (
      <button
        className={`
          ${sizeClasses[size]}
          inline-flex items-center justify-center
          bg-gradient-to-b from-[var(--color-gold-rare)] to-[var(--color-gold-support)]
          text-[var(--color-obsidian)]
          font-bold uppercase tracking-[0.15em]
          rounded-[var(--radius-button)]
          shadow-[inset_0_1px_0_rgba(255,255,255,0.2),var(--shadow-cta-glow)]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:brightness-110
          active:scale-[0.97] active:shadow-none
          disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale disabled:hover:brightness-100
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
          ${className}
        `.trim()}
        disabled={disabled}
        {...props}
        ref={ref}
      >
        {children}
      </button>
    );
  },
);

GoldButton.displayName = "GoldButton";
