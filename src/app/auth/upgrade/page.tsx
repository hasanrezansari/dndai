"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";

export default function AuthUpgradePage() {
  const router = useRouter();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitingForGoogle = status === "unauthenticated";

  useEffect(() => {
    if (status !== "authenticated") return;
    const ac = new AbortController();

    async function run() {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/upgrade/complete", {
          method: "POST",
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}));
          const msg =
            typeof data === "object" && data !== null && "error" in data
              ? String((data as { error: unknown }).error)
              : `Upgrade failed (${res.status})`;
          setError(msg);
          return;
        }
        router.replace("/");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError("Network error during upgrade.");
      } finally {
        // Always clear — if we skip this when `cancelled` (Strict Mode), the UI
        // stays on “Working…” forever because `busy` blocks the effect from re-running.
        setBusy(false);
      }
    }
    void run();
    return () => ac.abort();
  }, [status, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-[var(--color-obsidian)]">
      <GlassCard className="p-6 w-full max-w-sm">
        <h1 className="text-fantasy font-bold text-xl text-[var(--color-silver-muted)] mb-2">
          Upgrading your account
        </h1>
        {waitingForGoogle ? (
          <p className="text-sm text-[var(--color-silver-dim)] mb-4">
            Google sign-in didn’t complete (backed out or closed the window).
            Return home and try again when you’re ready.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-silver-dim)] mb-4">
            We’re linking your guest adventures to your Google account.
          </p>
        )}
        {error ? (
          <p className="text-sm text-[var(--color-failure)] mb-4">{error}</p>
        ) : null}
        <GoldButton
          type="button"
          className="w-full min-h-[44px]"
          disabled={busy}
          onClick={() => router.replace("/")}
        >
          {busy ? "Working…" : "Back to home"}
        </GoldButton>
      </GlassCard>
    </main>
  );
}

