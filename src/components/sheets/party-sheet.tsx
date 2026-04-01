"use client";

import { useEffect, useMemo, useState } from "react";

import { useGameStore } from "@/lib/state/game-store";
import { useToast } from "@/components/ui/toast";

type PublicProfileResponse = {
  user: { id: string; name: string; image: string | null };
  heroes: Array<{
    id: string;
    name: string;
    heroClass: string;
    race: string;
  }>;
};

export function PartySheet() {
  const players = useGameStore((s) => s.players);
  const currentTurnPlayerId = useGameStore(
    (s) => s.session?.currentPlayerId ?? null,
  );
  const { toast } = useToast();

  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!profileError) return;
    const t = window.setTimeout(() => setProfileError(null), 3500);
    return () => window.clearTimeout(t);
  }, [profileError]);

  const ordered = useMemo(
    () => [...players].sort((a, b) => a.seatIndex - b.seatIndex),
    [players],
  );

  async function openProfile(userId: string) {
    setViewUserId(userId);
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/profile`);
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const j = data as { error?: string };
        setProfileError(j.error ?? "This player has no public profile.");
        return;
      }
      setProfile(data as PublicProfileResponse);
    } catch {
      setProfileError("Could not load profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function copyHero(fromHeroId: string) {
    if (copyBusyId) return;
    setCopyBusyId(fromHeroId);
    try {
      const res = await fetch("/api/profile/heroes/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromHeroId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = j.error ?? "Could not copy hero.";
        setProfileError(msg);
        toast(msg, "error");
        return;
      }
      setProfileError(null);
      toast("Hero copied to your profile", "success");
    } catch {
      setProfileError("Could not copy hero.");
      toast("Could not copy hero", "error");
    } finally {
      setCopyBusyId(null);
    }
  }

  if (ordered.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--color-silver-dim)]">
        No party members yet.
      </p>
    );
  }

  if (viewUserId) {
    const title = profile?.user?.name ?? "Profile";
    return (
      <div className="pb-6">
        <button
          type="button"
          onClick={() => {
            setViewUserId(null);
            setProfile(null);
            setProfileError(null);
          }}
          className="min-h-[40px] rounded-[var(--radius-chip)] border border-white/10 bg-[var(--surface-container)]/20 px-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-silver-muted)]"
        >
          ← Back to party
        </button>

        <div className="mt-4 rounded-[var(--radius-card)] border border-white/10 bg-[var(--surface-container)]/25 p-4">
          <p className="text-fantasy text-xl text-[var(--color-silver-muted)]">
            {title}
          </p>
          {profileLoading ? (
            <p className="mt-2 text-sm text-[var(--color-silver-dim)]">Loading…</p>
          ) : profileError ? (
            <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
              {profileError}
            </p>
          ) : profile ? (
            <div className="mt-3 space-y-3">
              {profile.heroes.length === 0 ? (
                <p className="text-sm text-[var(--color-silver-dim)]">
                  No public heroes shared.
                </p>
              ) : (
                profile.heroes.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-[var(--radius-card)] border border-white/10 bg-black/15 p-4"
                  >
                    <p className="text-fantasy text-base text-[var(--color-silver-muted)]">
                      {h.name}
                    </p>
                    <p className="text-xs capitalize text-[var(--color-silver-dim)]">
                      {h.heroClass} · {h.race}
                    </p>
                    <button
                      type="button"
                      disabled={copyBusyId === h.id}
                      onClick={() => void copyHero(h.id)}
                      className="mt-3 min-h-[40px] w-full rounded-[var(--radius-chip)] border border-[rgba(212,175,55,0.35)] bg-[var(--surface-high)]/35 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-gold-rare)]"
                    >
                      {copyBusyId === h.id ? "Copying…" : "Copy hero"}
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-[var(--void-gap)] pb-6">
      {ordered.map((p) => {
        const c = p.character;
        const name =
          c?.name?.trim() || p.displayName?.trim() || `Seat ${p.seatIndex + 1}`;
        const subtitle = c
          ? `${c.class} · ${c.race}`
          : "No character";
        const hp = c?.hp ?? 0;
        const maxHp = c?.maxHp ?? 1;
        const hpPct = Math.min(100, Math.round((hp / Math.max(maxHp, 1)) * 100));
        const isTurn = currentTurnPlayerId === p.id;
        const statusLabel = !p.isConnected
          ? "Offline"
          : p.isReady
            ? "Ready"
            : "Connected";

        return (
          <li
            key={p.id}
            className={`rounded-[var(--radius-card)] border bg-[var(--color-deep-void)]/40 px-3 py-3 backdrop-blur-sm ${
              isTurn
                ? "border-[var(--color-gold-rare)]/55 shadow-[0_0_20px_rgba(212,175,55,0.12)]"
                : "border-white/[0.08]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-fantasy text-base text-[var(--color-silver-muted)]">
                  {name}
                </p>
                <p className="truncate text-xs capitalize text-[var(--color-silver-dim)]">
                  {subtitle}
                </p>
                {c && (
                  <div className="mt-2 h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-black/45">
                    <div
                      className="gradient-hp h-full rounded-full"
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`text-data rounded-[var(--radius-chip)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                    p.isConnected
                      ? "bg-white/[0.06] text-[var(--color-silver-muted)]"
                      : "bg-white/[0.03] text-[var(--color-silver-dim)]"
                  }`}
                >
                  {statusLabel}
                </span>
                {c && (
                  <span className="text-data text-[10px] tabular-nums text-[var(--color-silver-dim)]">
                    {hp}/{maxHp}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openProfile(p.userId)}
              className="mt-3 w-full min-h-[40px] rounded-[var(--radius-chip)] border border-white/10 bg-[var(--surface-container)]/20 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--outline)]"
            >
              View profile
            </button>
          </li>
        );
      })}
    </ul>
  );
}
