export function evaluateTurnOwnership(params: {
  sessionStatus: string;
  currentPlayerId: string | null;
  requestPlayerId: string;
  turn: { status: string; player_id: string } | null;
}): { valid: boolean; error?: string } {
  if (params.sessionStatus !== "active") {
    return { valid: false, error: "Session not active" };
  }
  if (!params.currentPlayerId || params.currentPlayerId !== params.requestPlayerId) {
    return { valid: false, error: "Not your turn" };
  }
  if (!params.turn) {
    return { valid: false, error: "No active turn" };
  }
  if (params.turn.player_id !== params.requestPlayerId) {
    return { valid: false, error: "Not your turn" };
  }
  if (params.turn.status !== "awaiting_input") {
    return { valid: false, error: "Turn not awaiting input" };
  }
  return { valid: true };
}

export type SeatPlayer = {
  id: string;
  is_dm: boolean;
  seat_index: number;
  is_incapacitated?: boolean;
};

export function playablePlayersInSeatOrder(
  orderedBySeat: SeatPlayer[],
  sessionMode: string,
): SeatPlayer[] {
  return orderedBySeat.filter((p) => {
    if (p.is_incapacitated) return false;
    if (sessionMode === "human_dm" && p.is_dm) return false;
    return true;
  });
}

/** Next playable in seat order after `currentPlayerId` (wrap). If the actor is not in `playable`, still walk from their seat so skips stay fair. */
export function findNextPlayableIdInSeatOrder(
  orderedBySeat: SeatPlayer[],
  playable: SeatPlayer[],
  currentPlayerId: string | null,
): string | null {
  if (playable.length === 0) return null;
  const playableIds = new Set(playable.map((p) => p.id));
  const n = orderedBySeat.length;

  let start = -1;
  if (currentPlayerId) {
    start = orderedBySeat.findIndex((p) => p.id === currentPlayerId);
  }
  if (start < 0) {
    return playable[0]!.id;
  }

  for (let step = 1; step <= n; step++) {
    const seat = orderedBySeat[(start + step) % n]!;
    if (playableIds.has(seat.id)) return seat.id;
  }
  return playable[0]!.id;
}

export function computeNextPlayableTurnState(params: {
  orderedBySeat: SeatPlayer[];
  sessionMode: string;
  currentPlayerId: string | null;
  currentRound: number;
}): {
  nextPlayerId: string;
  nextTurnIndex: number;
  nextRound: number;
  roundAdvanced: boolean;
} {
  // Always advance by physical seat order; skip only people marked not playable
  // (0 HP, dead / unconscious / incapacitated, and DM in human_dm). Never assign a turn to them.
  const orderedBySeat = [...params.orderedBySeat].sort(
    (a, b) => a.seat_index - b.seat_index,
  );
  const playable = playablePlayersInSeatOrder(
    orderedBySeat,
    params.sessionMode,
  );
  if (playable.length === 0) {
    return {
      nextPlayerId: "__party_wipe__",
      nextTurnIndex: 0,
      nextRound: params.currentRound,
      roundAdvanced: false,
    };
  }

  const nextPlayerId = findNextPlayableIdInSeatOrder(
    orderedBySeat,
    playable,
    params.currentPlayerId,
  );

  const nextTurnIndex = playable.findIndex((p) => p.id === nextPlayerId);
  const safeTurnIndex = nextTurnIndex >= 0 ? nextTurnIndex : 0;

  const firstPlayableId = playable[0]!.id;
  const roundAdvanced =
    nextPlayerId === firstPlayableId &&
    params.currentPlayerId !== nextPlayerId;
  const nextRound = roundAdvanced ? params.currentRound + 1 : params.currentRound;

  return {
    nextPlayerId,
    nextTurnIndex: safeTurnIndex,
    nextRound,
    roundAdvanced,
  };
}

export function computeNextTurnState(params: {
  currentTurnIndex: number;
  playerCount: number;
  currentRound: number;
}): {
  nextTurnIndex: number;
  nextRound: number;
  roundAdvanced: boolean;
} {
  const { currentTurnIndex, playerCount, currentRound } = params;
  if (playerCount <= 0) {
    return {
      nextTurnIndex: 0,
      nextRound: currentRound,
      roundAdvanced: false,
    };
  }
  const nextTurnIndex = (currentTurnIndex + 1) % playerCount;
  const roundAdvanced =
    nextTurnIndex === 0 && currentTurnIndex !== nextTurnIndex;
  const nextRound = roundAdvanced ? currentRound + 1 : currentRound;
  return { nextTurnIndex, nextRound, roundAdvanced };
}
