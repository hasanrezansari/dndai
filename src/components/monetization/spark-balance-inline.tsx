"use client";

import Link from "next/link";

import { COPY } from "@/lib/copy/ashveil";

type Props = {
  balance: number | null;
  loading?: boolean;
  /** `@ashveil.guest` — show retention hint; balance may still display. */
  isGuest: boolean;
};

/**
 * Non-fixed Sparks strip for home, profile, and other marketing surfaces.
 */
export function SparkBalanceInline({ balance, loading, isGuest }: Props) {
  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
      <div className="flex items-center gap-2 rounded-full border border-[var(--border-ui)] bg-[var(--color-deep-void)]/85 px-2.5 py-1.5 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--outline)]"
          title={COPY.spark.hudHost}
        >
          <span className="text-[var(--color-gold-rare)]" aria-hidden>
            ⚡
          </span>{" "}
          <span className="tabular-nums text-[var(--color-silver-muted)]">
            {loading ? "…" : balance === null ? "—" : balance}
          </span>
        </span>
        <Link
          href="/shop"
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-gold-rare)] hover:bg-[var(--surface-high)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45"
        >
          {COPY.spark.buySparksCta}
        </Link>
      </div>
      {isGuest ? (
        <p className="max-w-[min(100vw-2rem,280px)] text-right text-[9px] leading-snug text-[var(--color-silver-dim)]">
          {COPY.spark.marketingGuestHint}
        </p>
      ) : null}
    </div>
  );
}
