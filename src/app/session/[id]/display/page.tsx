"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RoomDisplayNarration } from "@/components/display/room-display-narration";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { SkeletonText } from "@/components/ui/loading-skeleton";
import { SceneHeader } from "@/components/game/scene-header";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import {
  useGameStore,
  type SessionStatePayload,
} from "@/lib/state/game-store";

function DisplaySkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-obsidian)]">
      <div className="relative z-[1] h-[min(52vh,560px)] w-full shrink-0 overflow-hidden">
        <span
          className="absolute inset-0 animate-shimmer opacity-25 pointer-events-none"
          aria-hidden
        />
      </div>
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col gap-4 px-4 pb-8 pt-6 sm:px-8">
        <div
          className="flex min-h-[200px] flex-1 flex-col rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.18)] bg-[var(--surface-container)]/35 px-6 py-6 sm:px-10 sm:py-8"
          aria-hidden
        >
          <SkeletonText lines={8} />
        </div>
      </div>
    </div>
  );
}

export default function SessionRoomDisplayPage() {
  const params = useParams();
  const idParam = params.id;
  const sessionId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0]!
        : "";

  const session = useGameStore((s) => s.session);
  const sceneImage = useGameStore((s) => s.sceneImage);
  const previousSceneImage = useGameStore((s) => s.previousSceneImage);
  const sceneTitle = useGameStore((s) => s.sceneTitle);
  const scenePending = useGameStore((s) => s.scenePending);
  const narrativeText = useGameStore((s) => s.narrativeText);
  const isThinking = useGameStore((s) => s.isThinking);

  const setSessionId = useGameStore((s) => s.setSessionId);
  const setCurrentPlayerId = useGameStore((s) => s.setCurrentPlayerId);
  const hydrate = useGameStore((s) => s.hydrate);

  const { data: authSession, status: authStatus } = useSession();
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        <DisplaySkeleton />
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
        <ConnectionStatus />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--color-obsidian)]">
      <ConnectionStatus />
      <div className="relative z-[1] h-[min(52vh,560px)] w-full shrink-0 overflow-hidden sm:h-[min(55vh,620px)]">
        <SceneHeader
          sceneImage={sceneImage}
          previousSceneImage={previousSceneImage}
          sceneTitle={sceneTitle}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={null}
          scenePending={scenePending}
          phase={null}
          phaseLabel={null}
          teaser={null}
          showMetaChips={false}
          showTapHint={false}
          showTurnWhenNoTeaser={false}
        />
      </div>
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col px-4 pb-8 pt-4 sm:px-8 sm:pt-6">
        <RoomDisplayNarration
          narrativeText={narrativeText}
          isThinking={isThinking}
        />
      </div>
    </div>
  );
}
