"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PlayerSlot, type PlayerSlotPlayer } from "@/components/lobby/player-slot";
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
  const [shareDisplayHint, setShareDisplayHint] = useState<string | null>(null);

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

  async function openRoomDisplayInNewTab() {
    if (!sessionId || typeof window === "undefined") return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/display-token`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok) {
        window.alert(body.error ?? "Could not open room display");
        return;
      }
      if (!body.path) return;
      window.open(
        `${window.location.origin}${body.path}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      window.alert("Could not open room display");
    }
  }

  async function copyRoomDisplayLink() {
    if (!sessionId || typeof window === "undefined") return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/display-token`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok) {
        setShareDisplayHint(body.error ?? "Could not create link");
        setTimeout(() => setShareDisplayHint(null), 2500);
        return;
      }
      if (!body.path) return;
      const url = `${window.location.origin}${body.path}`;
      await navigator.clipboard.writeText(url);
      setShareDisplayHint("TV link copied");
      setTimeout(() => setShareDisplayHint(null), 2000);
    } catch {
      setShareDisplayHint("Copy failed");
      setTimeout(() => setShareDisplayHint(null), 2000);
    }
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
      <main className="min-h-dvh flex flex-col px-6 pt-10 pb-10 bg-[var(--color-obsidian)]">
        <div className="flex flex-col flex-1 w-full max-w-md mx-auto gap-[var(--void-gap-lg)]">
          <SkeletonCard className="min-h-[140px]" />
          <div className="flex flex-col gap-3 flex-1">
            <SkeletonCard className="min-h-[72px]" />
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} className="min-h-[72px]" />
            ))}
          </div>
          <p className="text-center text-[10px] text-[var(--color-silver-dim)] uppercase tracking-[0.2em]">
            Entering the gathering circle…
          </p>
        </div>
      </main>
    );
  }

  if (loadError || !session) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-[var(--void-gap)] px-6 bg-[var(--color-obsidian)]">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-[var(--color-failure)]">
            warning
          </span>
          <p className="text-[var(--color-silver-muted)] text-base">
            {loadError ?? "Session unavailable"}
          </p>
          <GhostButton
            type="button"
            size="md"
            className="min-h-[44px] flex items-center justify-center"
            onClick={() => router.push("/")}
          >
            Return home
          </GhostButton>
        </div>
      </main>
    );
  }

  const readyCount = session.players.filter(
    (p) => p.is_ready && p.is_connected,
  ).length;
  const totalSeats = session.max_players;
  const lobbyTeaser =
    session.adventure_prompt?.trim() ||
    "Gather your party. The portal stirs beyond the veil.";

  return (
    <main className="min-h-dvh flex flex-col px-6 pb-10 bg-[var(--color-obsidian)]">
      <div className="flex flex-col flex-1 w-full max-w-md mx-auto pt-8">
        {/* Header */}
        <header className="mb-8 relative">
          <div className="bg-gradient-to-b from-[var(--surface-container)] to-[var(--color-obsidian)] rounded-[var(--radius-card)] px-6 py-8 text-center border border-[rgba(77,70,53,0.15)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--outline)]">
              Invitation Glyph
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <p className="text-fantasy text-4xl text-[var(--color-gold-rare)] tracking-[0.3em] font-black">
                {session.join_code}
              </p>
              <button
                type="button"
                onClick={handleShare}
                className="bg-[var(--surface-high)] p-2 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] hover:border-[var(--color-gold-rare)]/30 transition-colors group"
                aria-label="Copy join code"
              >
                <span className="material-symbols-outlined text-[var(--outline)] group-hover:text-[var(--color-gold-rare)] text-lg transition-colors">
                  content_copy
                </span>
              </button>
            </div>
            {shareHint && (
              <p className="text-[10px] text-[var(--color-gold-rare)] mt-2 animate-fade-in uppercase tracking-[0.15em]">
                {shareHint}
              </p>
            )}
            <h2 className="text-fantasy text-lg text-[var(--color-silver-muted)] mt-5 tracking-tight">
              {title}
            </h2>
            <p className="text-[10px] text-[var(--outline)] uppercase tracking-wider mt-1 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-xs">group</span>
              {readyCount} / {totalSeats} ready
            </p>
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.18)]">
          <div className="relative aspect-[16/10]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/ashveil-start-cover.png"
              alt="Ashveil adventure key art"
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/68 to-transparent" />
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="h-full w-full animate-shimmer" />
            </div>
            <div className="absolute inset-x-0 bottom-0 z-[1] px-4 pb-4 pt-8">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-avatar)] border border-[var(--color-gold-rare)]/35 bg-[var(--surface-high)]/85 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-[var(--color-gold-rare)]">
                    auto_awesome
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--color-gold-rare)]">
                    Portal Forecast
                  </p>
                  <p className="mt-1 text-fantasy text-[13px] leading-relaxed text-[var(--color-silver-muted)]">
                    {lobbyTeaser}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Party List */}
        <section className="flex-1 space-y-0 overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.15)] divide-y divide-[rgba(77,70,53,0.1)]">
          {session.mode === "ai_dm" ? <PlayerSlot isAiDm /> : null}

          {slots.map(({ seat, player }) =>
            player ? (
              <PlayerSlot key={player.id} player={mapToSlotPlayer(player)} />
            ) : (
              <PlayerSlot key={`empty-${seat}`} isEmpty />
            ),
          )}
        </section>

        {/* Actions */}
        <footer className="mt-8 flex flex-col gap-3">
          {!iAmReady ? (
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[56px] flex items-center justify-center gap-3"
              disabled={readyLoading}
              onClick={handleReady}
            >
              <span className="material-symbols-outlined text-lg">
                how_to_reg
              </span>
              {readyLoading ? "…" : "Ready Up"}
            </GoldButton>
          ) : (
            <GhostButton
              type="button"
              size="lg"
              className="w-full min-h-[56px] flex items-center justify-center gap-3 border-[var(--color-gold-rare)]/30 text-[var(--color-gold-rare)]"
              disabled={readyLoading}
              onClick={handleReady}
            >
              <span
                className="material-symbols-outlined text-lg"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              {readyLoading ? "…" : "Ready — Tap to Unready"}
            </GhostButton>
          )}

          {isHost ? (
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[56px] flex items-center justify-center gap-3"
              disabled={!canStart || startLoading}
              onClick={() => void handleStart()}
            >
              <span>{startLoading ? "Opening portal…" : "Begin Adventure"}</span>
              <span className="material-symbols-outlined text-lg">swords</span>
            </GoldButton>
          ) : null}

          {sessionId ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-stretch">
                <GhostButton
                  type="button"
                  size="lg"
                  className="flex-1 min-h-[48px] flex items-center justify-center gap-2 border-[rgba(77,70,53,0.25)]"
                  onClick={() => void openRoomDisplayInNewTab()}
                >
                  <span className="material-symbols-outlined text-lg">tv</span>
                  Room display
                </GhostButton>
                <button
                  type="button"
                  aria-label="Copy room display link"
                  className="shrink-0 min-h-[48px] min-w-[48px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)]/50 flex items-center justify-center text-[var(--outline)] hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)] transition-colors"
                  onClick={() => void copyRoomDisplayLink()}
                >
                  <span className="material-symbols-outlined text-lg">
                    content_copy
                  </span>
                </button>
              </div>
              {shareDisplayHint ? (
                <p className="text-[10px] text-[var(--color-gold-rare)] text-center uppercase tracking-[0.15em]">
                  {shareDisplayHint}
                </p>
              ) : null}
              {session?.join_code ? (
                <p className="text-[10px] text-[var(--color-silver-dim)] text-center leading-relaxed px-1">
                  On a TV: home → Watch on TV → code{" "}
                  <span className="font-mono text-[var(--color-gold-support)] tracking-[0.15em]">
                    {session.join_code}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            className="w-full py-3 text-[var(--color-silver-dim)] hover:text-[var(--color-failure)] text-xs uppercase tracking-[0.15em] transition-colors flex items-center justify-center gap-2"
            onClick={handleLeave}
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Leave Lobby
          </button>
        </footer>
      </div>
    </main>
  );
}
