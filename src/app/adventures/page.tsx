"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

type Adventure = {
  sessionId: string;
  joinCode: string;
  status: string;
  mode: string;
  phase: string;
  campaignTitle: string | null;
  updatedAt: string;
  lastActivityAt: string;
  playerCount: number;
  isHost: boolean;
};

function formatRelative(ts: string): string {
  const t = new Date(ts).getTime();
  const now = Date.now();
  const d = Math.max(0, now - t);
  const mins = Math.floor(d / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdventuresPage() {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adventures, setAdventures] = useState<Adventure[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.replace("/");
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/adventures");
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(`Failed to load (${res.status})`);
          return;
        }
        const list =
          typeof data === "object" &&
          data !== null &&
          "adventures" in data &&
          Array.isArray((data as { adventures: unknown }).adventures)
            ? ((data as { adventures: Adventure[] }).adventures ?? [])
            : [];
        if (!cancelled) setAdventures(list);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, router]);

  const sorted = useMemo(() => {
    return [...adventures].sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  }, [adventures]);

  return (
    <main className="min-h-dvh flex flex-col items-center px-6 pb-10 bg-[var(--color-obsidian)]">
      <div className="w-full max-w-md pt-10 flex flex-col gap-[var(--void-gap-lg)]">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
              Continuity
            </p>
            <h1 className="text-fantasy text-2xl font-bold text-[var(--color-silver-muted)]">
              My Adventures
            </h1>
          </div>
          <GhostButton size="sm" onClick={() => router.push("/")}>
            Home
          </GhostButton>
        </header>

        {loading ? (
          <GlassCard className="p-6">
            <p className="text-sm text-[var(--color-silver-dim)]">
              Gathering your sessions…
            </p>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-6">
            <p className="text-sm text-[var(--color-failure)]">{error}</p>
          </GlassCard>
        ) : sorted.length === 0 ? (
          <GlassCard className="p-6">
            <p className="text-sm text-[var(--color-silver-dim)]">
              No adventures yet. Start a new one or join a party with a code.
            </p>
            <div className="mt-4">
              <GoldButton className="w-full" onClick={() => router.push("/")}>
                Start
              </GoldButton>
            </div>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((a) => (
              <GlassCard key={a.sessionId} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
                      {a.status} · {a.playerCount} players · {formatRelative(a.lastActivityAt)}
                    </p>
                    <p className="mt-1 text-fantasy text-lg font-semibold text-[var(--color-silver-muted)] truncate">
                      {a.campaignTitle?.trim() || "Untitled adventure"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-silver-dim)]">
                      Code: <span className="font-mono">{a.joinCode}</span>
                      {a.isHost ? " · Host" : ""}
                    </p>
                  </div>
                  <Link href={`/session/${a.sessionId}`} className="shrink-0">
                    <GoldButton size="sm">Resume</GoldButton>
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        <div className="pt-2">
          <p className="text-[10px] text-[var(--color-silver-dim)] uppercase tracking-[0.18em] text-center">
            Your story is saved automatically.
          </p>
        </div>
      </div>
    </main>
  );
}

