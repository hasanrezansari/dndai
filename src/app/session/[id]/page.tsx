"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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
import { FeedList } from "@/components/feed/feed-list";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import { useGameStore } from "@/lib/state/game-store";

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
  const setIsDm = useGameStore((s) => s.setIsDm);
  const setDmDc = useGameStore((s) => s.setDmDc);

  const setSessionId = useGameStore((s) => s.setSessionId);
  const setCurrentPlayerId = useGameStore((s) => s.setCurrentPlayerId);
  const hydrate = useGameStore((s) => s.hydrate);
  const setIsThinking = useGameStore((s) => s.setIsThinking);

  const { data: authSession, status: authStatus } = useSession();
  const [hydrated, setHydrated] = useState(false);

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
        const res = await fetch(`/api/sessions/${sessionId}/state`);
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as Parameters<typeof hydrate>[0];
        if (cancelled) return;
        hydrate(data);
        const me = data.players.find((p) => p.userId === userId);
        if (me) setCurrentPlayerId(me.id);
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

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-obsidian)]">
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
      <div className="relative z-0 h-[42vh] w-full shrink-0 overflow-hidden">
        <SceneHeader
          sceneImage={sceneImage}
          previousSceneImage={previousSceneImage}
          sceneTitle={sceneTitle}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={currentPlayerName}
          scenePending={scenePending}
        />
      </div>

      <div className="relative z-10 shrink-0 px-4">
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
