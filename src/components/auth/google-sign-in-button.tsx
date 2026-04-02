"use client";

type Props = {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
};

export function GoogleSignInButton({
  disabled,
  onClick,
  label = "Continue with Google",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full min-h-[48px] items-center justify-center gap-3 rounded-[var(--radius-card)] border border-[rgba(255,255,255,0.14)] bg-[var(--color-deep-void)] px-4 text-sm font-semibold text-[var(--color-silver-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-[rgba(242,202,80,0.35)] hover:text-[var(--color-silver-bright)] disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      <GoogleMark />
      <span>{label}</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.72 1.22 9.23 3.6l6.9-6.9C35.95 2.38 30.37 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.03 6.24C12.45 13.06 17.77 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9.0h12.4c-.54 2.9-2.18 5.36-4.65 7.02l7.18 5.57C43.22 37.38 46.1 31.55 46.1 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.59 28.46c-.5-1.5-.78-3.1-.78-4.76s.28-3.26.78-4.76l-8.03-6.24C.92 16.0 0 19.86 0 23.7s.92 7.7 2.56 11.0l8.03-6.24z"
      />
      <path
        fill="#34A853"
        d="M24 47.4c6.37 0 11.74-2.1 15.65-5.72l-7.18-5.57c-1.99 1.34-4.54 2.13-8.47 2.13-6.23 0-11.55-3.56-13.41-8.72l-8.03 6.24C6.51 42.02 14.62 47.4 24 47.4z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
