"use client";

import Link from "next/link";

import { COPY } from "@/lib/copy/ashveil";

type Props = {
  variant: "host" | "guest";
  /** Host-only; server balance from `GET /api/wallet`. */
  balance: number | null;
  /** Session table pool — spent before host wallet on AI charges. */
  tablePoolBalance?: number | null;
};

export function SparkBalanceHud({
  variant,
  balance,
  tablePoolBalance,
}: Props) {
  const pool =
    typeof tablePoolBalance === "number" && tablePoolBalance > 0
      ? tablePoolBalance
      : null;

  if (variant === "guest") {
    return (
      <div
        className="pointer-events-none fixed right-3 top-3 z-[85] max-w-[min(100vw-1.5rem,260px)] rounded-full border border-[var(--border-ui)] bg-[var(--color-deep-void)]/92 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-silver-dim)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        aria-live="polite"
      >
        <span className="block">{COPY.spark.hudGuest}</span>
        {pool !== null ? (
          <span className="mt-1 block text-[9px] font-bold tracking-[0.08em] text-[var(--color-gold-support)]">
            Table pool {pool} ⚡
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed right-3 top-3 z-[85] flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
      {pool !== null ? (
        <div className="rounded-full border border-[var(--color-gold-support)]/25 bg-[var(--color-deep-void)]/92 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-gold-support)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          Pool {pool}
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-full border border-[var(--border-ui)] bg-[var(--color-deep-void)]/92 py-1.5 pl-2.5 pr-1.5 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--outline)]"
        title={COPY.spark.hudHost}
      >
        <span className="text-[var(--color-gold-rare)]" aria-hidden>
          ⚡
        </span>{" "}
        <span className="tabular-nums text-[var(--color-silver-muted)]">
          {balance === null ? "…" : balance}
        </span>
      </span>
      <Link
        href="/shop"
        className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-gold-rare)] hover:bg-[var(--surface-high)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45"
      >
        {COPY.spark.buySparksCta}
      </Link>
      </div>
    </div>
  );
}
