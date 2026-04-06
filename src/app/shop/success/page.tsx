"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { COPY } from "@/lib/copy/ashveil";

function ConfirmPurchaseCall({
  paymentId,
  sessionId,
}: {
  paymentId: string | null;
  sessionId: string | null;
}) {
  const [message, setMessage] = useState("Confirming your purchase…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/checkout/sparks/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: paymentId ?? undefined,
            sessionId: sessionId ?? undefined,
          }),
        });
        const j = (await r.json()) as {
          credited?: boolean;
          reason?: string | null;
        };
        if (cancelled) return;
        if (j.credited) {
          setMessage(
            "Sparks are in your wallet. Head back when you’re ready.",
          );
          return;
        }
        if (j.reason === "not_paid") {
          setMessage(
            "Payment still processing — refresh this page in a moment.",
          );
          return;
        }
        setMessage(
          "We could not confirm instantly; if the charge succeeded, your balance may still update automatically.",
        );
      } catch {
        if (!cancelled) {
          setMessage(
            "Could not reach the server to confirm. Check your Sparks balance in-game.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId, sessionId]);

  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--color-silver-muted)]">
        {message}
      </p>
      <Link
        href="/adventures"
        className="inline-flex items-center justify-center px-6 py-3 text-sm min-h-[44px] bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
      >
        {COPY.spark.shopBackPlay}
      </Link>
    </>
  );
}

function ShopSuccessContent() {
  const search = useSearchParams();
  const { status } = useSession();

  const paymentId =
    (search.get("payment_id") || search.get("paymentId") || "").trim() || null;
  const sessionId =
    (
      search.get("session_id") ||
      search.get("sessionId") ||
      search.get("checkout_session_id") ||
      ""
    ).trim() || null;

  if (status === "loading") {
    return (
      <p className="text-sm text-[var(--color-silver-dim)]">Loading…</p>
    );
  }

  if (status !== "authenticated") {
    return (
      <>
        <p className="text-sm leading-relaxed text-[var(--color-silver-muted)]">
          Sign in to sync Sparks. If checkout finished, credits may still apply
          via webhook.
        </p>
        <Link
          href="/api/auth/signin?callbackUrl=/shop/success"
          className="inline-flex items-center justify-center px-6 py-3 text-sm min-h-[44px] text-[var(--color-gold-rare)] underline underline-offset-2"
        >
          Sign in
        </Link>
        <Link
          href="/adventures"
          className="inline-flex items-center justify-center px-6 py-3 text-sm min-h-[44px] bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
        >
          {COPY.spark.shopBackPlay}
        </Link>
      </>
    );
  }

  if (!paymentId && !sessionId) {
    return (
      <>
        <p className="text-sm leading-relaxed text-[var(--color-silver-muted)]">
          If payment succeeded, Sparks usually arrive within a minute. Check
          your wallet from any session.
        </p>
        <Link
          href="/adventures"
          className="inline-flex items-center justify-center px-6 py-3 text-sm min-h-[44px] bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
        >
          {COPY.spark.shopBackPlay}
        </Link>
      </>
    );
  }

  return (
    <ConfirmPurchaseCall paymentId={paymentId} sessionId={sessionId} />
  );
}

export default function ShopSuccessPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[var(--color-obsidian)] px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/40 p-8 text-center backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--outline)]">
          {COPY.spark.shopSuccessTitle}
        </p>
        <Suspense
          fallback={
            <p className="text-sm text-[var(--color-silver-dim)]">Loading…</p>
          }
        >
          <ShopSuccessContent />
        </Suspense>
      </div>
    </main>
  );
}
