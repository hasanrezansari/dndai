import { type ButtonHTMLAttributes, forwardRef } from "react";

interface GoldButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export const GoldButton = forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ size = "md", className = "", children, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
    };

    return (
      <button
        className={`
          ${sizeClasses[size]}
          bg-[var(--color-gold-rare)] text-[var(--color-obsidian)]
          font-semibold rounded-[var(--radius-button)]
          transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)]
          hover:brightness-110 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]
          active:scale-[0.97]
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none
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
