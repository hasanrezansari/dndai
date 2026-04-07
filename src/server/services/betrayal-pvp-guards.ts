import type {
  BetrayalPvpMeta,
  QuestState,
} from "@/server/services/quest-service";

/** Max hostile PC-vs-PC clashes while the betrayal arc stays in `confronting` (per reset). */
export const MAX_BETRAYAL_CLASHES_PER_ARC = 3;

/** Max times one player may initiate a gated PC hostile during confrontational mode (session quest lifetime). */
export const MAX_BETRAYAL_INITIATIONS_PER_PLAYER = 8;

/** Rounds before the same two PCs can trigger another gated clash (unordered pair). */
export const BETRAYAL_PAIR_COOLDOWN_ROUNDS = 2;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function defaultBetrayalPvpMeta(): BetrayalPvpMeta {
  return {
    clashes_this_arc: 0,
    initiations_by_player: {},
    last_pair_round: {},
  };
}

export function normalizeBetrayalPvpMeta(
  raw: unknown,
): BetrayalPvpMeta | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const c = o.clashes_this_arc;
  const ib = o.initiations_by_player;
  const lr = o.last_pair_round;
  if (typeof c !== "number" || typeof ib !== "object" || ib === null) {
    return undefined;
  }
  if (typeof lr !== "object" || lr === null) return undefined;
  return {
    clashes_this_arc: Math.max(0, Math.floor(c)),
    initiations_by_player: { ...(ib as Record<string, number>) },
    last_pair_round: Object.fromEntries(
      Object.entries(lr as Record<string, number>).map(([k, v]) => [
        k,
        typeof v === "number" ? v : 0,
      ]),
    ),
  };
}

export function resetBetrayalPvpForNewArc(
  meta: BetrayalPvpMeta | undefined,
): BetrayalPvpMeta {
  if (!meta) return defaultBetrayalPvpMeta();
  return {
    ...meta,
    clashes_this_arc: 0,
    last_pair_round: {},
  };
}

export type BetrayalPvpGateContext = {
  betrayalMode: string;
  betrayalPhase: string | null;
  quest: QuestState;
  attackerPlayerId: string;
  victimPlayerId: string;
  currentRound: number;
};

export function evaluateBetrayalPvpGate(
  ctx: BetrayalPvpGateContext,
): { ok: true } | { ok: false; reason: string } {
  if (ctx.betrayalMode !== "confrontational") {
    return { ok: true };
  }
  if (ctx.betrayalPhase !== "confronting") {
    return {
      ok: false,
      reason:
        "Party-vs-party betrayal clashes need an active confrontation beat. In confrontational mode that normally opens automatically when a hostile action targets another player while the session is running; if this still appears, the table may be between beats—ask the host to reset the betrayal arc from Quest.",
    };
  }

  const meta =
    normalizeBetrayalPvpMeta(ctx.quest.betrayal_pvp) ?? defaultBetrayalPvpMeta();

  if (meta.clashes_this_arc >= MAX_BETRAYAL_CLASHES_PER_ARC) {
    return {
      ok: false,
      reason: `This confrontation beat already had ${MAX_BETRAYAL_CLASHES_PER_ARC} party clashes — host must reset the betrayal arc or resolve it before more.`,
    };
  }

  const ini = meta.initiations_by_player[ctx.attackerPlayerId] ?? 0;
  if (ini >= MAX_BETRAYAL_INITIATIONS_PER_PLAYER) {
    return {
      ok: false,
      reason:
        "Betrayal clash limit for this player this session — host can reset the arc or adjust mode.",
    };
  }

  const pk = pairKey(ctx.attackerPlayerId, ctx.victimPlayerId);
  const last = meta.last_pair_round[pk];
  if (
    last !== undefined &&
    ctx.currentRound - last < BETRAYAL_PAIR_COOLDOWN_ROUNDS
  ) {
    return {
      ok: false,
      reason: `These two characters clashed very recently (round ${last}); wait ${BETRAYAL_PAIR_COOLDOWN_ROUNDS} round(s) between betrayals or host resets the arc.`,
    };
  }

  return { ok: true };
}

export function recordBetrayalPvpClash(
  quest: QuestState,
  attackerPlayerId: string,
  victimPlayerId: string,
  round: number,
): BetrayalPvpMeta {
  const prev = normalizeBetrayalPvpMeta(quest.betrayal_pvp) ?? defaultBetrayalPvpMeta();

  const pk = pairKey(attackerPlayerId, victimPlayerId);
  const initiations = { ...prev.initiations_by_player };
  initiations[attackerPlayerId] = (initiations[attackerPlayerId] ?? 0) + 1;

  return {
    clashes_this_arc: prev.clashes_this_arc + 1,
    initiations_by_player: initiations,
    last_pair_round: { ...prev.last_pair_round, [pk]: round },
  };
}

export function isBetrayalPvpHostileIntent(params: {
  actionType: string;
}): boolean {
  return params.actionType === "attack" || params.actionType === "cast_spell";
}

/** +DC when attacking another PC during confrontation (defender has edge in chaos). */
export const BETRAYAL_PC_TARGET_DC_BONUS = 2;
