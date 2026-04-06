"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

/**
 * Signed-in user's Spark balance from `GET /api/wallet` (authoritative).
 * Returns `null` when unauthenticated or on fetch failure.
 */
export function useSparkBalance() {
  const { status } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (status !== "authenticated") {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/wallet");
      if (r.ok) {
        const j = (await r.json()) as { balance?: number };
        setBalance(typeof j.balance === "number" ? j.balance : null);
      } else {
        setBalance(null);
      }
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { balance, loading, refetch };
}
