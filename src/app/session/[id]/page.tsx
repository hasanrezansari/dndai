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
import { StatPopupOverlay } from "@/components/game/stat-popup";
import { FeedList } from "@/components/feed/feed-list";
import { BeatStrip } from "@/components/game/beat-strip";
import { SessionViewModeToggle } from "@/components/game/session-view-mode-toggle";
import { useSessionUiMode } from "@/hooks/use-session-ui-mode";
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
        <div className="absolute bottom-5 left-5 right-4 h-9 rounded-sm bg-[var(--surface-high)] overflow-hidden relative max-w-[65%]">
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
        <div className="min-h-0 flex-1 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.15)] bg-[var(--surface-container)]/30 p-3">
          <SkeletonText lines={6} />
        </div>
        <div className="flex gap-4 items-center overflow-x-auto pb-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 shrink-0">
              <SkeletonCircle size={48} />
              <div className="h-1.5 w-12 rounded-sm bg-[var(--surface-high)] overflow-hidden relative">
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
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const { mode: sessionUiMode, setMode: setSessionUiMode } = useSessionUiMode();

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
      <BottomSheet
        isOpen={chronicleOpen}
        onClose={() => setChronicleOpen(false)}
        title="Chronicle"
      >
        <div className="flex h-[min(70vh,560px)] min-h-[240px] flex-col overflow-hidden">
          <FeedList entries={feed} className="min-h-0 flex-1" />
        </div>
      </BottomSheet>
      <DiceOverlay />
      <StatPopupOverlay />
      <div className="relative z-[1] h-[42vh] w-full shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={handleLeaveSession}
          className="absolute left-3 top-3 z-30 min-h-[36px] min-w-[36px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/80 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--outline)] transition-all hover:text-[var(--color-failure)] hover:border-[var(--color-failure)]/30 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Leave
        </button>
        <div className="absolute right-3 top-3 z-30 w-[min(100%,11.5rem)] max-w-[calc(100%-5rem)]">
          <SessionViewModeToggle
            mode={sessionUiMode}
            onChange={setSessionUiMode}
          />
        </div>
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
          <div className="flex shrink-0 items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
            <span className="h-px w-8 bg-[var(--color-gold-rare)]/30" />
            <span className="material-symbols-outlined text-xs">shield_person</span>
            DM View
            <span className="h-px w-8 bg-[var(--color-gold-rare)]/30" />
          </div>
        ) : null}
        {quest ? (
          <div className="shrink-0 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-container)]/50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm">flag</span>
                <p className="line-clamp-1 text-fantasy text-xs font-bold tracking-tight text-[var(--color-silver-muted)]">
                  {quest.objective}
                </p>
              </div>
              <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--outline)] bg-[var(--surface-high)] px-2 py-0.5 rounded-sm">
                {quest.status === "ready_to_end"
                  ? "Concluding"
                  : quest.status === "failed"
                    ? "Failed"
                    : "Active"}
              </span>
            </div>
            {quest.subObjectives?.length ? (
              <details className="mb-2">
                <summary className="cursor-pointer text-[10px] font-bold text-[var(--outline)] hover:text-[var(--color-silver-muted)] select-none uppercase tracking-wider">
                  Sub-objectives ({quest.subObjectives.length})
                </summary>
                <ul className="mt-1.5 ml-2 space-y-1 text-[10px] text-[var(--outline)]">
                  {quest.subObjectives.map((sub, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="material-symbols-outlined text-[var(--color-gold-rare)] text-[10px] mt-px shrink-0">check_circle</span>
                      <span className="line-clamp-1">{sub}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--color-deep-void)]">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-[var(--color-gold-support)] to-[var(--color-gold-rare)] transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, quest.progress))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
              <span className="text-[var(--outline)]">Progress {quest.progress}%</span>
              <span style={{ color: dangerLabel(quest.risk).color }}>
                {dangerLabel(quest.risk).label} ({quest.risk}%)
              </span>
            </div>
            {quest.endingVote?.open && currentPlayerId ? (
              <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/20 bg-[var(--surface-high)] p-3">
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-rare)] flex items-center gap-2">
                  <span className="material-symbols-outlined text-xs">how_to_vote</span>
                  {quest.endingVote.reason === "party_defeated" ? "Party Defeated" : "Objective Complete"}
                </p>
                <div className="mb-2 text-[10px] font-bold text-[var(--outline)]">
                  {Object.values(quest.endingVote.votes).filter((v) => v === "end_now").length}/{quest.endingVote.requiredYes} votes needed
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => void handleEndingVote("end_now")}
                    className="min-h-[40px] flex-1 rounded-[var(--radius-card)] bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] text-[10px] font-black uppercase tracking-wider disabled:opacity-30"
                  >
                    End Now
                  </button>
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => void handleEndingVote("continue")}
                    className="min-h-[40px] flex-1 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)] text-[10px] font-black uppercase tracking-wider text-[var(--color-silver-muted)] disabled:opacity-30"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}
            {session?.status === "ended" ? (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={chapterBusy || session.finalChapterPublished}
                  onClick={() => void handleGenerateFinalChapter()}
                  className="min-h-[40px] w-full rounded-[var(--radius-card)] bg-gradient-to-b from-[var(--color-gold-rare)] to-[var(--color-gold-support)] text-[var(--color-obsidian)] text-[10px] font-black uppercase tracking-wider disabled:opacity-30 disabled:grayscale"
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
        {sessionUiMode === "spotlight" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <BeatStrip />
            <button
              type="button"
              onClick={() => setChronicleOpen(true)}
              className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)]/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)]"
            >
              <span className="material-symbols-outlined text-base">menu_book</span>
              Open Chronicle
            </button>
            <div className="min-h-0 flex-1" aria-hidden />
          </div>
        ) : (
          <FeedList entries={feed} className="min-h-0 flex-1" />
        )}
        <PlayerStrip
          players={players}
          currentTurnPlayerId={currentTurnPlayerId}
        />
        <div className="sticky bottom-0 z-20 mt-auto shrink-0 pt-1">
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
