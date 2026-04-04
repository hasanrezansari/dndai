"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PlayerSlot, type PlayerSlotPlayer } from "@/components/lobby/player-slot";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { SkeletonCard } from "@/components/ui/loading-skeleton";
import { getPusherClient, getSessionChannel } from "@/lib/socket/client";
import type { Player, Session } from "@/lib/schemas/domain";
import { SessionStartedEventSchema } from "@/lib/schemas/events";
import { getBuildTimeBrand } from "@/lib/brand";
import { COPY } from "@/lib/copy/ashveil";
import { ROMA_MODULES } from "@/lib/rome/modules";
import { LOBBY_TONE_TAG_OPTIONS } from "@/lib/session/tone-tag-options";

type SessionWithPlayers = Session & { players: Player[] };

function partySharedRoleFromSession(s: Session | null): string {
  const pc = s?.party_config;
  if (!pc || typeof pc !== "object" || Array.isArray(pc)) return "";
  const v = (pc as { shared_role_label?: unknown }).shared_role_label;
  return typeof v === "string" ? v : "";
}

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
    const onSessionStarted = (raw: unknown) => {
      const parsed = SessionStartedEventSchema.safeParse(raw);
      if (!parsed.success) {
        router.push(`/character/${sessionId}`);
        return;
      }
      if (parsed.data.game_kind === "party") {
        router.push(`/session/${sessionId}`);
        return;
      }
      if (parsed.data.quick_play) {
        router.push(`/session/${sessionId}`);
        return;
      }
      router.push(`/character/${sessionId}`);
    };
    channel.bind("player-joined", bump);
    channel.bind("player-ready", bump);
    channel.bind("player-disconnected", bump);
    channel.bind("session-cap-updated", bump);
    channel.bind("session-premise-updated", bump);
    channel.bind("session-started", onSessionStarted);

    return () => {
      channel.unbind("player-joined");
      channel.unbind("player-ready");
      channel.unbind("player-disconnected");
      channel.unbind("session-cap-updated");
      channel.unbind("session-premise-updated");
      channel.unbind("session-started");
      pusher.unsubscribe(name);
    };
  }, [sessionId, refetchSession, router]);

  const me = useMemo(
    () => session?.players.find((p) => p.id === currentPlayerId),
    [session, currentPlayerId],
  );

  const isHost = Boolean(me?.is_host);
  const iAmReady = Boolean(me?.is_ready);

  const canStart = useMemo(() => {
    if (!session) return false;
    const { players } = session;
    if (players.length < 1) return false;
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
  const [capLoading, setCapLoading] = useState(false);

  const [draftAdventure, setDraftAdventure] = useState("");
  const [draftWorldBible, setDraftWorldBible] = useState("");
  const [draftArtDirection, setDraftArtDirection] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftSharedRoleLabel, setDraftSharedRoleLabel] = useState("");
  const [premiseSaving, setPremiseSaving] = useState(false);
  const [premiseError, setPremiseError] = useState<string | null>(null);
  const [playromanaAutoLobbyBusy, setPlayromanaAutoLobbyBusy] = useState(false);
  const [playromanaAutoLobbyError, setPlayromanaAutoLobbyError] = useState<
    string | null
  >(null);
  const playromanaAutoStartRef = useRef(false);

  const lobbyTeaser = useMemo(() => {
    const fallback =
      getBuildTimeBrand() === "playromana"
        ? "Gather your party. The portal stirs beyond the veil."
        : "Gather your party. Your story is about to begin.";
    if (!session) {
      return fallback;
    }
    const fromPrompt = session.adventure_prompt?.trim();
    const fromBible = session.world_bible?.trim().slice(0, 280);
    if (fromPrompt) return fromPrompt;
    if (fromBible) return fromBible;
    if (getBuildTimeBrand() === "playromana" && session.module_key) {
      const mod = ROMA_MODULES.find((x) => x.key === session.module_key);
      if (mod) return mod.pitch;
    }
    return fallback;
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setDraftAdventure(session.adventure_prompt ?? "");
    setDraftWorldBible(session.world_bible ?? "");
    setDraftArtDirection(session.art_direction ?? "");
    const raw = session.adventure_tags;
    setDraftTags(Array.isArray(raw) ? raw.map(String) : []);
    setDraftSharedRoleLabel(partySharedRoleFromSession(session));
  }, [
    session?.id,
    session?.adventure_prompt,
    session?.world_bible,
    session?.art_direction,
    session?.adventure_tags,
    session?.party_config,
    session?.game_kind,
  ]);

  async function handleSavePremise() {
    if (!sessionId || !session || !isHost || premiseSaving) return;
    setPremiseError(null);
    setPremiseSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adventure_prompt: draftAdventure.trim() || null,
          world_bible: draftWorldBible.trim() || null,
          art_direction: draftArtDirection.trim() || null,
          adventure_tags: draftTags,
          ...(session.game_kind === "party"
            ? { party_shared_role_label: draftSharedRoleLabel.trim() || null }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SessionWithPlayers & {
        error?: string;
      };
      if (!res.ok) {
        setPremiseError(
          typeof data.error === "string" ? data.error : "Could not save",
        );
        return;
      }
      setSession(data);
    } finally {
      setPremiseSaving(false);
    }
  }

  async function handleAddSeat() {
    if (!sessionId || !session || capLoading) return;
    if (session.max_players >= 6) return;
    setCapLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_players: session.max_players + 1 }),
      });
      const data = (await res.json().catch(() => ({}))) as SessionWithPlayers & {
        error?: string;
      };
      if (!res.ok) {
        window.alert(
          typeof data.error === "string" ? data.error : "Could not add seat",
        );
        return;
      }
      if ("id" in data && Array.isArray(data.players)) {
        setSession(data);
      } else {
        void refetchSession(sessionId);
      }
    } finally {
      setCapLoading(false);
    }
  }

  const playromanaQuickPlayEligible = Boolean(
    session &&
      getBuildTimeBrand() === "playromana" &&
      session.game_kind === "campaign" &&
      session.max_players === 1 &&
      session.players.length === 1,
  );

  async function handleStart() {
    if (!sessionId || !currentPlayerId || startLoading) return;
    setStartLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: currentPlayerId,
          ...(playromanaQuickPlayEligible ? { quickPlay: true } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        partyMode?: boolean;
        quickPlay?: boolean;
      };
      if (!res.ok) {
        window.alert(data.error ?? "Could not start");
        return;
      }
      if (data.partyMode) {
        router.push(`/session/${sessionId}`);
        return;
      }
      if (data.quickPlay) {
        router.push(`/session/${sessionId}`);
        return;
      }
      router.push(`/character/${sessionId}`);
    } finally {
      setStartLoading(false);
    }
  }

  useEffect(() => {
    if (getBuildTimeBrand() !== "playromana") return;
    if (!sessionId || !session || !currentPlayerId) return;
    if (session.game_kind !== "campaign") return;
    if (session.status !== "lobby") return;
    if (!isHost) return;
    if (session.max_players !== 1) return;
    if (session.players.length !== 1) return;
    if (playromanaAutoStartRef.current) return;

    playromanaAutoStartRef.current = true;
    setPlayromanaAutoLobbyBusy(true);
    setPlayromanaAutoLobbyError(null);

    async function run() {
      try {
        const readyRes = await fetch(`/api/sessions/${sessionId}/ready`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: currentPlayerId }),
        });
        if (!readyRes.ok) {
          playromanaAutoStartRef.current = false;
          setPlayromanaAutoLobbyError(
            "Could not ready up — try the buttons below.",
          );
          setPlayromanaAutoLobbyBusy(false);
          return;
        }
        const readyData = (await readyRes.json()) as { isReady?: boolean };
        const nextReady = Boolean(readyData.isReady);
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === currentPlayerId ? { ...p, is_ready: nextReady } : p,
            ),
          };
        });

        const startRes = await fetch(`/api/sessions/${sessionId}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: currentPlayerId,
            quickPlay: true,
          }),
        });
        const startData = (await startRes.json().catch(() => ({}))) as {
          error?: string;
          partyMode?: boolean;
          quickPlay?: boolean;
        };
        if (!startRes.ok) {
          playromanaAutoStartRef.current = false;
          setPlayromanaAutoLobbyError(
            typeof startData.error === "string"
              ? startData.error
              : "Could not start — use Begin Adventure below.",
          );
          setPlayromanaAutoLobbyBusy(false);
          return;
        }
        if (startData.partyMode) {
          router.push(`/session/${sessionId}`);
          return;
        }
        if (startData.quickPlay) {
          router.push(`/session/${sessionId}`);
          return;
        }
        router.push(`/character/${sessionId}`);
      } catch {
        playromanaAutoStartRef.current = false;
        setPlayromanaAutoLobbyError(
          "Something went wrong — try Ready / Begin below.",
        );
        setPlayromanaAutoLobbyBusy(false);
      }
    }

    void run();
  }, [
    sessionId,
    session,
    currentPlayerId,
    isHost,
    router,
  ]);

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
        <div className="flex flex-col flex-1 w-full max-w-lg mx-auto gap-[var(--void-gap-lg)]">
          <SkeletonCard className="min-h-[140px]" />
          <div className="flex flex-col gap-3 flex-1">
            <SkeletonCard className="min-h-[72px]" />
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} className="min-h-[72px]" />
            ))}
          </div>
          <p className="text-center text-[10px] text-[var(--color-silver-dim)] uppercase tracking-[0.2em]">
            {getBuildTimeBrand() === "playromana"
              ? "Entering the gathering circle…"
              : "Loading your table…"}
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

  return (
    <main className="min-h-dvh flex flex-col px-6 pb-10 bg-[var(--color-obsidian)]">
      <div className="flex flex-col flex-1 w-full max-w-lg mx-auto pt-8">
        {/* Header */}
        <header className="mb-8 relative">
          <div className="bg-gradient-to-b from-[var(--surface-container)]/90 to-[var(--color-obsidian)] rounded-[var(--radius-card)] px-6 py-8 text-center border border-[var(--border-ui)] backdrop-blur-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--outline)]">
              {getBuildTimeBrand() === "playromana"
                ? "Invitation Glyph"
                : "Join code"}
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <p className="text-fantasy text-4xl text-[var(--color-gold-rare)] tracking-[0.3em] font-black">
                {session.join_code}
              </p>
              <button
                type="button"
                onClick={handleShare}
                className="bg-[var(--surface-high)] p-2 rounded-[var(--radius-card)] border border-[var(--border-ui)] hover:border-[var(--color-gold-rare)]/30 transition-colors group min-h-[44px] min-w-[44px] items-center justify-center flex"
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

        {session.game_kind === "party" ? (
          <p className="mb-4 rounded-[var(--radius-card)] border border-white/10 bg-black/25 px-3 py-2 text-xs leading-relaxed text-[var(--color-silver-dim)]">
            Party mode: one shared story beat each round — you&apos;ll add lines
            for the same scene, then vote on which take moves things forward (no
            character builder here; your name is just for the table and
            scoreboard). Ready up when you&apos;re set.
          </p>
        ) : null}

        <section className="mb-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-ui)] shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
          <div className="relative aspect-[16/10]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/ashveil-start-cover.png"
              alt={
                getBuildTimeBrand() === "playromana"
                  ? "PlayRomana adventure key art"
                  : "WhatIfPlay story key art"
              }
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
                    {getBuildTimeBrand() === "playromana"
                      ? "Portal Forecast"
                      : "Story preview"}
                  </p>
                  <p className="mt-1 text-fantasy text-[13px] leading-relaxed text-[var(--color-silver-muted)]">
                    {lobbyTeaser}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isHost &&
        session.status === "lobby" &&
        getBuildTimeBrand() !== "playromana" ? (
          <section className="mb-6 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)]/45 backdrop-blur-sm p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
              {getBuildTimeBrand() === "playromana"
                ? "Tune the portal"
                : "Refine setup"}
            </p>
            <p className="text-[10px] text-[var(--outline)] leading-relaxed">
              Edit premise before start — party sees updates after you save.
            </p>
            {session.game_kind === "party" ? (
              <>
                <label className="block text-[9px] uppercase tracking-[0.15em] text-[var(--outline)]">
                  Shared story lens (optional)
                </label>
                <p className="text-[10px] text-[var(--outline)] leading-relaxed">
                  One label for the table&apos;s POV (e.g. the crew, the witness).
                  Not a character builder — names stay on the scoreboard only.
                </p>
                <input
                  type="text"
                  value={draftSharedRoleLabel}
                  onChange={(e) => setDraftSharedRoleLabel(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. the salvage crew"
                  className="w-full h-10 bg-[var(--color-deep-void)] px-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] text-sm text-[var(--color-silver-muted)] focus:border-[var(--color-gold-rare)]/40 focus:outline-none"
                />
              </>
            ) : null}
            <label className="block text-[9px] uppercase tracking-[0.15em] text-[var(--outline)]">
              {COPY.landing.narrativeSeedLabel}
            </label>
            <textarea
              value={draftAdventure}
              onChange={(e) => setDraftAdventure(e.target.value)}
              rows={3}
              maxLength={8000}
              className="w-full bg-[var(--color-deep-void)] p-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] text-sm text-[var(--color-silver-muted)] resize-none focus:border-[var(--color-gold-rare)]/40 focus:outline-none"
            />
            <label className="block text-[9px] uppercase tracking-[0.15em] text-[var(--outline)]">
              World bible
            </label>
            <textarea
              value={draftWorldBible}
              onChange={(e) => setDraftWorldBible(e.target.value)}
              rows={4}
              maxLength={32000}
              className="w-full bg-[var(--color-deep-void)] p-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] text-sm text-[var(--color-silver-muted)] resize-y min-h-[88px] focus:border-[var(--color-gold-rare)]/40 focus:outline-none"
            />
            <label className="block text-[9px] uppercase tracking-[0.15em] text-[var(--outline)]">
              Art direction
            </label>
            <input
              type="text"
              value={draftArtDirection}
              onChange={(e) => setDraftArtDirection(e.target.value)}
              maxLength={2000}
              className="w-full h-10 bg-[var(--color-deep-void)] px-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] text-sm text-[var(--color-silver-muted)] focus:border-[var(--color-gold-rare)]/40 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {LOBBY_TONE_TAG_OPTIONS.map((t) => {
                const on = draftTags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setDraftTags((prev) =>
                        on ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em] border ${
                      on
                        ? "border-[var(--color-gold-rare)] text-[var(--color-gold-rare)] bg-[var(--color-gold-rare)]/10"
                        : "border-[var(--border-ui-strong)] text-[var(--color-silver-dim)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {premiseError ? (
              <p className="text-xs text-[var(--color-failure)]">{premiseError}</p>
            ) : null}
            <GoldButton
              type="button"
              size="md"
              className="w-full min-h-[44px]"
              disabled={premiseSaving}
              onClick={() => void handleSavePremise()}
            >
              {premiseSaving ? "Saving…" : "Save premise"}
            </GoldButton>
          </section>
        ) : null}

        {/* Party List */}
        <section
          className="flex-1 space-y-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-ui)] divide-y divide-[var(--border-divide)]"
          aria-label="Players at the table"
        >
          {session.mode === "ai_dm" ? <PlayerSlot isAiDm /> : null}

          {slots.map(({ seat, player }) =>
            player ? (
              <PlayerSlot key={player.id} player={mapToSlotPlayer(player)} />
            ) : (
              <PlayerSlot key={`empty-${seat}`} isEmpty />
            ),
          )}
          {isHost && session.max_players < 6 ? (
            <button
              type="button"
              disabled={capLoading}
              onClick={() => void handleAddSeat()}
              className="w-full flex items-center justify-center gap-2 min-h-[56px] px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)] border-t border-[var(--border-divide)] bg-[var(--surface-high)]/40 hover:bg-[var(--surface-high)]/70 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              {capLoading ? "Opening seat…" : "Add seat — share code to invite"}
            </button>
          ) : null}
        </section>

        {/* Actions */}
        <footer className="mt-8 flex flex-col gap-3">
          {playromanaAutoLobbyBusy ? (
            <p className="text-center text-[10px] text-[var(--outline)] uppercase tracking-[0.15em]">
              Opening your story…
            </p>
          ) : null}
          {playromanaAutoLobbyError ? (
            <p className="text-center text-xs text-[var(--color-failure)] leading-relaxed px-1">
              {playromanaAutoLobbyError}
            </p>
          ) : null}
          {!iAmReady ? (
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[56px] flex items-center justify-center gap-3"
              disabled={readyLoading || playromanaAutoLobbyBusy}
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
              disabled={readyLoading || playromanaAutoLobbyBusy}
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
              disabled={!canStart || startLoading || playromanaAutoLobbyBusy}
              onClick={() => void handleStart()}
            >
              <span>
                {startLoading
                  ? getBuildTimeBrand() === "playromana"
                    ? "Opening portal…"
                    : "Starting…"
                  : getBuildTimeBrand() === "playromana"
                    ? "Begin Adventure"
                    : "Start story"}
              </span>
              <span className="material-symbols-outlined text-lg">swords</span>
            </GoldButton>
          ) : null}

          {sessionId ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-stretch">
                <GhostButton
                  type="button"
                  size="lg"
                  className="flex-1 min-h-[48px] flex items-center justify-center gap-2 border-[var(--border-ui-strong)]"
                  onClick={() => void openRoomDisplayInNewTab()}
                >
                  <span className="material-symbols-outlined text-lg">tv</span>
                  Room display
                </GhostButton>
                <button
                  type="button"
                  aria-label="Copy room display link"
                  className="shrink-0 min-h-[48px] min-w-[48px] rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--surface-high)]/50 flex items-center justify-center text-[var(--outline)] hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
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
