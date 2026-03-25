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
  const playable = playablePlayersInSeatOrder(
    params.orderedBySeat,
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
  const idx = playable.findIndex((p) => p.id === params.currentPlayerId);
  const currentIdx = idx >= 0 ? idx : 0;
  const nextIdx = (currentIdx + 1) % playable.length;
  const roundAdvanced = nextIdx === 0 && idx !== nextIdx;
  const nextRound = roundAdvanced ? params.currentRound + 1 : params.currentRound;
  return {
    nextPlayerId: playable[nextIdx]!.id,
    nextTurnIndex: nextIdx,
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
