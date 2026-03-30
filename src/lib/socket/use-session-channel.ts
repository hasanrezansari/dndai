"use client";

import { useEffect, useRef } from "react";

import {
  ActionSubmittedEventSchema,
  AwaitingDmEventSchema,
  DiceResultEventSchema,
  DiceRollingEventSchema,
  DmNoticeEventSchema,
  NarrationUpdateEventSchema,
  PlayerDisconnectedEventSchema,
  PlayerJoinedEventSchema,
  PlayerReadyEventSchema,
  RoundSummaryEventSchema,
  SceneImageFailedEventSchema,
  SceneImagePendingEventSchema,
  SceneImageReadyEventSchema,
  SessionStartedEventSchema,
  StatChangeEventSchema,
  StateUpdateEventSchema,
  TurnStartedEventSchema,
} from "@/lib/schemas/events";
import type {
  GamePlayerView,
  SessionStatePayload,
  StatEffect,
  StatPopup,
} from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

import {
  createPusherClientWithDisplayAuth,
  getPusherClient,
  getSessionChannel,
} from "./client";

export type UseSessionChannelOptions = {
  displayToken?: string | null;
  /** When false, skip `/disconnect` beacons (read-only TV). Defaults to false if displayToken is set. */
  participateInPresence?: boolean;
  /** Room display only: freeze beat order before pipeline output. */
  onActionSubmittedForDisplay?: () => void;
  /** Room display only: dice pipeline started (clears no-roll fallback). */
  onDiceRollingForDisplay?: (data: {
    turn_id?: string;
    round_number?: number;
  }) => void;
  /** Room display only: after reconnect / full state resync from server. */
  onFullResyncComplete?: () => void;
};

function nowIso() {
  return new Date().toISOString();
}

function feedId() {
  return crypto.randomUUID();
}

function playerDisplayName(
  players: GamePlayerView[],
  playerId: string,
): string {
  const p = players.find((x) => x.id === playerId);
  if (!p) return "Player";
  return p.character?.name ?? p.displayName ?? `Seat ${p.seatIndex + 1}`;
}

/** Use for rows tied to the live turn when the server omits `turn_id` (legacy). */
function feedTurnFieldsWithFallback(data: {
  turn_id?: string;
  round_number?: number;
  player_id?: string;
}): { turnId?: string; roundNumber?: number; playerId?: string } {
  const active = useGameStore.getState().activeTurnId ?? undefined;
  const turnId = data.turn_id ?? active;
  const o: { turnId?: string; roundNumber?: number; playerId?: string } = {};
  if (turnId) o.turnId = turnId;
  if (data.round_number !== undefined) o.roundNumber = data.round_number;
  if (data.player_id) o.playerId = data.player_id;
  return o;
}

function feedTurnFieldsExplicit(data: {
  turn_id?: string;
  round_number?: number;
}): { turnId?: string; roundNumber?: number } {
  const o: { turnId?: string; roundNumber?: number } = {};
  if (data.turn_id) o.turnId = data.turn_id;
  if (data.round_number !== undefined) o.roundNumber = data.round_number;
  return o;
}

export function useSessionChannel(
  sessionId: string | null,
  options?: UseSessionChannelOptions,
) {
  const displayTokenOpt = options?.displayToken?.trim() || null;
  const participateInPresence =
    options?.participateInPresence ?? !displayTokenOpt;
  const channelOptionsRef = useRef(options);
  channelOptionsRef.current = options;

  useEffect(() => {
    if (!sessionId) return;

    const channelName = getSessionChannel(sessionId);
    const pusherClient = displayTokenOpt
      ? createPusherClientWithDisplayAuth(displayTokenOpt)
      : getPusherClient();
    const stateUrl = displayTokenOpt
      ? `/api/sessions/${sessionId}/display-state?t=${encodeURIComponent(displayTokenOpt)}`
      : `/api/sessions/${sessionId}/state`;
    const channel = pusherClient?.subscribe(channelName) ?? null;

    let accessForbidden = false;
    let scenePollTimer: ReturnType<typeof setInterval> | null = null;

    function stopScenePoll() {
      if (scenePollTimer) {
        clearInterval(scenePollTimer);
        scenePollTimer = null;
      }
    }

    function markAccessForbidden() {
      if (accessForbidden) return;
      accessForbidden = true;
      stopScenePoll();
      if (pusherClient) {
        try {
          pusherClient.unsubscribe(channelName);
        } catch {
          /* no-op */
        }
      }
      const store = useGameStore.getState();
      store.setScenePending(false);
      store.setIsThinking(false);
      store.setWaitingForDm(false);
      store.setDmAwaiting(null);
    }

    async function fetchSessionState(): Promise<SessionStatePayload | null> {
      if (accessForbidden) return null;
      const res = await fetch(stateUrl);
      if (res.status === 401 || res.status === 403) {
        markAccessForbidden();
        return null;
      }
      if (!res.ok) return null;
      return (await res.json()) as SessionStatePayload;
    }

    /** Pusher-driven deltas: keep client feed / overlays; align everything else to DB. */
    async function applyPatchFromServerState() {
      const data = await fetchSessionState();
      if (!data?.session) return;
      useGameStore.getState().patchSessionFromStateApi(data);
    }

    let fullResyncInFlight: Promise<void> | null = null;

    /**
     * Resync session fields from `/state` without replacing client feed (Pusher-only rows like actions).
     * Used when returning from background or after realtime reconnect. Singleflight for visibility + subscription_succeeded.
     */
    function scheduleFullResyncFromServer() {
      if (accessForbidden) return;
      if (fullResyncInFlight) return;
      fullResyncInFlight = (async () => {
        try {
          const data = await fetchSessionState();
          if (!data?.session || accessForbidden) return;
          const store = useGameStore.getState();
          store.patchSessionFromStateApi(data);
          store.setIsThinking(false);
          store.hideDiceOverlay();
          channelOptionsRef.current?.onFullResyncComplete?.();
        } finally {
          fullResyncInFlight = null;
        }
      })();
    }

    const onPlayerJoined = (raw: unknown) => {
      const parsed = PlayerJoinedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      void applyPatchFromServerState();
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "system",
        text: `${parsed.data.name} joined the table`,
        detail: parsed.data.character_class,
        timestamp: nowIso(),
      });
    };

    const onPlayerReady = (raw: unknown) => {
      const parsed = PlayerReadyEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().updatePlayer(parsed.data.player_id, {
        isReady: parsed.data.is_ready,
      });
      const name = playerDisplayName(
        useGameStore.getState().players,
        parsed.data.player_id,
      );
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "system",
        text: `${name} is ${parsed.data.is_ready ? "ready" : "not ready"}`,
        timestamp: nowIso(),
      });
    };

    const onPlayerDisconnected = (raw: unknown) => {
      const parsed = PlayerDisconnectedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().updatePlayer(parsed.data.player_id, {
        isConnected: false,
      });
      // Presence still updates in player-strip/state; feed spam is intentionally suppressed.
    };

    const onSessionStarted = (raw: unknown) => {
      const parsed = SessionStartedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().updateSessionField("status", "active");
      useGameStore.getState().updateSessionField(
        "campaignTitle",
        parsed.data.campaign_title,
      );
      useGameStore.getState().setNarrativeText(parsed.data.opening_scene);
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "narration",
        text: parsed.data.opening_scene,
        timestamp: nowIso(),
        highlight: true,
      });
    };

    const onTurnStarted = (raw: unknown) => {
      const parsed = TurnStartedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().setActiveTurnId(parsed.data.turn_id);
      const players = useGameStore.getState().players;
      const name = playerDisplayName(players, parsed.data.player_id);
      useGameStore.getState().setWaitingForDm(false);
      useGameStore.getState().setDmAwaiting(null);
      useGameStore.getState().updateSessionField(
        "currentPlayerId",
        parsed.data.player_id,
      );
      useGameStore.getState().updateSessionField(
        "currentRound",
        parsed.data.round_number,
      );
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "system",
        text: `Round ${parsed.data.round_number} — ${name}'s turn`,
        timestamp: nowIso(),
        highlight: true,
        turnId: parsed.data.turn_id,
        roundNumber: parsed.data.round_number,
        playerId: parsed.data.player_id,
      });
    };

    const onActionSubmitted = (raw: unknown) => {
      const parsed = ActionSubmittedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const players = useGameStore.getState().players;
      const name = playerDisplayName(players, parsed.data.player_id);
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "action",
        playerName: name,
        text: parsed.data.raw_input,
        timestamp: nowIso(),
        ...feedTurnFieldsWithFallback({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
          player_id: parsed.data.player_id,
        }),
      });
      useGameStore.getState().setIsThinking(true);
      channelOptionsRef.current?.onActionSubmittedForDisplay?.();
    };

    const onDiceRolling = (raw: unknown) => {
      const parsed = DiceRollingEventSchema.safeParse(raw);
      if (!parsed.success) return;
      channelOptionsRef.current?.onDiceRollingForDisplay?.({
        turn_id: parsed.data.turn_id,
        round_number: parsed.data.round_number,
      });
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "dice",
        text: parsed.data.roll_context,
        detail: parsed.data.dice_type,
        timestamp: nowIso(),
        ...feedTurnFieldsWithFallback({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
    };

    const onDiceResult = (raw: unknown) => {
      const parsed = DiceResultEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const { dice_type, roll_value, modifier, total, result, context } =
        parsed.data;
      const highlight =
        result === "critical_success" || result === "critical_failure";
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "dice",
        text: `${dice_type.toUpperCase()}: ${roll_value} + ${modifier} = ${total}`,
        detail: result,
        timestamp: nowIso(),
        highlight,
        ...feedTurnFieldsWithFallback({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
      useGameStore.getState().showDiceOverlay({
        context: context ?? "Roll",
        diceType: dice_type,
        rollValue: roll_value,
        modifier,
        total,
        result,
      });
      useGameStore.getState().setIsThinking(false);
    };

    const onNarrationUpdate = (raw: unknown) => {
      const parsed = NarrationUpdateEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().setNarrativeText(parsed.data.scene_text);
      useGameStore.getState().setIsThinking(false);
      useGameStore.getState().setWaitingForDm(false);
      useGameStore.getState().setDmAwaiting(null);
      const activeTurnId = useGameStore.getState().activeTurnId;
      const turnIdMatches =
        !parsed.data.turn_id ||
        !activeTurnId ||
        parsed.data.turn_id === activeTurnId;
      if (parsed.data.event_type !== "dm_event" && turnIdMatches) {
        useGameStore.getState().updateSessionField(
          "currentPlayerId",
          parsed.data.next_actor.player_id,
        );
      }
      const changes = parsed.data.visible_changes.join(" · ");
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "narration",
        text: parsed.data.scene_text,
        detail: changes || undefined,
        timestamp: nowIso(),
        highlight: true,
        ...feedTurnFieldsExplicit({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
    };

    const onStateUpdate = (raw: unknown) => {
      const parsed = StateUpdateEventSchema.safeParse(raw);
      if (!parsed.success) return;
      void (async () => {
        await applyPatchFromServerState();
        if (parsed.data.dismiss_scene_pending) {
          useGameStore.getState().setScenePending(false);
        }
        useGameStore.getState().updateSessionField(
          "stateVersion",
          parsed.data.state_version,
        );
        useGameStore.getState().addFeedEntry({
          id: feedId(),
          type: "state_change",
          text: `State v${parsed.data.state_version}`,
          detail: `${parsed.data.changes.length} change(s)`,
          timestamp: nowIso(),
          ...feedTurnFieldsWithFallback({
            turn_id: parsed.data.turn_id,
            round_number: parsed.data.round_number,
          }),
        });
      })();
    };

    const onStatChange = (raw: unknown) => {
      const parsed = StatChangeEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const store = useGameStore.getState();
      const players = store.players;

      function resolveName(targetType: string, targetId: string): string {
        if (targetType === "player") {
          const p = players.find((pl) => pl.id === targetId);
          return p?.character?.name ?? p?.displayName ?? "Unknown";
        }
        return "NPC";
      }

      const effects: StatEffect[] = parsed.data.effects.map((e) => ({
        targetId: e.target_id,
        targetName: e.target_name ?? resolveName(e.target_type, e.target_id),
        hpDelta: e.hp_delta,
        manaDelta: e.mana_delta,
        conditionsAdd: e.conditions_add,
        conditionsRemove: e.conditions_remove,
        reasoning: e.reasoning,
      }));

      const parts: string[] = [];
      for (const e of effects) {
        const chunks: string[] = [];
        if (e.hpDelta !== 0) chunks.push(`${e.hpDelta > 0 ? "+" : ""}${e.hpDelta} HP`);
        if (e.manaDelta !== 0) chunks.push(`${e.manaDelta > 0 ? "+" : ""}${e.manaDelta} MP`);
        if (e.conditionsAdd.length) chunks.push(`+${e.conditionsAdd.join(", ")}`);
        if (e.conditionsRemove.length) chunks.push(`-${e.conditionsRemove.join(", ")}`);
        if (chunks.length) parts.push(`${e.targetName}: ${chunks.join(", ")}`);
      }

      if (parts.length > 0) {
        store.addFeedEntry({
          id: feedId(),
          type: "stat_change",
          text: parts.join(" | "),
          timestamp: nowIso(),
          statEffects: effects,
          ...feedTurnFieldsWithFallback({
            turn_id: parsed.data.turn_id,
            round_number: parsed.data.round_number,
          }),
        });
      }

      const popups: StatPopup[] = [];
      const flash: Record<string, "damage" | "heal"> = {};
      for (const e of effects) {
        if (e.hpDelta !== 0) {
          popups.push({
            id: feedId(),
            playerId: e.targetId,
            label: `${e.hpDelta > 0 ? "+" : ""}${e.hpDelta} HP`,
            color: e.hpDelta > 0 ? "green" : "red",
            createdAt: Date.now(),
          });
          flash[e.targetId] = e.hpDelta > 0 ? "heal" : "damage";
        }
        if (e.manaDelta !== 0) {
          popups.push({
            id: feedId(),
            playerId: e.targetId,
            label: `${e.manaDelta > 0 ? "+" : ""}${e.manaDelta} MP`,
            color: e.manaDelta > 0 ? "blue" : "red",
            createdAt: Date.now(),
          });
        }
      }

      if (popups.length > 0) store.addStatPopups(popups);
      if (Object.keys(flash).length > 0) {
        store.setHpFlash(flash);
        setTimeout(() => useGameStore.getState().setHpFlash({}), 1200);
      }
    };

    async function pollSceneImage() {
      if (accessForbidden) {
        stopScenePoll();
        return;
      }
      const before = useGameStore.getState();
      if (!before.scenePending) {
        stopScenePoll();
        return;
      }
      try {
        const data = await fetchSessionState();
        if (!data?.session) return;
        const img = data.sceneImage ?? null;
        if (img && img !== before.sceneImage) {
          useGameStore.getState().attachImageToLatestNarration(img);
        }
        useGameStore.getState().patchSessionFromStateApi(data);
        if (!data.scenePending) {
          stopScenePoll();
        }
      } catch { /* best effort */ }
    }

    function startScenePoll() {
      stopScenePoll();
      scenePollTimer = setInterval(pollSceneImage, 8_000);
    }

    const onSceneImagePending = (raw: unknown) => {
      const parsed = SceneImagePendingEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().setScenePending(true);
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "system",
        text: parsed.data.label,
        timestamp: nowIso(),
        ...feedTurnFieldsWithFallback({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
      startScenePoll();
    };

    const onSceneImageReady = (raw: unknown) => {
      const parsed = SceneImageReadyEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const currentScene = useGameStore.getState().sceneImage;
      if (parsed.data.image_url !== currentScene) {
        useGameStore.getState().setSceneImage(parsed.data.image_url);
        useGameStore.getState().attachImageToLatestNarration(parsed.data.image_url);
      }
      useGameStore.getState().setScenePending(false);
      stopScenePoll();
      void applyPatchFromServerState();
    };

    const onSceneImageFailed = (raw: unknown) => {
      const parsed = SceneImageFailedEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().setScenePending(false);
      stopScenePoll();
    };

    const onAwaitingDm = (raw: unknown) => {
      const parsed = AwaitingDmEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().setActiveTurnId(parsed.data.turn_id);
      useGameStore.getState().setWaitingForDm(true);
      useGameStore.getState().setDmAwaiting({
        turnId: parsed.data.turn_id,
        actingPlayerId: parsed.data.acting_player_id,
      });
    };

    const onDmNotice = (raw: unknown) => {
      const parsed = DmNoticeEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "system",
        text: parsed.data.message,
        timestamp: nowIso(),
        ...feedTurnFieldsWithFallback({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
    };

    const onRoundSummary = (raw: unknown) => {
      const parsed = RoundSummaryEventSchema.safeParse(raw);
      if (!parsed.success) return;
      useGameStore.getState().addFeedEntry({
        id: feedId(),
        type: "narration",
        text: parsed.data.summary_text,
        detail: `Round ${parsed.data.round_number}`,
        timestamp: nowIso(),
        highlight: true,
        ...feedTurnFieldsExplicit({
          turn_id: parsed.data.turn_id,
          round_number: parsed.data.round_number,
        }),
      });
    };

    const onSubscriptionSucceeded = () => {
      scheduleFullResyncFromServer();
    };

    if (channel) {
      channel.bind("player-joined", onPlayerJoined);
      channel.bind("player-ready", onPlayerReady);
      channel.bind("player-disconnected", onPlayerDisconnected);
      channel.bind("session-started", onSessionStarted);
      channel.bind("turn-started", onTurnStarted);
      channel.bind("action-submitted", onActionSubmitted);
      channel.bind("dice-rolling", onDiceRolling);
      channel.bind("dice-result", onDiceResult);
      channel.bind("narration-update", onNarrationUpdate);
      channel.bind("state-update", onStateUpdate);
      channel.bind("stat-change", onStatChange);
      channel.bind("scene-image-pending", onSceneImagePending);
      channel.bind("scene-image-ready", onSceneImageReady);
      channel.bind("scene-image-failed", onSceneImageFailed);
      channel.bind("round-summary", onRoundSummary);
      channel.bind("awaiting-dm", onAwaitingDm);
      channel.bind("dm-notice", onDmNotice);
      channel.bind("pusher:subscription_succeeded", onSubscriptionSucceeded);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleFullResyncFromServer();
      }
    };

    const onPageShow = (ev: Event) => {
      if ("persisted" in ev && (ev as PageTransitionEvent).persisted) {
        scheduleFullResyncFromServer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    function signalDisconnect() {
      const pid = useGameStore.getState().currentPlayerId;
      if (!pid) return;
      const body = JSON.stringify({ playerId: pid });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`/api/sessions/${sessionId}/disconnect`, body);
      } else {
        void fetch(`/api/sessions/${sessionId}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    }

    if (participateInPresence) {
      window.addEventListener("beforeunload", signalDisconnect);
      window.addEventListener("pagehide", signalDisconnect);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      if (participateInPresence) {
        window.removeEventListener("beforeunload", signalDisconnect);
        window.removeEventListener("pagehide", signalDisconnect);
      }
      stopScenePoll();
      if (channel) {
        channel.unbind("player-joined", onPlayerJoined);
        channel.unbind("player-ready", onPlayerReady);
        channel.unbind("player-disconnected", onPlayerDisconnected);
        channel.unbind("session-started", onSessionStarted);
        channel.unbind("turn-started", onTurnStarted);
        channel.unbind("action-submitted", onActionSubmitted);
        channel.unbind("dice-rolling", onDiceRolling);
        channel.unbind("dice-result", onDiceResult);
        channel.unbind("narration-update", onNarrationUpdate);
        channel.unbind("state-update", onStateUpdate);
        channel.unbind("stat-change", onStatChange);
        channel.unbind("scene-image-pending", onSceneImagePending);
        channel.unbind("scene-image-ready", onSceneImageReady);
        channel.unbind("scene-image-failed", onSceneImageFailed);
        channel.unbind("round-summary", onRoundSummary);
        channel.unbind("awaiting-dm", onAwaitingDm);
        channel.unbind("dm-notice", onDmNotice);
        channel.unbind("pusher:subscription_succeeded", onSubscriptionSucceeded);
      }
      if (pusherClient) {
        try {
          pusherClient.unsubscribe(channelName);
        } catch {
          /* no-op */
        }
        if (displayTokenOpt) {
          try {
            pusherClient.disconnect();
          } catch {
            /* no-op */
          }
        }
      }
    };
  }, [sessionId, displayTokenOpt, participateInPresence]);
}
