"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectionStatus } from "@/components/ui/connection-status";
import { GhostButton } from "@/components/ui/ghost-button";
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
import { CombatStrip } from "@/components/game/combat-strip";
import { EnemyDetailPanel } from "@/components/game/enemy-detail-panel";
import { QuestDock, QuestSheet } from "@/components/game/quest-pill";
import { SceneDetailPanel } from "@/components/game/scene-detail-sheet";
import { SceneHeader } from "@/components/game/scene-header";
import { TurnBanner } from "@/components/game/turn-banner";
import { SceneTransition } from "@/components/game/scene-transition";
import { StatPopupOverlay } from "@/components/game/stat-popup";
import { TutorialOverlay } from "@/components/game/tutorial-overlay";
import { ChronicleFeed } from "@/components/feed/chronicle-feed";
import { FeedList } from "@/components/feed/feed-list";
import { BeatStrip } from "@/components/game/beat-strip";
import { PartySessionCard } from "@/components/game/party-session-card";
import { PartyPlayPanel } from "@/components/game/party-play-panel";
import { SessionViewModeToggle } from "@/components/game/session-view-mode-toggle";
import { useGuidedTurnUi } from "@/hooks/use-guided-turn-ui";
import { useSessionUiMode } from "@/hooks/use-session-ui-mode";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import {
  useGameStore,
  type SessionStatePayload,
} from "@/lib/state/game-store";
import { useToast } from "@/components/ui/toast";

function formatPhaseLabel(phase: string | undefined): string | null {
  if (!phase?.trim()) return null;
  return phase
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
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
      <div className="relative z-0 h-[min(36vh,320px)] w-full shrink-0 overflow-hidden bg-[var(--color-deep-void)]">
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
  const npcs = useGameStore((s) => s.npcs);
  const setIsDm = useGameStore((s) => s.setIsDm);
  const setDmDc = useGameStore((s) => s.setDmDc);

  const setSessionId = useGameStore((s) => s.setSessionId);
  const setCurrentPlayerId = useGameStore((s) => s.setCurrentPlayerId);
  const hydrate = useGameStore((s) => s.hydrate);
  const setIsThinking = useGameStore((s) => s.setIsThinking);

  const { data: authSession, status: authStatus } = useSession();
  const { toast } = useToast();
  const [saveBusy, setSaveBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [sceneTransitionTrigger, setSceneTransitionTrigger] = useState(false);
  /** First beat vs later location changes (copy on the intro overlay). */
  const [sceneTransitionKind, setSceneTransitionKind] = useState<
    "opening" | "location"
  >("location");
  /** Last scene title we saw — ref avoids a second effect syncing state that cancelled the dismiss timer. */
  const prevSceneTitleRef = useRef<string | null>(null);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [displayLinkHint, setDisplayLinkHint] = useState<string | null>(null);
  const [sceneDetailOpen, setSceneDetailOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [partyInspectPlayerId, setPartyInspectPlayerId] = useState<
    string | null
  >(null);
  const [enemyInspectNpcId, setEnemyInspectNpcId] = useState<string | null>(
    null,
  );
  const { mode: sessionUiMode, setMode: setSessionUiMode } = useSessionUiMode();
  const { guidedTurnUi, toggleGuidedTurnUi } = useGuidedTurnUi();
  const myActionCount = useMemo(() => {
    if (!currentPlayerId) return 0;
    return feed.filter(
      (e) => e.type === "action" && e.playerId === currentPlayerId,
    ).length;
  }, [feed, currentPlayerId]);

  const phaseLabel = useMemo(
    () => formatPhaseLabel(session?.phase),
    [session?.phase],
  );

  const partyInspectTitle = useMemo(() => {
    if (!partyInspectPlayerId) return "Party member";
    const p = players.find((x) => x.id === partyInspectPlayerId);
    return (
      p?.character?.name?.trim() ||
      p?.displayName?.trim() ||
      `Seat ${(p?.seatIndex ?? 0) + 1}`
    );
  }, [partyInspectPlayerId, players]);

  const inspectedEnemy = useMemo(
    () => npcs.find((n) => n.id === enemyInspectNpcId) ?? null,
    [npcs, enemyInspectNpcId],
  );

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
        const data = (await res.json()) as SessionStatePayload;
        if (cancelled) return;
        hydrate(data);
        const me = data.players.find((p) => p.userId === userId);
        if (me) setCurrentPlayerId(me.id);
        const title = data.sceneTitle?.trim();
        const recap = data.narrativeText?.trim();
        if (title || recap) {
          toast(
            title
              ? `Resumed: ${title}`
              : `Resumed: ${(recap ?? "").slice(0, 56)}${(recap?.length ?? 0) > 56 ? "…" : ""}`,
            "info",
          );
        }
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
    toast,
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
    prevSceneTitleRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (!sceneTitle || !sessionId) return;
    const prev = prevSceneTitleRef.current;
    if (sceneTitle === prev) return;

    const isResume =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(`ashveil.sceneIntro.v1.${sessionId}`) ===
        "1";

    /** Skip the full-screen “opening” once per browser tab for this session (resume from Adventures / reload). */
    if (prev === null && isResume) {
      prevSceneTitleRef.current = sceneTitle;
      return;
    }

    if (prev === null && typeof window !== "undefined") {
      window.sessionStorage.setItem(`ashveil.sceneIntro.v1.${sessionId}`, "1");
    }

    setSceneTransitionKind(prev === null ? "opening" : "location");
    setSceneTransitionTrigger(true);
    prevSceneTitleRef.current = sceneTitle;
    const timer = setTimeout(() => setSceneTransitionTrigger(false), 5000);
    return () => {
      clearTimeout(timer);
      setSceneTransitionTrigger(false);
    };
  }, [sceneTitle, sessionId]);

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
        setQuestOpen(false);
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

  const openRoomDisplayInNewTab = useCallback(async () => {
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
  }, [sessionId]);

  const copyRoomDisplayLink = useCallback(async () => {
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
        setDisplayLinkHint(body.error ?? "Could not create link");
        setTimeout(() => setDisplayLinkHint(null), 2500);
        return;
      }
      if (!body.path) return;
      const url = `${window.location.origin}${body.path}`;
      await navigator.clipboard.writeText(url);
      setDisplayLinkHint("TV link copied");
      setTimeout(() => setDisplayLinkHint(null), 2000);
    } catch {
      setDisplayLinkHint("Copy failed");
      setTimeout(() => setDisplayLinkHint(null), 2000);
    }
  }, [sessionId]);

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

  if (session?.gameKind === "party" && session.status === "active") {
    if (!session.party) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--color-obsidian)] px-6">
          <ConnectionStatus />
          <p className="text-sm text-[var(--color-silver-muted)]">
            Party state unavailable — try refresh.
          </p>
          <GhostButton type="button" onClick={() => window.location.reload()}>
            Refresh
          </GhostButton>
        </div>
      );
    }
    const party = session.party;
    const partyPhaseLabel = formatPhaseLabel(party.partyPhase);
    const partySceneImage = sceneImage ?? party.sceneImageUrl ?? null;

    return (
      <div className="relative flex min-h-dvh flex-col bg-[var(--color-obsidian)]">
        <SceneTransition
          imageUrl={partySceneImage}
          locationTitle={sceneTitle}
          trigger={sceneTransitionTrigger}
          kind={sceneTransitionKind}
          onDismiss={() => setSceneTransitionTrigger(false)}
        />
        <ConnectionStatus />
        <div className="relative z-[1] h-[min(36vh,320px)] w-full shrink-0 overflow-hidden">
          <button
            type="button"
            onClick={handleLeaveSession}
            className="absolute left-3 top-3 z-30 min-h-[36px] min-w-[36px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/80 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--outline)] transition-all hover:border-[var(--color-failure)]/30 hover:text-[var(--color-failure)] flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Leave
          </button>
          <SceneHeader
            sceneImage={partySceneImage}
            previousSceneImage={previousSceneImage}
            sceneTitle={sceneTitle}
            roundNumber={party.roundIndex}
            currentPlayerName={null}
            scenePending={scenePending}
            phase={null}
            phaseLabel={partyPhaseLabel}
            teaser={null}
            showTapHint={false}
            showTurnWhenNoTeaser={false}
          />
        </div>
        {narrativeText?.trim() ? (
          <div className="relative z-[2] shrink-0 px-4 pb-2 pt-1">
            <PartySessionCard title="Scene" contentClassName="">
              <p className="text-fantasy text-sm leading-relaxed text-[var(--color-silver-muted)] whitespace-pre-wrap">
                {narrativeText}
              </p>
            </PartySessionCard>
          </div>
        ) : null}
        <div className="relative z-[2] min-h-0 flex-1 overflow-y-auto">
          <PartyPlayPanel
            sessionId={sessionId}
            currentPlayerId={currentPlayerId}
            party={party}
            players={players}
            sceneNarrativeForDedupe={narrativeText}
          />
        </div>
        <div className="mt-auto border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <GhostButton type="button" onClick={handleLeaveSession}>
            Leave session
          </GhostButton>
        </div>
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
        kind={sceneTransitionKind}
        onDismiss={() => setSceneTransitionTrigger(false)}
      />
      <ConnectionStatus />
      <TutorialOverlay
        moduleKey={session?.moduleKey}
        myActionCount={myActionCount}
        currentTurnIndex={session?.currentTurnIndex ?? 0}
        userEmail={authSession?.user?.email ?? null}
        onFinish={() => router.push("/")}
      />
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
      {partyInspectPlayerId ? (
        <BottomSheet
          isOpen
          onClose={() => setPartyInspectPlayerId(null)}
          title={partyInspectTitle}
        >
          <CharacterSheet viewPlayerId={partyInspectPlayerId} />
        </BottomSheet>
      ) : null}
      {inspectedEnemy ? (
        <BottomSheet
          isOpen
          onClose={() => setEnemyInspectNpcId(null)}
          title={inspectedEnemy.name}
        >
          <EnemyDetailPanel npc={inspectedEnemy} />
        </BottomSheet>
      ) : null}
      <BottomSheet
        isOpen={sceneDetailOpen}
        onClose={() => setSceneDetailOpen(false)}
        title="Scene & lore"
      >
        <SceneDetailPanel
          sceneImage={sceneImage}
          previousSceneImage={previousSceneImage}
          sceneTitle={sceneTitle}
          narrativeText={narrativeText}
          onSaveProgress={() => {
            toast("Progress saved.", "success");
          }}
          onSaveAndExit={() => {
            if (saveBusy) return;
            setSaveBusy(true);
            void (async () => {
              try {
                const st = useGameStore.getState();
                const pid = st.currentPlayerId;
                if (pid && sessionId) {
                  await fetch(`/api/sessions/${sessionId}/disconnect`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ playerId: pid }),
                  });
                }
              } catch {
                // best effort
              } finally {
                toast("Saved. See you soon.", "success");
                setSaveBusy(false);
                router.push("/adventures");
              }
            })();
          }}
        />
      </BottomSheet>
      <BottomSheet
        isOpen={chronicleOpen}
        onClose={() => setChronicleOpen(false)}
        title="Chronicle"
        fullHeight
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <ChronicleFeed entries={feed} className="min-h-0 flex-1" />
        </div>
      </BottomSheet>
      <BottomSheet
        isOpen={questOpen}
        onClose={() => setQuestOpen(false)}
        title="Quest"
      >
        {quest ? (
          <QuestSheet
            quest={quest}
            session={session}
            currentPlayerId={currentPlayerId}
            voteBusy={voteBusy}
            chapterBusy={chapterBusy}
            onEndingVote={(choice) => void handleEndingVote(choice)}
            onGenerateFinalChapter={() => void handleGenerateFinalChapter()}
          />
        ) : null}
      </BottomSheet>
      <DiceOverlay />
      <StatPopupOverlay />
      <div className="relative z-[1] h-[min(36vh,320px)] w-full shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={handleLeaveSession}
          className="absolute left-3 top-3 z-30 min-h-[36px] min-w-[36px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/80 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--outline)] transition-all hover:text-[var(--color-failure)] hover:border-[var(--color-failure)]/30 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Leave
        </button>
        <SceneHeader
          sceneImage={sceneImage}
          previousSceneImage={previousSceneImage}
          sceneTitle={sceneTitle}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={currentPlayerName}
          scenePending={scenePending}
          phase={session?.phase ?? null}
          phaseLabel={phaseLabel}
          teaser={narrativeText}
          onOpenDetails={() => setSceneDetailOpen(true)}
        />
      </div>

      <div className="relative z-[2] shrink-0 space-y-2 px-4">
        <NarrativeCard
          isThinking={isThinking}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={currentPlayerName}
          phaseLabel={phaseLabel}
        />
        <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.18)] bg-[var(--surface-container)]/30 px-3 py-2.5">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Table layout
          </p>
          <SessionViewModeToggle
            mode={sessionUiMode}
            onChange={setSessionUiMode}
          />
          <div className="mt-3 flex gap-2 items-stretch">
            <GhostButton
              type="button"
              size="md"
              className="min-h-[44px] flex-1 border-[rgba(77,70,53,0.22)]"
              onClick={() => void openRoomDisplayInNewTab()}
            >
              <span className="material-symbols-outlined text-base">tv</span>
              Room display
            </GhostButton>
            <button
              type="button"
              aria-label="Copy room display link"
              className="shrink-0 min-h-[44px] min-w-[44px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.22)] bg-[var(--surface-high)]/50 flex items-center justify-center text-[var(--outline)] hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)] transition-colors"
              onClick={() => void copyRoomDisplayLink()}
            >
              <span className="material-symbols-outlined text-base">
                content_copy
              </span>
            </button>
          </div>
          {displayLinkHint ? (
            <p className="mt-2 text-[10px] text-[var(--color-gold-rare)] uppercase tracking-[0.15em] text-center">
              {displayLinkHint}
            </p>
          ) : null}
          {session?.joinCode ? (
            <p className="mt-2 text-[10px] text-[var(--color-silver-dim)] text-center leading-relaxed px-0.5">
              TV: home → Watch on TV →{" "}
              <span className="font-mono text-[var(--color-gold-support)] tracking-[0.12em]">
                {session.joinCode}
              </span>
            </p>
          ) : null}
        </div>
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
        ) : sessionUiMode === "chronicle" ? (
          <ChronicleFeed entries={feed} className="min-h-0 flex-1" />
        ) : (
          <FeedList entries={feed} className="min-h-0 flex-1" />
        )}
        <CombatStrip
          players={players}
          npcs={npcs}
          currentTurnPlayerId={currentTurnPlayerId}
          onInspectPlayer={(playerId) => {
            setEnemyInspectNpcId(null);
            setPartyInspectPlayerId(playerId);
          }}
          onInspectEnemy={(npcId) => {
            setPartyInspectPlayerId(null);
            setEnemyInspectNpcId(npcId);
          }}
        />
        <div className="sticky bottom-0 z-20 mt-auto shrink-0 pt-1">
          {quest ? <QuestDock quest={quest} onOpen={() => setQuestOpen(true)} /> : null}
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
              guidedTurnUi={guidedTurnUi}
              onToggleGuidedTurnUi={toggleGuidedTurnUi}
              npcs={npcs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
