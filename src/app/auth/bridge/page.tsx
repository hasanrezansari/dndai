"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { RouteLoadingUI } from "@/components/ui/route-loading";

export default function AuthBridgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() ?? "/adventures";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setError("Missing token");
        return;
      }
      const res = await signIn("bridge", {
        token,
        redirect: false,
      });
      if (cancelled) return;
      if (res?.error) {
        setError("Could not sign you in");
        return;
      }
      router.replace(returnTo);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, token, returnTo]);

  if (error) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[var(--color-obsidian)]">
        <GlassCard className="w-full max-w-sm p-6">
          <p className="text-sm text-[var(--color-failure)]">{error}</p>
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col bg-[var(--color-obsidian)]">
      <RouteLoadingUI />
    </main>
  );
}

