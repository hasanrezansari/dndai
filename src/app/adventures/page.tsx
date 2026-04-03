"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { useToast, useToastStore } from "@/components/ui/toast";

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

function parseAdventuresPayload(data: unknown): Adventure[] {
  if (
    typeof data !== "object" ||
    data === null ||
    !("adventures" in data) ||
    !Array.isArray((data as { adventures: unknown }).adventures)
  ) {
    return [];
  }
  return (data as { adventures: Adventure[] }).adventures ?? [];
}

export default function AdventuresPage() {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const pushToast = useToastStore((s) => s.push);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [hiddenLoading, setHiddenLoading] = useState(false);
  const [hiddenList, setHiddenList] = useState<Adventure[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadAdventures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/adventures");
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      setAdventures(parseAdventuresPayload(data));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.replace("/");
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadAdventures();
    })();
    return () => {
      cancelled = true;
    };
  }, [status, router, loadAdventures]);

  const loadHidden = useCallback(async () => {
    setHiddenLoading(true);
    try {
      const res = await fetch("/api/adventures/hidden");
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast({
          message: `Could not load hidden list (${res.status})`,
          type: "error",
        });
        return;
      }
      setHiddenList(parseAdventuresPayload(data));
    } catch {
      pushToast({ message: "Could not load hidden list", type: "error" });
    } finally {
      setHiddenLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!hiddenOpen || status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadHidden();
    })();
    return () => {
      cancelled = true;
    };
  }, [hiddenOpen, status, loadHidden]);

  const sorted = useMemo(() => {
    return [...adventures].sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  }, [adventures]);

  async function confirmHide(sessionId: string) {
    setHidingId(sessionId);
    try {
      const res = await fetch(`/api/adventures/${sessionId}`, { method: "POST" });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        toast(msg, "error");
        return;
      }
      setAdventures((prev) => prev.filter((x) => x.sessionId !== sessionId));
      setConfirmHideId(null);
      toast("Hidden from your list. You can still rejoin with your link or code.", "success");
      if (hiddenOpen) void loadHidden();
    } catch {
      toast("Network error", "error");
    } finally {
      setHidingId(null);
    }
  }

  async function restoreToList(sessionId: string) {
    setRestoringId(sessionId);
    try {
      const res = await fetch(`/api/adventures/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        toast(`Could not restore (${res.status})`, "error");
        return;
      }
      setHiddenList((prev) => prev.filter((x) => x.sessionId !== sessionId));
      await loadAdventures();
      toast("Restored to My Adventures", "success");
    } catch {
      toast("Network error", "error");
    } finally {
      setRestoringId(null);
    }
  }

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
                      {a.status} · {a.playerCount} players ·{" "}
                      {formatRelative(a.lastActivityAt)}
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
                <div className="mt-3 flex flex-wrap items-center gap-2 justify-end border-t border-[var(--outline)]/20 pt-3">
                  {confirmHideId === a.sessionId ? (
                    <div className="w-full space-y-2">
                      <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed">
                        Hide this from <strong className="text-[var(--color-silver-muted)]">your</strong> list
                        only. The table stays for everyone else. If you are still seated, you can rejoin anytime
                        with this link or join code.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <GhostButton
                          size="sm"
                          type="button"
                          disabled={hidingId === a.sessionId}
                          onClick={() => setConfirmHideId(null)}
                        >
                          Cancel
                        </GhostButton>
                        <GhostButton
                          size="sm"
                          type="button"
                          disabled={hidingId === a.sessionId}
                          onClick={() => void confirmHide(a.sessionId)}
                        >
                          {hidingId === a.sessionId ? "Hiding…" : "Hide from list"}
                        </GhostButton>
                      </div>
                    </div>
                  ) : (
                    <GhostButton
                      size="sm"
                      type="button"
                      disabled={hidingId !== null}
                      onClick={() => setConfirmHideId(a.sessionId)}
                    >
                      Hide from list
                    </GhostButton>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-2">
            <GhostButton
              size="sm"
              type="button"
              className="self-center"
              onClick={() => setHiddenOpen((o) => !o)}
            >
              {hiddenOpen ? "Collapse hidden sessions" : "Hidden sessions (manage)"}
            </GhostButton>
            {hiddenOpen && (
              <GlassCard className="p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)] mb-2">
                  Hidden from this list
                </p>
                {hiddenLoading ? (
                  <p className="text-sm text-[var(--color-silver-dim)]">Loading…</p>
                ) : hiddenList.length === 0 ? (
                  <p className="text-sm text-[var(--color-silver-dim)]">
                    No hidden sessions.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {hiddenList.map((h) => (
                      <li
                        key={h.sessionId}
                        className="flex flex-col gap-2 border-b border-[var(--outline)]/15 pb-3 last:border-0 last:pb-0"
                      >
                        <p className="text-fantasy text-sm font-medium text-[var(--color-silver-muted)] truncate">
                          {h.campaignTitle?.trim() || "Untitled adventure"}
                        </p>
                        <p className="text-[10px] text-[var(--color-silver-dim)]">
                          Code <span className="font-mono">{h.joinCode}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/session/${h.sessionId}`}>
                            <GoldButton size="sm">Open</GoldButton>
                          </Link>
                          <GhostButton
                            size="sm"
                            type="button"
                            disabled={restoringId === h.sessionId}
                            onClick={() => void restoreToList(h.sessionId)}
                          >
                            {restoringId === h.sessionId ? "Restoring…" : "Restore to list"}
                          </GhostButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>
            )}
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
