"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useGameStore } from "@/lib/state/game-store";

import { withDisplaySceneImageUrl } from "./scene-image-url";

const NO_DICE_RELEASE_MS = 4000;
const MAX_HOLD_MS = 15000;

export type RoomDisplayVisible = {
  narrativeText: string | null;
  sceneImage: string | null;
  previousSceneImage: string | null;
  scenePending: boolean;
};

function mapUrls(
  v: RoomDisplayVisible,
  sessionId: string,
  displayToken: string | null,
): RoomDisplayVisible {
  return {
    ...v,
    sceneImage: withDisplaySceneImageUrl(v.sceneImage, sessionId, displayToken),
    previousSceneImage: withDisplaySceneImageUrl(
      v.previousSceneImage,
      sessionId,
      displayToken,
    ),
  };
}

/**
 * Room display only: hold visible narration + scene art until the dice beat finishes,
 * so the TV can show roll outcome before the next prose/image. Pairs with optional
 * `useSessionChannel` display callbacks.
 */
export function useRoomDisplayPresentation(
  sessionId: string,
  displayToken: string | null,
) {
  const [hold, setHold] = useState(false);
  const [frozen, setFrozen] = useState<RoomDisplayVisible | null>(null);
  const diceSeenRef = useRef(false);
  const timersRef = useRef<{
    max?: ReturnType<typeof setTimeout>;
    noDice?: ReturnType<typeof setTimeout>;
  }>({});

  const clearTimers = useCallback(() => {
    if (timersRef.current.max) clearTimeout(timersRef.current.max);
    if (timersRef.current.noDice) clearTimeout(timersRef.current.noDice);
    timersRef.current = {};
  }, []);

  const flushFromStore = useCallback(() => {
    clearTimers();
    diceSeenRef.current = false;
    setFrozen(null);
    setHold(false);
  }, [clearTimers]);

  const onActionSubmittedForDisplay = useCallback(() => {
    const s = useGameStore.getState();
    diceSeenRef.current = false;
    setFrozen({
      narrativeText: s.narrativeText,
      sceneImage: s.sceneImage,
      previousSceneImage: s.previousSceneImage,
      scenePending: s.scenePending,
    });
    setHold(true);
    clearTimers();
    timersRef.current.max = setTimeout(() => {
      flushFromStore();
    }, MAX_HOLD_MS);
    timersRef.current.noDice = setTimeout(() => {
      if (!diceSeenRef.current) flushFromStore();
    }, NO_DICE_RELEASE_MS);
  }, [clearTimers, flushFromStore]);

  const onDiceRollingForDisplay = useCallback(() => {
    diceSeenRef.current = true;
    if (timersRef.current.noDice) {
      clearTimeout(timersRef.current.noDice);
      timersRef.current.noDice = undefined;
    }
  }, []);

  const diceOverlay = useGameStore((s) => s.diceOverlay);
  const prevDiceRef = useRef<typeof diceOverlay>(diceOverlay);

  useEffect(() => {
    const prev = prevDiceRef.current;
    prevDiceRef.current = diceOverlay;
    if (prev !== null && diceOverlay === null && hold) {
      queueMicrotask(() => {
        flushFromStore();
      });
    }
  }, [diceOverlay, hold, flushFromStore]);

  const storeSnap = useGameStore((s) => ({
    narrativeText: s.narrativeText,
    sceneImage: s.sceneImage,
    previousSceneImage: s.previousSceneImage,
    scenePending: s.scenePending,
  }));

  const visible: RoomDisplayVisible = hold
    ? mapUrls(frozen ?? storeSnap, sessionId, displayToken)
    : mapUrls(storeSnap, sessionId, displayToken);

  return {
    visible,
    onActionSubmittedForDisplay,
    onDiceRollingForDisplay,
    flushFromStore,
  };
}
