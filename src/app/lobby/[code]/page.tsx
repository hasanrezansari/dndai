"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PlayerSlot, type PlayerSlotPlayer } from "@/components/lobby/player-slot";
import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { SkeletonCard } from "@/components/ui/loading-skeleton";
import { getPusherClient, getSessionChannel } from "@/lib/socket/client";
import type { Player, Session } from "@/lib/schemas/domain";

type SessionWithPlayers = Session & { players: Player[] };

function mapToSlotPlayer(p: Player): PlayerSlotPlayer {
  return {
    id: p.id,
    name: p.name ?? undefined,
    seatIndex: p.seat_index,
    isReady: p.is_ready,
    isHost: p.is_host,
    isDm: p.is_dm,
    isConnected: p.is_connected,
  };
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const codeParam = params.code;
  const joinCode =
    typeof codeParam === "string"
      ? codeParam.trim().toUpperCase()
      : Array.isArray(codeParam)
        ? codeParam[0]!.trim().toUpperCase()
        : "";

  const [session, setSession] = useState<SessionWithPlayers | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readyLoading, setReadyLoading] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  const refetchSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}`);
    if (!res.ok) return;
    const data = (await res.json()) as SessionWithPlayers;
    setSession(data);
  }, []);

  useEffect(() => {
    if (!joinCode) {
      setLoadError("Missing join code");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function enter() {
      setLoading(true);
      setLoadError(null);
      try {
        const joinRes = await fetch("/api/sessions/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode }),
        });
        const joinJson = (await joinRes.json().catch(() => ({}))) as {
          sessionId?: string;
          playerId?: string;
          error?: string;
        };
        if (!joinRes.ok) {
          if (!cancelled) {
            setLoadError(joinJson.error ?? "Could not join session");
          }
          return;
        }
        const sid = joinJson.sessionId;
        const pid = joinJson.playerId;
        if (!sid || !pid) {
          if (!cancelled) setLoadError("Invalid response from server");
          return;
        }
        const sessionRes = await fetch(`/api/sessions/${sid}`);
        if (!sessionRes.ok) {
          if (!cancelled) setLoadError("Session not found");
          return;
        }
        const full = (await sessionRes.json()) as SessionWithPlayers;
        if (!cancelled) {
          setSessionId(sid);
          setCurrentPlayerId(pid);
          setSession(full);
        }
      } catch {
        if (!cancelled) setLoadError("Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void enter();
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  useEffect(() => {
    if (!sessionId) return;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    if (!key) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const name = getSessionChannel(sessionId);
    const channel = pusher.subscribe(name);
    const bump = () => {
      void refetchSession(sessionId);
    };
    const onSessionStarted = () => {
      router.push(`/character/${sessionId}`);
    };
    channel.bind("player-joined", bump);
    channel.bind("player-ready", bump);
    channel.bind("player-disconnected", bump);
    channel.bind("session-started", onSessionStarted);

    return () => {
      channel.unbind("player-joined");
      channel.unbind("player-ready");
      channel.unbind("player-disconnected");
      channel.unbind("session-started");
      pusher.unsubscribe(name);
    };
  }, [sessionId, refetchSession]);

  const me = useMemo(
    () => session?.players.find((p) => p.id === currentPlayerId),
    [session, currentPlayerId],
  );

  const isHost = Boolean(me?.is_host);
  const iAmReady = Boolean(me?.is_ready);

  const canStart = useMemo(() => {
    if (!session) return false;
    const { players } = session;
    if (players.length < 2) return false;
    return players.every((p) => p.is_ready && p.is_connected);
  }, [session]);

  async function handleReady() {
    if (!sessionId || !currentPlayerId || readyLoading) return;
    setReadyLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { isReady?: boolean };
      const next = Boolean(data.isReady);
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === currentPlayerId ? { ...p, is_ready: next } : p,
          ),
        };
      });
    } finally {
      setReadyLoading(false);
    }
  }

  const [startLoading, setStartLoading] = useState(false);

  async function handleStart() {
    if (!sessionId || !currentPlayerId || startLoading) return;
    setStartLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "Could not start");
        return;
      }
      router.push(`/character/${sessionId}`);
    } finally {
      setStartLoading(false);
    }
  }

  async function handleShare() {
    if (!session?.join_code) return;
    try {
      await navigator.clipboard.writeText(session.join_code);
      setShareHint("Code copied");
      setTimeout(() => setShareHint(null), 2000);
    } catch {
      setShareHint("Copy failed");
      setTimeout(() => setShareHint(null), 2000);
    }
  }

  function handleLeave() {
    router.push("/");
  }

  const title = session?.campaign_title?.trim() || "Untitled Adventure";

  const slots = useMemo(() => {
    if (!session) return [];
    const bySeat = new Map<number, Player>();
    for (const p of session.players) {
      bySeat.set(p.seat_index, p);
    }
    const out: { seat: number; player?: Player }[] = [];
    for (let s = 0; s < session.max_players; s++) {
      out.push({ seat: s, player: bySeat.get(s) });
    }
    return out;
  }, [session]);

  if (loading) {
    return (
      <main className="min-h-dvh flex flex-col px-5 pt-8 pb-10 relative overflow-hidden bg-[var(--color-obsidian)]">
        <div
          className="absolute inset-0 bg-gradient-to-b from-[var(--color-deep-void)] via-[var(--color-obsidian)] to-[var(--color-obsidian)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 85% 50% at 50% 38%, rgba(212, 175, 55, 0.07) 0%, transparent 50%), radial-gradient(circle at 50% 42%, rgba(123, 45, 142, 0.1) 0%, transparent 45%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-col flex-1 w-full max-w-md mx-auto gap-[var(--void-gap-lg)]">
          <SkeletonCard className="min-h-[140px]" />
          <div className="flex flex-col gap-[var(--void-gap)] flex-1">
            <SkeletonCard className="min-h-[72px]" />
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} className="min-h-[72px]" />
            ))}
          </div>
          <p className="text-center text-sm text-[var(--color-silver-dim)]">
            Entering the gathering circle…
          </p>
        </div>
      </main>
    );
  }

  if (loadError || !session) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-[var(--void-gap)] px-6 bg-[var(--color-obsidian)]">
        <p className="text-[var(--color-failure)] text-center text-base">
          {loadError ?? "Session unavailable"}
        </p>
        <GhostButton
          type="button"
          size="lg"
          className="min-h-[44px] flex items-center justify-center"
          onClick={() => router.push("/")}
        >
          Return home
        </GhostButton>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pt-8 pb-10 relative overflow-hidden bg-[var(--color-obsidian)]">
      <div
        className="absolute inset-0 bg-gradient-to-b from-[var(--color-deep-void)] via-[var(--color-obsidian)] to-[var(--color-obsidian)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 85% 50% at 50% 38%, rgba(212, 175, 55, 0.07) 0%, transparent 50%), radial-gradient(circle at 50% 42%, rgba(123, 45, 142, 0.1) 0%, transparent 45%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-md mx-auto gap-[var(--void-gap-lg)]">
        <header className="flex flex-col gap-[var(--void-gap)]">
          <GlassCard className="p-5 glow-gold border-[rgba(212,175,55,0.15)]">
            <p className="text-xs uppercase tracking-widest text-[var(--color-silver-dim)] mb-2">
              Join code
            </p>
            <p className="text-fantasy text-2xl sm:text-3xl text-gold-rare tracking-[0.2em] text-center">
              {session.join_code}
            </p>
            <p className="text-fantasy text-base text-[var(--color-silver-muted)] text-center mt-4 tracking-wide">
              {title}
            </p>
          </GlassCard>
        </header>

        <section className="flex flex-col gap-[var(--void-gap)] flex-1">
          {session.mode === "ai_dm" ? <PlayerSlot isAiDm /> : null}

          <div className="flex flex-col gap-[var(--void-gap)]">
            {slots.map(({ seat, player }) =>
              player ? (
                <PlayerSlot key={player.id} player={mapToSlotPlayer(player)} />
              ) : (
                <PlayerSlot key={`empty-${seat}`} isEmpty />
              ),
            )}
          </div>
        </section>

        <footer className="flex flex-col gap-3 mt-auto pt-4">
          {shareHint ? (
            <p className="text-center text-sm text-[var(--color-silver-muted)]">
              {shareHint}
            </p>
          ) : null}

          {iAmReady ? (
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[44px] flex items-center justify-center"
              disabled={readyLoading}
              onClick={handleReady}
            >
              {readyLoading ? "…" : "Ready"}
            </GoldButton>
          ) : (
            <GhostButton
              type="button"
              size="lg"
              className="w-full min-h-[44px] flex items-center justify-center border-[rgba(212,175,55,0.25)]"
              disabled={readyLoading}
              onClick={handleReady}
            >
              {readyLoading ? "…" : "Ready"}
            </GhostButton>
          )}

          {isHost ? (
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[44px] flex items-center justify-center"
              disabled={!canStart || startLoading}
              onClick={() => void handleStart()}
            >
              {startLoading ? "…" : "Start Adventure"}
            </GoldButton>
          ) : null}

          <GhostButton
            type="button"
            size="lg"
            className="w-full min-h-[44px] flex items-center justify-center"
            onClick={handleShare}
          >
            Share Invite
          </GhostButton>

          <GhostButton
            type="button"
            size="lg"
            className="w-full min-h-[44px] flex items-center justify-center"
            onClick={handleLeave}
          >
            Leave
          </GhostButton>
        </footer>
      </div>
    </main>
  );
}
