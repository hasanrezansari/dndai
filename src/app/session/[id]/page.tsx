"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SparkBalanceHud } from "@/components/game/spark-balance-hud";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { GhostButton } from "@/components/ui/ghost-button";
import { GoldButton } from "@/components/ui/gold-button";
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
import { COPY } from "@/lib/copy/ashveil";
import { mergeChronicleFeedEntries } from "@/lib/feed/merge-chronicle-feed";
import { useSessionChannel } from "@/lib/socket/use-session-channel";
import {
  useGameStore,
  type FeedEntry,
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
        <div className="min-h-0 flex-1 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/30 p-3">
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

  const refetchWallet = useCallback(async () => {
    try {
      const r = await fetch("/api/wallet");
      if (r.ok) {
        const j = (await r.json()) as { balance?: number };
        if (typeof j.balance === "number") setSparkBalance(j.balance);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setSparkBalance(null);
      return;
    }
    void refetchWallet();
  }, [authStatus, refetchWallet]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterContinueBusy, setChapterContinueBusy] = useState(false);
  const [sparkBalance, setSparkBalance] = useState<number | null>(null);
  const [sceneTransitionTrigger, setSceneTransitionTrigger] = useState(false);
  /** First beat vs later location changes (copy on the intro overlay). */
  const [sceneTransitionKind, setSceneTransitionKind] = useState<
    "opening" | "location"
  >("location");
  /** Last scene title we saw — ref avoids a second effect syncing state that cancelled the dismiss timer. */
  const prevSceneTitleRef = useRef<string | null>(null);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [traceFeedExtra, setTraceFeedExtra] = useState<FeedEntry[]>([]);
  const [displayLinkHint, setDisplayLinkHint] = useState<string | null>(null);
  const [sceneDetailOpen, setSceneDetailOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [partyInspectPlayerId, setPartyInspectPlayerId] = useState<
    string | null
  >(null);
  const [enemyInspectNpcId, setEnemyInspectNpcId] = useState<string | null>(
    null,
  );
  const { mode: sessionUiMode, setMode: setSessionUiMode } = useSessionUiMode();
  const { guidedTurnUi, toggleGuidedTurnUi } = useGuidedTurnUi();

  const needsChronicleTraces =
    chronicleOpen || sessionUiMode === "chronicle";

  useEffect(() => {
    if (!sessionId || !needsChronicleTraces) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/feed-traces`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { entries?: FeedEntry[] };
        if (!cancelled) {
          setTraceFeedExtra(Array.isArray(data.entries) ? data.entries : []);
        }
      } catch {
        if (!cancelled) setTraceFeedExtra([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, needsChronicleTraces]);

  const chronicleEntries = useMemo(
    () => mergeChronicleFeedEntries(feed, traceFeedExtra),
    [feed, traceFeedExtra],
  );

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

  const isHost = useMemo(
    () => Boolean(players.find((p) => p.id === currentPlayerId)?.isHost),
    [players, currentPlayerId],
  );

  const canOfferPublishTemplate = useMemo(
    () =>
      isHost &&
      Boolean(session) &&
      session!.gameKind !== "party" &&
      (session!.status === "active" || session!.status === "ended"),
    [isHost, session],
  );

  const isGoogleSignedIn = useMemo(
    () =>
      authStatus === "authenticated" &&
      typeof authSession?.user?.email === "string" &&
      !authSession.user.email.endsWith("@ashveil.guest"),
    [authSession?.user?.email, authStatus],
  );

  const showInsufficientSparksToast = useCallback(() => {
    void refetchWallet();
    toast(
      isHost ? COPY.spark.pauseHost : COPY.spark.pauseGuest,
      "info",
      {
        duration: 9000,
        action: { label: COPY.spark.buySparksCta, href: "/shop" },
      },
    );
  }, [isHost, refetchWallet, toast]);

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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          setIsThinking(false);
          if (res.status === 402 && body.code === "insufficient_sparks") {
            showInsufficientSparksToast();
            return;
          }
          if (res.status === 409 && body.code === "chapter_turn_cap") {
            toast(
              isHost
                ? `${body.error ?? "Chapter turn limit reached."} Open Quest to continue the chapter.`
                : (body.error ?? "Chapter turn limit reached."),
              "error",
              { duration: 8000 },
            );
            return;
          }
          toast(body.error ?? "Action failed", "error");
          return;
        }
        setIsThinking(false);
        setQuestOpen(false);
        void refetchWallet();
      } catch {
        setIsThinking(false);
        toast("Action failed", "error");
      }
    },
    [
      sessionId,
      setIsThinking,
      showInsufficientSparksToast,
      toast,
      refetchWallet,
      isHost,
    ],
  );

  const handleSubmitPublishTemplate = useCallback(async () => {
    if (!sessionId || publishBusy) return;
    setPublishErr(null);
    setPublishBusy(true);
    try {
      const body: Record<string, string> = { sessionId };
      const t = publishTitle.trim();
      if (t.length >= 3) body.title = t;
      const d = publishDesc.trim();
      if (d.length >= 20) body.description = d;
      const res = await fetch("/api/worlds/submissions/from-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not submit";
        setPublishErr(msg);
        return;
      }
      toast("Submitted for review", "success");
      setPublishOpen(false);
      router.push("/profile");
    } catch {
      setPublishErr("Network error");
    } finally {
      setPublishBusy(false);
    }
  }, [publishBusy, publishDesc, publishTitle, router, sessionId, toast]);

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
          code?: string;
        };
        if (!res.ok) {
          if (res.status === 402 && body.code === "insufficient_sparks") {
            showInsufficientSparksToast();
            return;
          }
          toast(body.error ?? "Narration failed", "error");
          return;
        }
        void refetchWallet();
      } catch {
        toast("Narration failed", "error");
      }
    },
    [sessionId, showInsufficientSparksToast, toast, refetchWallet],
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
          code?: string;
        };
        if (!res.ok) {
          if (res.status === 402 && body.code === "insufficient_sparks") {
            showInsufficientSparksToast();
            return;
          }
          toast(body.error ?? "Could not set DC", "error");
          return;
        }
        setDmDc(dc);
        void refetchWallet();
      } catch {
        toast("Could not set DC", "error");
      }
    },
    [sessionId, setDmDc, showInsufficientSparksToast, toast, refetchWallet],
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
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 402 && body.code === "insufficient_sparks") {
          showInsufficientSparksToast();
          return;
        }
        toast(body.error ?? "Could not advance turn", "error");
        return;
      }
      void refetchWallet();
    } catch {
      toast("Could not advance turn", "error");
    }
  }, [sessionId, showInsufficientSparksToast, toast, refetchWallet]);

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
          code?: string;
        };
        if (!res.ok) {
          if (res.status === 402 && body.code === "insufficient_sparks") {
            showInsufficientSparksToast();
            return;
          }
          toast(body.error ?? "Event failed", "error");
          return;
        }
        void refetchWallet();
      } catch {
        toast("Event failed", "error");
      }
    },
    [sessionId, showInsufficientSparksToast, toast, refetchWallet],
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
        toast(body.error ?? "Could not open room display", "error");
        return;
      }
      if (!body.path) return;
      window.open(
        `${window.location.origin}${body.path}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      toast("Could not open room display", "error");
    }
  }, [sessionId, toast]);

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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          if (res.status === 402 && body.code === "insufficient_sparks") {
            showInsufficientSparksToast();
            return;
          }
          toast(body.error ?? "Could not submit vote", "error");
          return;
        }
        void refetchWallet();
      } catch {
        toast("Could not submit vote", "error");
      } finally {
        setVoteBusy(false);
      }
    },
    [
      sessionId,
      currentPlayerId,
      voteBusy,
      showInsufficientSparksToast,
      toast,
      refetchWallet,
    ],
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
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 402 && body.code === "insufficient_sparks") {
          showInsufficientSparksToast();
          return;
        }
        toast(body.error ?? "Could not generate final chapter", "error");
        return;
      }
      void refetchWallet();
    } catch {
      toast("Could not generate final chapter", "error");
    } finally {
      setChapterBusy(false);
    }
  }, [
    sessionId,
    currentPlayerId,
    chapterBusy,
    showInsufficientSparksToast,
    toast,
    refetchWallet,
  ]);

  const handleContinueChapter = useCallback(async () => {
    if (!sessionId || !currentPlayerId || chapterContinueBusy) return;
    setChapterContinueBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chapter/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 402 && body.code === "insufficient_sparks") {
          showInsufficientSparksToast();
          return;
        }
        toast(body.error ?? "Could not continue chapter", "error");
        return;
      }
      toast("Next chapter opened.", "success");
      setQuestOpen(false);
      void refetchWallet();
    } catch {
      toast("Could not continue chapter", "error");
    } finally {
      setChapterContinueBusy(false);
    }
  }, [
    sessionId,
    currentPlayerId,
    chapterContinueBusy,
    showInsufficientSparksToast,
    toast,
    refetchWallet,
  ]);

  const sessionChrome = (
    <>
      <ConnectionStatus />
      {authStatus === "authenticated" ? (
        <SparkBalanceHud
          variant={isHost ? "host" : "guest"}
          balance={sparkBalance}
          tablePoolBalance={session?.sparkPoolBalance ?? null}
        />
      ) : null}
    </>
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
        {sessionChrome}
      </>
    );
  }

  if (loadError) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-obsidian)] px-6 text-center">
        {sessionChrome}
        <p className="text-sm text-[var(--color-silver-muted)]">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setHydrated(false);
            setLoadError(null);
          }}
          className="min-h-[44px] rounded-[var(--radius-chip)] border border-[var(--border-ui)] bg-[var(--glass-bg)]/40 px-5 py-2 text-sm font-medium text-[var(--color-silver-muted)] backdrop-blur-sm transition-colors hover:bg-[var(--surface-high)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
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
          {sessionChrome}
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
      <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--color-obsidian)]">
        <SceneTransition
          imageUrl={partySceneImage}
          locationTitle={sceneTitle}
          trigger={sceneTransitionTrigger}
          kind={sceneTransitionKind}
          onDismiss={() => setSceneTransitionTrigger(false)}
        />
        {sessionChrome}
        <header className="relative z-[1] h-[min(40vh,300px)] w-full shrink-0 overflow-hidden border-b border-[var(--border-divide)] sm:h-[min(36vh,320px)]">
          <button
            type="button"
            onClick={handleLeaveSession}
            className="absolute left-3 top-3 z-30 min-h-[40px] min-w-[40px] rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-obsidian)]/85 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--outline)] transition-all hover:border-[var(--color-failure)]/30 hover:text-[var(--color-failure)] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
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
          <p className="border-b border-[var(--border-divide)] px-3 py-1.5 text-[9px] text-[var(--outline)] sm:px-4">
            Automatic scene images this session: {session.chapterImagesUsed ?? 0} /{" "}
            {session.chapterImageBudget ?? 3}
          </p>
        </header>
        {narrativeText?.trim() ? (
          <div className="relative z-[2] max-h-[min(24vh,200px)] shrink-0 overflow-y-auto border-b border-[var(--border-divide)] bg-[color-mix(in_srgb,var(--color-deep-void)_35%,transparent)] px-3 pb-1 pt-0.5 backdrop-blur-[4px] sm:max-h-[min(32vh,260px)] sm:px-4 sm:pt-1">
            <PartySessionCard
              title="Scene"
              contentClassName="!py-2 !leading-relaxed sm:!py-2.5"
              className="!py-0 sm:!py-0 [&_h3]:text-[8px] sm:[&_h3]:text-[9px]"
            >
              <p className="text-fantasy text-[13px] leading-relaxed text-[var(--color-silver-muted)] whitespace-pre-wrap sm:text-sm">
                {narrativeText}
              </p>
            </PartySessionCard>
          </div>
        ) : null}
        <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden">
          <PartyPlayPanel
            sessionId={sessionId}
            currentPlayerId={currentPlayerId}
            party={party}
            players={players}
            sceneNarrativeForDedupe={narrativeText}
          />
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
      {sessionChrome}
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
          <ChronicleFeed entries={chronicleEntries} className="min-h-0 flex-1" />
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
            chapterContinueBusy={chapterContinueBusy}
            isHost={isHost}
            onContinueChapter={() => void handleContinueChapter()}
            onEndingVote={(choice) => void handleEndingVote(choice)}
            onGenerateFinalChapter={() => void handleGenerateFinalChapter()}
            sessionId={sessionId}
            players={players}
            onSessionMutated={async () => {
              const res = await fetch(`/api/sessions/${sessionId}/state`);
              if (!res.ok) return;
              const data = (await res.json()) as SessionStatePayload;
              hydrate(data);
            }}
          />
        ) : null}
      </BottomSheet>
      <BottomSheet
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish as world template"
      >
        <div className="space-y-4 px-1 pb-6">
          <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed">
            Sends your campaign premise and lobby setup to the moderation queue. It will not
            appear on the public gallery until approved. One submission per play session.
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Title (optional)
            </span>
            <input
              value={publishTitle}
              onChange={(e) => setPublishTitle(e.target.value)}
              maxLength={120}
              placeholder="Defaults from your campaign title or premise"
              className="w-full min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[var(--border-ui-strong)] text-[var(--color-silver-muted)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Description (optional, min 20 chars if set)
            </span>
            <textarea
              value={publishDesc}
              onChange={(e) => setPublishDesc(e.target.value)}
              maxLength={8000}
              rows={4}
              placeholder="Defaults from your world summary and adventure prompt"
              className="w-full px-3 py-2 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[var(--border-ui-strong)] text-[var(--color-silver-muted)] text-sm leading-relaxed"
            />
          </label>
          {publishErr ? (
            <p className="text-sm text-[var(--color-failure)] leading-relaxed">{publishErr}</p>
          ) : null}
          <div className="flex flex-col gap-2 pt-1">
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[48px]"
              disabled={publishBusy}
              onClick={() => void handleSubmitPublishTemplate()}
            >
              {publishBusy ? "Sending…" : "Submit for review"}
            </GoldButton>
            <GhostButton
              type="button"
              size="md"
              className="w-full"
              onClick={() => setPublishOpen(false)}
            >
              Cancel
            </GhostButton>
          </div>
        </div>
      </BottomSheet>
      <DiceOverlay />
      <StatPopupOverlay />
      <header className="relative z-[1] h-[min(36vh,320px)] w-full shrink-0 overflow-hidden border-b border-[var(--border-divide)]">
        <button
          type="button"
          onClick={handleLeaveSession}
          className="absolute left-3 top-3 z-30 min-h-[40px] min-w-[40px] rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-obsidian)]/85 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--outline)] transition-all hover:text-[var(--color-failure)] hover:border-[var(--color-failure)]/30 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
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
      </header>

      <div className="relative z-[2] shrink-0 space-y-2 border-b border-[var(--border-divide)] bg-[color-mix(in_srgb,var(--color-deep-void)_40%,transparent)] px-4 py-2 backdrop-blur-[4px]">
        <NarrativeCard
          isThinking={isThinking}
          roundNumber={session?.currentRound ?? 1}
          currentPlayerName={currentPlayerName}
          phaseLabel={phaseLabel}
        />
        <div className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/35 backdrop-blur-[6px] px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Session & cast
          </p>
          <SessionViewModeToggle
            mode={sessionUiMode}
            onChange={setSessionUiMode}
          />
          <div className="mt-3 flex gap-2 items-stretch">
            <GhostButton
              type="button"
              size="md"
              className="min-h-[44px] flex-1 border-[var(--border-ui-strong)]"
              onClick={() => void openRoomDisplayInNewTab()}
            >
              <span className="material-symbols-outlined text-base">tv</span>
              Room display
            </GhostButton>
            <button
              type="button"
              aria-label="Copy room display link"
              className="shrink-0 min-h-[44px] min-w-[44px] rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--surface-high)]/50 flex items-center justify-center text-[var(--outline)] hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
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
          {canOfferPublishTemplate && isGoogleSignedIn ? (
            <div className="mt-3">
              <GhostButton
                type="button"
                size="md"
                className="min-h-[44px] w-full border-[var(--border-ui-strong)]"
                onClick={() => {
                  setPublishErr(null);
                  setPublishTitle(session?.campaignTitle?.trim() || "");
                  setPublishDesc("");
                  setPublishOpen(true);
                }}
              >
                <span className="material-symbols-outlined text-base">public</span>
                Publish as world template
              </GhostButton>
              <p className="mt-1.5 text-[9px] text-[var(--outline)] leading-relaxed text-center px-1">
                Host only · moderation queue · not public until approved
              </p>
            </div>
          ) : null}
          {canOfferPublishTemplate && !isGoogleSignedIn ? (
            <p className="mt-3 text-[9px] text-[var(--outline)] text-center leading-relaxed px-1">
              Sign in with Google from the lobby to publish this campaign as a catalog template.
            </p>
          ) : null}
        </div>
      </div>

      <section
        aria-label="Story feed and play"
        className="flex min-h-0 flex-1 flex-col gap-[var(--void-gap)] px-4 pb-2 pt-[var(--void-gap)]"
      >
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
              className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--surface-high)]/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
            >
              <span className="material-symbols-outlined text-base">menu_book</span>
              Open Chronicle
            </button>
            <div className="min-h-0 flex-1" aria-hidden />
          </div>
        ) : sessionUiMode === "chronicle" ? (
          <ChronicleFeed entries={chronicleEntries} className="min-h-0 flex-1" />
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
        <footer className="sticky bottom-0 z-20 mt-auto shrink-0 border-t border-[var(--border-divide)] bg-[var(--color-obsidian)]/92 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--color-obsidian)]/85">
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
        </footer>
      </section>
    </div>
  );
}
