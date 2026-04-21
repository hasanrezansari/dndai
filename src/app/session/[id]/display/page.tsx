"use client";

import { useSession } from "next-auth/react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { RoomDisplayArtFrame } from "@/components/display/room-display-art-frame";
import { RoomDisplayNarration } from "@/components/display/room-display-narration";
import { DiceOverlay } from "@/components/dice/dice-overlay";
import { SkeletonText } from "@/components/ui/loading-skeleton";
import { SceneHeader } from "@/components/game/scene-header";
import { useRoomDisplayPresentation } from "@/lib/display/use-room-display-presentation";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import {
  useGameStore,
  type SessionStatePayload,
} from "@/lib/state/game-store";

function DisplaySkeleton() {
  return (
    <div className="room-display-root flex min-h-dvh w-full flex-col xl:h-[100dvh] xl:max-h-[100dvh] xl:flex-row xl:overflow-hidden">
      <div className="room-display-art-well relative flex min-h-0 max-sm:min-h-[42dvh] flex-1 flex-col overflow-hidden">
        <span
          className="absolute inset-0 animate-shimmer opacity-[0.18] pointer-events-none"
          aria-hidden
        />
      </div>
      <div className="room-display-rail max-h-[46dvh] min-h-0 w-full px-4 py-4 sm:px-8 xl:max-h-none xl:flex xl:h-[100dvh] xl:max-h-[100dvh] xl:w-[min(440px,38vw)] xl:max-w-[min(520px,42vw)] xl:shrink-0 xl:flex-col xl:px-6 xl:py-6">
        <div
          className="room-display-narration-glass flex min-h-[180px] flex-col px-6 py-6 sm:px-10 sm:py-8 xl:min-h-0 xl:flex-1"
          aria-hidden
        >
          <SkeletonText lines={8} />
        </div>
      </div>
    </div>
  );
}

function SessionRoomDisplayContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const displayToken = searchParams.get("t")?.trim() || null;

  const idParam = params.id;
  const sessionId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0]!
        : "";

  const session = useGameStore((s) => s.session);
  const party = session?.party;
  const isPartyDisplay = session?.gameKind === "party";
  const sceneTitle = useGameStore((s) => s.sceneTitle);
  const isThinking = useGameStore((s) => s.isThinking);

  const setSessionId = useGameStore((s) => s.setSessionId);
  const setCurrentPlayerId = useGameStore((s) => s.setCurrentPlayerId);
  const hydrate = useGameStore((s) => s.hydrate);

  const {
    visible,
    onActionSubmittedForDisplay,
    onDiceRollingForDisplay,
    flushFromStore,
  } = useRoomDisplayPresentation(sessionId, displayToken);

  useSessionChannel(sessionId || null, {
    displayToken: displayToken ?? undefined,
    participateInPresence: false,
    onActionSubmittedForDisplay,
    onDiceRollingForDisplay,
    onFullResyncComplete: flushFromStore,
  });

  const { data: authSession, status: authStatus } = useSession();
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneAspect, setSceneAspect] = useState<number | null>(null);

  useEffect(() => {
    setHydrated(false);
  }, [sessionId, displayToken]);

  useEffect(() => {
    setSceneAspect(null);
  }, [visible.sceneImage]);

  useEffect(() => {
    if (!sessionId) return;
    setSessionId(sessionId);

    if (displayToken) {
      const token = displayToken;
      let cancelled = false;
      async function load() {
        try {
          setLoadError(null);
          const res = await fetch(
            `/api/sessions/${sessionId}/display-state?t=${encodeURIComponent(token)}`,
          );
          if (cancelled) return;
          if (!res.ok) {
            setLoadError(`Failed to load session (${res.status})`);
            return;
          }
          const data = (await res.json()) as SessionStatePayload;
          if (cancelled) return;
          hydrate(data);
        } catch {
          if (!cancelled) {
            setLoadError("Network error — could not load session.");
          }
        } finally {
          if (!cancelled) setHydrated(true);
        }
      }
      void load();
      return () => {
        cancelled = true;
      };
    }

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
    displayToken,
    authStatus,
    authSession?.user?.id,
    setSessionId,
    setCurrentPlayerId,
    hydrate,
  ]);

  if (!sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-obsidian)] px-4 text-[var(--color-silver-dim)]">
        Invalid session
      </div>
    );
  }

  if (!hydrated) {
    return <DisplaySkeleton />;
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

  const roundNumber = session?.currentRound ?? 1;

  return (
    <div className="room-display-root relative flex min-h-dvh w-full flex-col xl:h-[100dvh] xl:max-h-[100dvh] xl:flex-row xl:overflow-hidden">
      <DiceOverlay />
      <div className="room-display-art-well relative z-0 flex min-h-0 max-sm:min-h-[42dvh] flex-1 flex-col overflow-hidden">
        <RoomDisplayArtFrame
          naturalAspect={sceneAspect}
          className="min-h-0 flex-1"
        >
          <SceneHeader
            sceneImage={visible.sceneImage}
            previousSceneImage={visible.previousSceneImage}
            sceneTitle={sceneTitle}
            roundNumber={roundNumber}
            currentPlayerName={null}
            scenePending={visible.scenePending}
            phase={null}
            phaseLabel={isPartyDisplay ? "Party" : null}
            teaser={
              isPartyDisplay && party
                ? `${party.partyPhase} · round ${party.roundIndex}/${party.totalRounds}`
                : null
            }
            showMetaChips={Boolean(isPartyDisplay)}
            showTapHint={false}
            showTurnWhenNoTeaser={false}
            roomDisplay
            onRoomDisplayImageIntrinsicSize={(w, h) => {
              if (w > 0 && h > 0) setSceneAspect(w / h);
            }}
          />
        </RoomDisplayArtFrame>
      </div>
      <div className="room-display-rail relative z-10 flex max-h-[46dvh] min-h-0 w-full flex-col xl:max-h-none xl:h-[100dvh] xl:max-h-[100dvh] xl:w-[min(440px,38vw)] xl:max-w-[min(520px,42vw)] xl:shrink-0">
        {isPartyDisplay && party ? (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 sm:px-6">
            <span className="rounded-[var(--radius-pill)] border border-[color-mix(in_srgb,var(--outline)_28%,transparent)] bg-[color-mix(in_srgb,var(--glass-bg)_40%,transparent)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--outline)] backdrop-blur-md">
              Party
            </span>
            <span className="rounded-[var(--radius-pill)] border border-[color-mix(in_srgb,var(--outline)_28%,transparent)] bg-[color-mix(in_srgb,var(--glass-bg)_40%,transparent)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--outline)] backdrop-blur-md">
              Round {roundNumber}
            </span>
            <span className="rounded-[var(--radius-pill)] border border-[color-mix(in_srgb,var(--outline)_28%,transparent)] bg-[color-mix(in_srgb,var(--glass-bg)_40%,transparent)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--color-silver-muted)] backdrop-blur-md">
              {party.partyPhase} · {party.roundIndex}/{party.totalRounds}
            </span>
          </div>
        ) : null}
        {sceneTitle?.trim() ? (
          <h2 className="text-fantasy px-4 pt-3 text-base font-black leading-tight tracking-tight text-[var(--color-silver-muted)] drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)] sm:px-6 sm:text-lg">
            {sceneTitle.trim()}
          </h2>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6 sm:pb-6 xl:pt-3">
          <RoomDisplayNarration
            narrativeText={visible.narrativeText}
            isThinking={isThinking}
            partyMode={Boolean(isPartyDisplay)}
          />
        </div>
      </div>
    </div>
  );
}

export default function SessionRoomDisplayPage() {
  return (
    <Suspense fallback={<DisplaySkeleton />}>
      <SessionRoomDisplayContent />
    </Suspense>
  );
}
