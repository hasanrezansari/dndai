"use client";

import Link from "next/link";
import { useEffect } from "react";

import { GoldButton } from "@/components/ui/gold-button";

function sanitizeMessage(raw: string): string {
  const first = raw.trim().split(/\r?\n/)[0] ?? "";
  const stripped = first.replace(/<[^>]*>/g, "");
  if (/^\s*at\s+/i.test(stripped)) return "Something went wrong";
  if (stripped.length > 240) return `${stripped.slice(0, 240)}…`;
  return stripped || "Something went wrong";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = sanitizeMessage(error.message);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[var(--color-obsidian)] px-6 py-10 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 40%, rgba(139, 37, 0, 0.12) 0%, transparent 55%)",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-[var(--radius-card)] border border-[rgba(255,68,68,0.25)] flex items-center justify-center bg-[var(--color-deep-void)]/80"
          aria-hidden
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[var(--color-failure)]"
          >
            <path
              d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M12 8v5M12 16h.01"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="text-fantasy text-2xl sm:text-3xl text-[var(--color-silver-muted)] tracking-wide">
          Something went wrong
        </h1>
        <p className="text-sm text-[var(--color-silver-dim)] leading-relaxed">
          {message}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
          <GoldButton
            type="button"
            size="lg"
            className="w-full min-h-[44px] flex items-center justify-center"
            onClick={() => reset()}
          >
            Try Again
          </GoldButton>
          <Link
            href="/"
            className="w-full min-h-[44px] flex items-center justify-center px-8 py-4 text-lg bg-transparent text-[var(--color-silver-muted)] border border-[rgba(255,255,255,0.12)] rounded-[var(--radius-button)] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] hover:border-[var(--color-gold-support)] hover:text-[var(--color-gold-support)] active:scale-[0.97]"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
