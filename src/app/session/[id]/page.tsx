"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ConnectionStatus } from "@/components/ui/connection-status";
import {
  SkeletonCard,
  SkeletonCircle,
  SkeletonText,
} from "@/components/ui/loading-skeleton";
import { DiceOverlay } from "@/components/dice/dice-overlay";
import { DmActionBar } from "@/components/dm/dm-action-bar";
import { ActionBar } from "@/components/game/action-bar";
import { BottomSheet } from "@/components/sheets/bottom-sheet";
import { CharacterSheet } from "@/components/sheets/character-sheet";
import { JournalSheet } from "@/components/sheets/journal-sheet";
import { PartySheet } from "@/components/sheets/party-sheet";
import { NarrativeCard } from "@/components/game/narrative-card";
import { PlayerStrip } from "@/components/game/player-strip";
import { SceneHeader } from "@/components/game/scene-header";
import { TurnBanner } from "@/components/game/turn-banner";
import { SceneTransition } from "@/components/game/scene-transition";
import { FeedList } from "@/components/feed/feed-list";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import { useGameStore } from "@/lib/state/game-store";

function dangerLabel(risk: number): { label: string; color: string } {
  if (risk >= 86) return { label: "Critical", color: "var(--gradient-hp-end)" };
  if (risk >= 61) return { label: "Perilous", color: "#e07c3a" };
  if (risk >= 31) return { label: "Uneasy", color: "var(--color-gold-rare)" };
  return { label: "Calm", color: "var(--color-silver-dim)" };
}

function atmosphereForPhase(phase: string | undefined): {
  gradient: string;
  glowColor: string;
} {
  switch (phase) {
    case "combat":
      return {
        gradient: "radial-gradient(ellipse at 50% 0%, rgba(139,37,0,0.18) 0%, transparent 70%)",
        glowColor: "rgba(139,37,0,0.12)",
      };
    case "social":
      return {
        gradient: "radial-gradient(ellipse at 50% 0%, rgba(184,134,11,0.12) 0%, transparent 70%)",
        glowColor: "rgba(184,134,11,0.08)",
      };
    case "rest":
      return {
        gradient: "radial-gradient(ellipse at 50% 0%, rgba(123,45,142,0.10) 0%, transparent 65%)",
        glowColor: "rgba(123,45,142,0.06)",
      };
    case "exploration":
    default:
      return {
        gradient: "radial-gradient(ellipse at 50% 0%, rgba(27,77,110,0.15) 0%, transparent 70%)",
        glowColor: "rgba(27,77,110,0.08)",
      };
  }
}

function SessionPlaySkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-obsidian)] animate-fade-in">
      <div className="relative z-0 h-[42vh] w-full shrink-0 overflow-hidden bg-[var(--color-deep-void)]">
        <span
          className="absolute inset-0 animate-shimmer opacity-25 pointer-events-none"
          aria-hidden
        />
        <div className="absolute bottom-4 left-4 right-4 h-9 rounded-md bg-[var(--color-midnight)]/70 overflow-hidden relative max-w-[65%]">
          <span
            className="absolute inset-0 animate-shimmer opacity-35 pointer-events-none"
            aria-hidden
          />
        </div>
      </div>
      <div className="relative z-10 shrink-0 px-4 -mt-3">
        <SkeletonCard className="min-h-[104px]" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[var(--void-gap)] px-4 pb-2 pt-[var(--void-gap)]">
        <div className="min-h-0 flex-1 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[rgba(255,255,255,0.06)] bg-[var(--glass-bg)]/40 p-3 backdrop-blur-sm">
          <SkeletonText lines={6} />
        </div>
        <div className="flex gap-3 items-center overflow-x-auto pb-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 shrink-0">
              <SkeletonCircle size={44} />
              <div className="h-2 w-11 rounded bg-[var(--color-midnight)]/80 overflow-hidden relative">
                <span
                  className="absolute inset-0 animate-shimmer opacity-30 pointer-events-none"
                  aria-hidden
                />
              </div>
            </div>
          ))}
        </div>
        <SkeletonCard className="min-h-[68px]" />
      </div>
    </div>
  );
}

export default function SessionGameplayPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params.id;
  const sessionId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0]!
        : "";

  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const feed = useGameStore((s) => s.feed);
  const sceneImage = useGameStore((s) => s.sceneImage);
  const previousSceneImage = useGameStore((s) => s.previousSceneImage);
  const sceneTitle = useGameStore((s) => s.sceneTitle);
  const scenePending = useGameStore((s) => s.scenePending);
  const narrativeText = useGameStore((s) => s.narrativeText);
  const isThinking = useGameStore((s) => s.isThinking);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const activeSheet = useGameStore((s) => s.activeSheet);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const isDm = useGameStore((s) => s.isDm);
  const waitingForDm = useGameStore((s) => s.waitingForDm);
  const quest = useGameStore((s) => s.quest);
  const setIsDm = useGameStore((s) => s.setIsDm);
  const setDmDc = useGameStore((s) => s.setDmDc);

  const setSessionId = useGameStore((s) => s.setSessionId);
  const setCurrentPlayerId = useGameStore((s) => s.setCurrentPlayerId);
  const hydrate = useGameStore((s) => s.hydrate);
  const setIsThinking = useGameStore((s) => s.setIsThinking);

  const { data: authSession, status: authStatus } = useSession();
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [sceneTransitionTrigger, setSceneTransitionTrigger] = useState(false);
  const [prevSceneTitle, setPrevSceneTitle] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(false);
  }, [sessionId]);

  useSessionChannel(sessionId || null);

  useEffect(() => {
    if (!sessionId) return;
    setSessionId(sessionId);
    if (authStatus === "loading") return;
    if (authStatus !== "authenticated" || !authSession?.user?.id) {
      setHydrated(true);
      return;
    }

    const userId = authSession.user.id;
    let cancelled = false;

    async function load() {
      try {
        setLoadError(null);
        const res = await fetch(`/api/sessions/${sessionId}/state`);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(`Failed to load session (${res.status})`);
          return;
        }
        const data = (await res.json()) as Parameters<typeof hydrate>[0];
        if (cancelled) return;
        hydrate(data);
        const me = data.players.find((p) => p.userId === userId);
        if (me) setCurrentPlayerId(me.id);
      } catch {
        if (!cancelled) setLoadError("Network error — could not load session.");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    authStatus,
    authSession?.user?.id,
    setSessionId,
    setCurrentPlayerId,
    hydrate,
  ]);

  useEffect(() => {
    if (!currentPlayerId) {
      setIsDm(false);
      return;
    }
    const me = players.find((p) => p.id === currentPlayerId);
    setIsDm(Boolean(me?.isDm));
  }, [currentPlayerId, players, setIsDm]);

  useEffect(() => {
    if (!sceneTitle || sceneTitle === prevSceneTitle) return;
    if (prevSceneTitle !== null) {
      setSceneTransitionTrigger(true);
      const timer = setTimeout(() => setSceneTransitionTrigger(false), 100);
      return () => clearTimeout(timer);
    }
    setPrevSceneTitle(sceneTitle);
  }, [sceneTitle, prevSceneTitle]);

  useEffect(() => {
    if (sceneTitle) setPrevSceneTitle(sceneTitle);
  }, [sceneTitle]);

  const currentTurnPlayerId = session?.currentPlayerId ?? null;
  const isMyTurn =
    !!currentPlayerId &&
    !!currentTurnPlayerId &&
    currentPlayerId === currentTurnPlayerId;

  const currentPlayerName = useMemo(() => {
    if (!currentTurnPlayerId) return null;
    const p = players.find((x) => x.id === currentTurnPlayerId);
    return p?.character?.name ?? null;
  }, [players, currentTurnPlayerId]);

  const handleSubmitAction = useCallback(
    async (text: string) => {
      const st = useGameStore.getState();
      const pid = st.currentPlayerId;
      if (!pid || !sessionId) return;
      setIsThinking(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: pid, text }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setIsThinking(false);
          window.alert(body.error ?? "Action failed");
          return;
        }
        setIsThinking(false);
      } catch {
        setIsThinking(false);
        window.alert("Action failed");
      }
    },
    [sessionId, setIsThinking],
  );

  const handleDmNarrate = useCallback(
    async (text: string) => {
      const st = useGameStore.getState();
      const pid = st.currentPlayerId;
      const turnId = st.dmAwaiting?.turnId;
      if (!pid || !sessionId || !turnId) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/dm/narrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: pid,
            turnId,
            narrationText: text,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          window.alert(body.error ?? "Narration failed");
        }
      } catch {
        window.alert("Narration failed");
      }
    },
    [sessionId],
  );

  const handleDmSetDc = useCallback(
    async (dc: number) => {
      const pid = useGameStore.getState().currentPlayerId;
      if (!pid || !sessionId) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/dm/set-dc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: pid, dc }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          window.alert(body.error ?? "Could not set DC");
          return;
        }
        setDmDc(dc);
      } catch {
        window.alert("Could not set DC");
      }
    },
    [sessionId, setDmDc],
  );

  const handleDmAdvanceTurn = useCallback(async () => {
    const st = useGameStore.getState();
    const pid = st.currentPlayerId;
    const turnId = st.dmAwaiting?.turnId;
    if (!pid || !sessionId || !turnId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dm/advance-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: pid, turnId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(body.error ?? "Could not advance turn");
      }
    } catch {
      window.alert("Could not advance turn");
    }
  }, [sessionId]);

  const handleDmTriggerEvent = useCallback(
    async (eventText: string) => {
      const pid = useGameStore.getState().currentPlayerId;
      if (!pid || !sessionId) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/dm/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: pid, eventText }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          window.alert(body.error ?? "Event failed");
        }
      } catch {
        window.alert("Event failed");
      }
    },
    [sessionId],
  );

  const handleLeaveSession = useCallback(() => {
    if (window.confirm("Leave this session?")) {
      useGameStore.getState().reset();
      router.push("/");
    }
  }, [router]);

  const handleEndingVote = useCallback(
    async (choice: "end_now" | "continue") => {
      if (!sessionId || !currentPlayerId || voteBusy) return;
      setVoteBusy(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/vote-end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: currentPlayerId, choice }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          window.alert(body.error ?? "Could not submit vote");
        }
      } catch {
        window.alert("Could not submit vote");
      } finally {
        setVoteBusy(false);
      }
    },
    [sessionId, currentPlayerId, voteBusy],
  );

  const handleGenerateFinalChapter = useCallback(async () => {
    if (!sessionId || !currentPlayerId || chapterBusy) return;
    setChapterBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/final-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(body.error ?? "Could not generate final chapter");
      }
    } catch {
      window.alert("Could not generate final chapter");
    } finally {
      setChapterBusy(false);
    }
  }, [sessionId, currentPlayerId, chapterBusy]);

  if (!sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-obsidian)] px-4 text-[var(--color-silver-dim)]">
        Invalid session
      </div>
    );
  }

  if (!hydrated) {
    return (
      <>
        <SessionPlaySkeleton />
        <ConnectionStatus />
      </>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-obsidian)] px-6 text-center">
        <p className="text-sm text-[var(--color-silver-muted)]">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setHydrated(false);
            setLoadError(null);
          }}
          className="min-h-[44px] rounded-[var(--radius-chip)] border border-white/15 bg-[var(--glass-bg)]/40 px-5 py-2 text-sm font-medium text-[var(--color-silver-muted)] backdrop-blur-sm transition-colors hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    );
  }

  const atmosphere = atmosphereForPhase(session?.phase);

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--color-obsidian)]">
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000"
        style={{ background: atmosphere.gradient }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-1 transition-colors duration-1000"
        style={{ boxShadow: `0 0 80px 40px ${atmosphere.glowColor}` }}
        aria-hidden
      />
      <SceneTransition
        imageUrl={sceneImage}
        locationTitle={sceneTitle}
        trigger={sceneTransitionTrigger}
      />
      <ConnectionStatus />
      {activeSheet === "character" && (
        <BottomSheet isOpen onClose={closeSheet} title="Character">
          <CharacterSheet />
        </BottomSheet>
      )}
      {activeSheet === "party" && (
        <BottomSheet isOpen onClose={closeSheet} title="Party">
          <PartySheet />
        </BottomSheet>
      )}
      {activeSheet === "journal" && (
        <BottomSheet isOpen onClose={closeSheet} title="Journal">
          <JournalSheet />
        </BottomSheet>
      )}
      <DiceOverlay />
      <div className="relative z-[1] h-[42vh] w-full shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={handleLeaveSession}
          className="absolute left-3 top-3 z-30 min-h-[36px] min-w-[36px] rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-medium text-[var(--color-silver-dim)] backdrop-blur-md transition-colors hover:bg-black/70 hover:text-[var(--color-silver-muted)]"
        >
          Leave
        </button>
        <SceneHeader
          sceneImage={sceneImage}
          previousSceneImage={previousSceneImage}
          sceneTitle={sceneTitle}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={currentPlayerName}
          scenePending={scenePending}
        />
      </div>

      <div className="relative z-[2] shrink-0 px-4">
        <NarrativeCard text={narrativeText} isThinking={isThinking} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[var(--void-gap)] px-4 pb-2 pt-[var(--void-gap)]">
        {session?.mode === "human_dm" && isDm ? (
          <div className="flex shrink-0 items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-gold-support)]">
            <span className="h-px w-8 bg-[var(--color-gold-rare)]/45" />
            DM view
            <span className="h-px w-8 bg-[var(--color-gold-rare)]/45" />
          </div>
        ) : null}
        {quest ? (
          <div className="shrink-0 rounded-[var(--radius-card)] border border-white/[0.08] bg-[var(--glass-bg)]/35 px-3 py-2 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="line-clamp-1 text-fantasy text-xs tracking-wide text-[var(--color-silver-muted)]">
                Objective: {quest.objective}
              </p>
              <span className="text-data shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-silver-dim)]">
                {quest.status === "ready_to_end"
                  ? "Ready to conclude"
                  : quest.status === "failed"
                    ? "Failed"
                    : "Active"}
              </span>
            </div>
            {quest.subObjectives?.length ? (
              <details className="mb-1.5">
                <summary className="cursor-pointer text-[10px] text-[var(--color-silver-dim)] hover:text-[var(--color-silver-muted)] select-none">
                  Sub-objectives ({quest.subObjectives.length})
                </summary>
                <ul className="mt-1 ml-2 space-y-0.5 text-[10px] text-[var(--color-silver-dim)]">
                  {quest.subObjectives.map((sub, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="shrink-0 text-[var(--color-gold-support)]">·</span>
                      <span className="line-clamp-1">{sub}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-[var(--color-gold-rare)] transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, quest.progress))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-data text-[10px] text-[var(--color-silver-dim)]">
              <span>Progress {quest.progress}%</span>
              <span style={{ color: dangerLabel(quest.risk).color }}>
                {dangerLabel(quest.risk).label} ({quest.risk}%)
              </span>
            </div>
            {quest.endingVote?.open && currentPlayerId ? (
              <div className="mt-2 rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/25 bg-black/20 p-2">
                <p className="mb-2 text-data text-[10px] uppercase tracking-wider text-[var(--color-gold-support)]">
                  End vote: {quest.endingVote.reason === "party_defeated" ? "Party Defeated" : "Objective Complete"}
                </p>
                <div className="mb-1 text-data text-[10px] text-[var(--color-silver-dim)]">
                  {Object.values(quest.endingVote.votes).filter((v) => v === "end_now").length}/{quest.endingVote.requiredYes} votes needed
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => void handleEndingVote("end_now")}
                    className="min-h-[36px] flex-1 rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/35 bg-[var(--color-gold-rare)]/15 px-2 text-data text-[11px] font-medium text-[var(--color-silver-muted)] disabled:opacity-50"
                  >
                    End Now
                  </button>
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => void handleEndingVote("continue")}
                    className="min-h-[36px] flex-1 rounded-[var(--radius-chip)] border border-white/15 bg-black/20 px-2 text-data text-[11px] font-medium text-[var(--color-silver-muted)] disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}
            {session?.status === "ended" ? (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={chapterBusy || session.finalChapterPublished}
                  onClick={() => void handleGenerateFinalChapter()}
                  className="min-h-[36px] w-full rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/35 bg-[var(--color-gold-rare)]/10 px-2 text-data text-[11px] font-medium text-[var(--color-silver-muted)] disabled:opacity-50"
                >
                  {session.finalChapterPublished
                    ? "Final Chapter Published"
                    : chapterBusy
                      ? "Publishing..."
                      : "Generate Final Chapter"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <FeedList entries={feed} className="min-h-0 flex-1" />
        <PlayerStrip
          players={players}
          currentTurnPlayerId={currentTurnPlayerId}
        />
        <div className="sticky bottom-0 z-20 mt-auto shrink-0 bg-[var(--color-obsidian)]/75 pt-2 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--color-obsidian)]/60">
          <TurnBanner visible={isMyTurn && !(session?.mode === "human_dm" && isDm)} />
          {session?.mode === "human_dm" && isDm && currentPlayerId ? (
            <DmActionBar
              sessionId={sessionId}
              playerId={currentPlayerId}
              waitingForDm={waitingForDm}
              onNarrate={handleDmNarrate}
              onSetDC={handleDmSetDc}
              onAdvanceTurn={handleDmAdvanceTurn}
              onTriggerEvent={handleDmTriggerEvent}
            />
          ) : (
            <ActionBar
              isMyTurn={isMyTurn}
              currentPlayerName={currentPlayerName}
              onSubmitAction={handleSubmitAction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
