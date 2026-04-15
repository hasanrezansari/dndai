"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { COPY } from "@/lib/copy/ashveil";

type PublicPack = { packId: string; label: string; sparks: number };

type CheckoutPostOk =
  | { flow: "dodo_redirect"; checkoutUrl: string }
  | {
      flow: "razorpay";
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      prefill: { email?: string; name?: string };
      displayName: string;
      successRedirectBase: string;
    };

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("razorpay script")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("razorpay script"));
    document.body.appendChild(s);
  });
}

export default function ShopPage() {
  const { status } = useSession();
  const [packs, setPacks] = useState<PublicPack[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/checkout/sparks");
        const j = (await r.json()) as {
          packs?: PublicPack[];
          checkoutEnabled?: boolean;
        };
        if (!cancelled) {
          setPacks(Array.isArray(j.packs) ? j.packs : []);
          setCheckoutEnabled(Boolean(j.checkoutEnabled));
        }
      } catch {
        if (!cancelled) {
          setPacks([]);
          setCheckoutEnabled(false);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = useCallback(async (packId: string) => {
    setError(null);
    setBusyPack(packId);
    try {
      const r = await fetch("/api/checkout/sparks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const j = (await r.json()) as CheckoutPostOk & {
        error?: string;
      };
      if (!r.ok) {
        setError(j.error ?? COPY.spark.shopErrorGeneric);
        return;
      }
      if (j.flow === "dodo_redirect" && j.checkoutUrl) {
        window.location.href = j.checkoutUrl;
        return;
      }
      if (j.flow === "razorpay") {
        await loadRazorpayScript();
        if (!window.Razorpay) {
          setError(COPY.spark.shopErrorGeneric);
          return;
        }
        const base = j.successRedirectBase.startsWith("http")
          ? j.successRedirectBase
          : `${window.location.origin}${j.successRedirectBase}`;
        const options: Record<string, unknown> = {
          key: j.keyId,
          amount: j.amount,
          currency: j.currency,
          order_id: j.orderId,
          name: COPY.spark.shopTitle,
          description: j.displayName,
          prefill: j.prefill,
          theme: { color: "#1a1a1a" },
          handler: (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
          }) => {
            const u = new URL(base);
            u.searchParams.set("payment_id", response.razorpay_payment_id);
            u.searchParams.set("order_id", response.razorpay_order_id);
            window.location.href = u.toString();
          },
        };
        const inst = new window.Razorpay(options);
        inst.open();
        return;
      }
      setError(COPY.spark.shopErrorGeneric);
    } catch {
      setError(COPY.spark.shopErrorGeneric);
    } finally {
      setBusyPack(null);
    }
  }, []);

  const signedIn = status === "authenticated";

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 bg-[var(--color-obsidian)] px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/40 p-8 text-center backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--outline)]">
          {COPY.spark.shopTitle}
        </p>
        <h1 className="text-fantasy text-xl text-[var(--color-silver-muted)]">
          {COPY.spark.shopTitle}
        </h1>

        {catalogLoading ? (
          <p className="text-sm text-[var(--color-silver-dim)]">Loading…</p>
        ) : !checkoutEnabled ? (
          <p className="text-sm leading-relaxed text-[var(--color-silver-dim)]">
            {COPY.spark.shopConfigureHint}
          </p>
        ) : (
          <ul className="space-y-3 text-left">
            {packs.map((p) => (
              <li
                key={p.packId}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)]/35 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-silver-muted)]">
                    {p.label}
                  </p>
                  <p className="text-xs text-[var(--outline)]">
                    ⚡ {p.sparks} Sparks
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!signedIn || busyPack !== null}
                  onClick={() => void buy(p.packId)}
                  className="shrink-0 rounded-[var(--radius-button)] border border-[var(--color-gold-rare)]/45 bg-[var(--color-deep-void)]/80 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-gold-rare)] transition-colors hover:bg-[var(--surface-high)]/60 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45"
                >
                  {busyPack === p.packId
                    ? COPY.spark.shopPaySecureBusy
                    : COPY.spark.shopPaySecureCta}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="text-sm text-[var(--color-failure)]">{error}</p>
        ) : null}

        {!catalogLoading && checkoutEnabled && !signedIn ? (
          <p className="text-sm text-[var(--color-silver-dim)]">
            <Link
              href="/api/auth/signin?callbackUrl=/shop"
              className="text-[var(--color-gold-rare)] underline underline-offset-2"
            >
              {COPY.spark.shopSignIn}
            </Link>
          </p>
        ) : null}

        <div className="pt-2">
          <Link
            href="/adventures"
            className="inline-flex items-center justify-center px-6 py-3 text-sm min-h-[44px] bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
          >
            {COPY.spark.shopBackPlay}
          </Link>
        </div>
      </div>
    </main>
  );
}
