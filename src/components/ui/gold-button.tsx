import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GoldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GoldButton = forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-xs",
      md: "px-6 py-3 text-sm",
      lg: "px-8 py-4 text-base",
    };

    return (
      <button
        className={`
          ${sizeClasses[size]}
          bg-gradient-to-b from-[var(--color-gold-rare)] to-[var(--color-gold-support)]
          text-[var(--color-obsidian)]
          font-bold uppercase tracking-[0.15em]
          rounded-[var(--radius-button)]
          shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_12px_rgba(242,202,80,0.3)]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:brightness-110
          active:scale-[0.97] active:shadow-none
          disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale disabled:hover:brightness-100
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
