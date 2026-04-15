import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPageShell(props: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[var(--color-obsidian)] px-6 py-12 text-[var(--color-silver-muted)]">
      <div className="mx-auto w-full max-w-3xl rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/40 p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
          Legal
        </p>
        <h1 className="mt-2 text-fantasy text-2xl">{props.title}</h1>
        <p className="mt-2 text-xs text-[var(--outline)]">
          Last updated: {props.lastUpdated}
        </p>
        <div className="mt-6 space-y-5 text-sm leading-relaxed">{props.children}</div>
        <div className="mt-8">
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.14em] text-[var(--color-gold-rare)] underline underline-offset-4"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
