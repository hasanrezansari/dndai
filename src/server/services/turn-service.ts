import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  actions,
  characters,
  narrativeEvents,
  players,
  sessions,
  turns,
} from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import {
  computeNextPlayableTurnState,
  evaluateTurnOwnership,
  playablePlayersInSeatOrder,
} from "@/lib/rules/turn-logic";
import { broadcastToSession } from "@/lib/socket/server";
import {
  MAX_TURN_EXTENSIONS_PER_CHAPTER,
  TURN_AWAY_STREAK_THRESHOLD,
  TURN_EXTENSION_SEC,
  TURN_TIMEOUT_SEC,
  turnDeadlineFromNow,
} from "@/lib/turn/timeout-config";
import type { Turn } from "@/lib/schemas/domain";
import type { GamePhase } from "@/lib/schemas/enums";
import { SessionNotFoundError } from "@/server/services/session-service";

export class NotYourTurnError extends Error {
  constructor(message = "Not your turn") {
    super(message);
    this.name = "NotYourTurnError";
  }
}

export class TurnBeingProcessedError extends Error {
  constructor() {
    super("Turn is being processed");
    this.name = "TurnBeingProcessedError";
  }
}

/** Party sessions use `/party/*` APIs — not the RPG `actions` pipeline. */
export class PartySessionRpgActionError extends Error {
  constructor() {
    super(
      "This session is in Party mode. Use party endpoints when they are available.",
    );
    this.name = "PartySessionRpgActionError";
  }
}

function turnLockKey(sessionId: string): string {
  return `turn:lock:${sessionId}`;
}

export async function acquireTurnLock(sessionId: string): Promise<boolean> {
  if (!redis) return true;
  const res = await redis.set(turnLockKey(sessionId), "1", { nx: true, ex: 45 });
  return res === "OK";
}

export async function releaseTurnLock(sessionId: string): Promise<void> {
  if (!redis) return;
  await redis.del(turnLockKey(sessionId));
}

function mapTurnRow(row: typeof turns.$inferSelect): Turn {
  return {
    id: row.id,
    session_id: row.session_id,
    round_number: row.round_number,
    player_id: row.player_id,
    phase: row.phase as GamePhase,
    status: row.status as Turn["status"],
    started_at: row.started_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

const AUTO_TIMEOUT_FALLBACK_INPUT =
  "[AUTO] The hero loses the initiative and holds position.";

async function turnExtensionsRemainingForPlayer(
  playerId: string,
): Promise<number> {
  const [row] = await db
    .select({ turn_extensions_used: players.turn_extensions_used })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  return Math.max(
    0,
    MAX_TURN_EXTENSIONS_PER_CHAPTER - (row?.turn_extensions_used ?? 0),
  );
}

function isCharacterIncapacitated(
  row: typeof characters.$inferSelect | null,
): boolean {
  // A seat without a linked character cannot take a turn.
  if (!row) return true;
  if (row.hp <= 0) return true;
  const conditions = Array.isArray(row.conditions) ? row.conditions : [];
  const lowered = conditions.map((c) => c.toLowerCase());
  return (
    lowered.includes("dead") ||
    lowered.includes("unconscious") ||
    lowered.includes("incapacitated")
  );
}

async function buildSeatOrderWithStatus(sessionId: string) {
  const rows = await db
    .select({
      player: players,
      character: characters,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .where(eq(players.session_id, sessionId))
    .orderBy(asc(players.seat_index));

  const orderedPlayers = rows.map((r) => r.player);
  const seatOrder = rows.map((r) => ({
    id: r.player.id,
    is_dm: r.player.is_dm,
    seat_index: r.player.seat_index,
    is_incapacitated: isCharacterIncapacitated(r.character),
  }));

  return { orderedPlayers, seatOrder };
}

/** Next turn targets from current DB state (e.g. after HP / conditions are committed). */
export async function computeNextTurnAfterActor(
  sessionId: string,
  actingPlayerId: string,
): Promise<{
  nextPlayerId: string;
  nextTurnIndex: number;
  nextRound: number;
  roundAdvanced: boolean;
}> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }
  const { seatOrder } = await buildSeatOrderWithStatus(sessionId);
  return computeNextPlayableTurnState({
    orderedBySeat: seatOrder,
    sessionMode: sessionRow.mode,
    currentPlayerId: actingPlayerId,
    currentRound: sessionRow.current_round,
  });
}

async function displayNameForPlayer(playerId: string): Promise<string> {
  const [c] = await db
    .select({ name: characters.name })
    .from(characters)
    .where(eq(characters.player_id, playerId))
    .limit(1);
  const n = c?.name?.trim();
  return n && n.length > 0 ? n : "Adventurer";
}

/** Canonical next actor for narration / UI after state patches (matches advanceTurn). */
export async function resolveNextActorForNarration(
  sessionId: string,
  actingPlayerId: string,
): Promise<{ nextPlayerId: string; nextPlayerDisplayName: string }> {
  const peek = await computeNextTurnAfterActor(sessionId, actingPlayerId);
  if (peek.nextPlayerId === "__party_wipe__") {
    return {
      nextPlayerId: actingPlayerId,
      nextPlayerDisplayName: await displayNameForPlayer(actingPlayerId),
    };
  }
  return {
    nextPlayerId: peek.nextPlayerId,
    nextPlayerDisplayName: await displayNameForPlayer(peek.nextPlayerId),
  };
}

export async function createFirstTurn(sessionId: string): Promise<string> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }
  if (sessionRow.status !== "active") {
    throw new Error("Session is not active");
  }

  const { orderedPlayers, seatOrder } = await buildSeatOrderWithStatus(sessionId);
  const playable = playablePlayersInSeatOrder(seatOrder, sessionRow.mode);
  const firstPlayable = playable[0];
  const first = orderedPlayers.find((p) => p.id === firstPlayable?.id);
  if (!first) {
    throw new Error("No players in session");
  }

  const version = sessionRow.state_version;

  const [turn] = await db
    .insert(turns)
    .values({
      session_id: sessionId,
      round_number: sessionRow.current_round,
      player_id: first.id,
      phase: sessionRow.phase,
      status: "awaiting_input",
      deadline_at: turnDeadlineFromNow(TURN_TIMEOUT_SEC),
    })
    .returning();

  if (!turn) {
    throw new Error("Failed to create turn");
  }

  const [updatedSession] = await db
    .update(sessions)
    .set({
      current_turn_index: 0,
      current_player_id: first.id,
      state_version: version + 1,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), eq(sessions.state_version, version)))
    .returning();

  if (!updatedSession) {
    await db.delete(turns).where(eq(turns.id, turn.id));
    throw new Error("Session state version conflict");
  }

  try {
    const turnExtensionsRemaining = await turnExtensionsRemainingForPlayer(
      first.id,
    );
    await broadcastToSession(sessionId, "turn-started", {
      turn_id: turn.id,
      player_id: first.id,
      round_number: updatedSession.current_round,
      deadline_at: turn.deadline_at?.toISOString() ?? null,
      turn_extensions_remaining: turnExtensionsRemaining,
    });
  } catch (err) {
    console.error(err);
  }

  return turn.id;
}

export async function validateTurnOwnership(
  sessionId: string,
  playerId: string,
): Promise<{ valid: boolean; turn: Turn | null; error?: string }> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    return { valid: false, turn: null, error: "Session not found" };
  }

  const [pvpTurnRow] = await db
    .select()
    .from(turns)
    .where(
      and(
        eq(turns.session_id, sessionId),
        eq(turns.status, "awaiting_pvp_defense"),
      ),
    )
    .orderBy(desc(turns.started_at))
    .limit(1);

  if (pvpTurnRow) {
    if (sessionRow.current_player_id !== playerId) {
      return { valid: false, turn: null, error: "Not your turn" };
    }
    return { valid: true, turn: mapTurnRow(pvpTurnRow) };
  }

  let turnRow: typeof turns.$inferSelect | undefined;
  if (sessionRow.current_player_id) {
    const rows = await db
      .select()
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          eq(turns.status, "awaiting_input"),
          eq(turns.player_id, sessionRow.current_player_id),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    turnRow = rows[0];
  }

  const ownership = evaluateTurnOwnership({
    sessionStatus: sessionRow.status,
    currentPlayerId: sessionRow.current_player_id,
    requestPlayerId: playerId,
    turn: turnRow
      ? { status: turnRow.status, player_id: turnRow.player_id }
      : null,
  });

  if (!ownership.valid) {
    return { valid: false, turn: null, error: ownership.error };
  }
  if (!turnRow) {
    return { valid: false, turn: null, error: "No active turn" };
  }
  return { valid: true, turn: mapTurnRow(turnRow) };
}

export async function submitAction(params: {
  sessionId: string;
  playerId: string;
  rawInput: string;
}): Promise<{ actionId: string; turnId: string }> {
  const [sessionModeRow] = await db
    .select({ mode: sessions.mode, game_kind: sessions.game_kind })
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (sessionModeRow?.game_kind === "party") {
    throw new PartySessionRpgActionError();
  }
  const [actorRow] = await db
    .select({ is_dm: players.is_dm })
    .from(players)
    .where(
      and(
        eq(players.id, params.playerId),
        eq(players.session_id, params.sessionId),
      ),
    )
    .limit(1);
  if (
    sessionModeRow?.mode === "human_dm" &&
    actorRow?.is_dm
  ) {
    throw new NotYourTurnError("DM does not take turns");
  }

  const validated = await validateTurnOwnership(params.sessionId, params.playerId);
  if (!validated.valid || !validated.turn) {
    throw new NotYourTurnError(validated.error ?? "Not your turn");
  }

  const locked = await acquireTurnLock(params.sessionId);
  if (!locked) {
    throw new TurnBeingProcessedError();
  }

  const [updatedTurn] = await db
    .update(turns)
    .set({ status: "processing" })
    .where(
      and(
        eq(turns.id, validated.turn.id),
        eq(turns.status, "awaiting_input"),
      ),
    )
    .returning({ id: turns.id });

  if (!updatedTurn) {
    await releaseTurnLock(params.sessionId);
    throw new NotYourTurnError("Turn not awaiting input");
  }

  const [actionRow] = await db
    .insert(actions)
    .values({
      turn_id: validated.turn.id,
      raw_input: params.rawInput,
      resolution_status: "pending",
    })
    .returning();

  if (!actionRow) {
    await releaseTurnLock(params.sessionId);
    throw new Error("Failed to record action");
  }

  await db
    .update(players)
    .set({
      timeout_streak: 0,
      is_away: false,
      last_seen_at: new Date(),
    })
    .where(eq(players.id, params.playerId));

  try {
    await broadcastToSession(params.sessionId, "action-submitted", {
      player_id: params.playerId,
      raw_input: params.rawInput,
      turn_id: validated.turn.id,
      round_number: validated.turn.round_number,
    });
  } catch (err) {
    console.error(err);
  }

  return { actionId: actionRow.id, turnId: validated.turn.id };
}

export async function advanceTurn(
  sessionId: string,
): Promise<{ nextPlayerId: string; roundAdvanced: boolean; partyWipe?: boolean }> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }

  const { orderedPlayers, seatOrder } = await buildSeatOrderWithStatus(sessionId);

  if (orderedPlayers.length === 0) {
    throw new Error("No players in session");
  }

  const [processingTurn] = await db
    .select()
    .from(turns)
    .where(and(eq(turns.session_id, sessionId), eq(turns.status, "processing")))
    .orderBy(desc(turns.started_at))
    .limit(1);

  if (!processingTurn) {
    throw new Error("No processing turn to resolve");
  }

  const version = sessionRow.state_version;
  const { nextPlayerId, nextTurnIndex, nextRound, roundAdvanced } =
    computeNextPlayableTurnState({
      orderedBySeat: seatOrder,
      sessionMode: sessionRow.mode,
      currentPlayerId: processingTurn.player_id,
      currentRound: sessionRow.current_round,
    });

  if (nextPlayerId === "__party_wipe__") {
    await db
      .update(turns)
      .set({ status: "resolved", resolved_at: new Date() })
      .where(and(eq(turns.id, processingTurn.id), eq(turns.status, "processing")));
    return { nextPlayerId: processingTurn.player_id, roundAdvanced: false, partyWipe: true };
  }

  const nextPlayer = orderedPlayers.find((p) => p.id === nextPlayerId);
  if (!nextPlayer) {
    throw new Error("Invalid turn order");
  }

  const resolved = await db
    .update(turns)
    .set({
      status: "resolved",
      resolved_at: new Date(),
    })
    .where(
      and(eq(turns.id, processingTurn.id), eq(turns.status, "processing")),
    )
    .returning({ id: turns.id });

  if (resolved.length === 0) {
    throw new Error("Failed to resolve turn");
  }

  const [newTurn] = await db
    .insert(turns)
    .values({
      session_id: sessionId,
      round_number: nextRound,
      player_id: nextPlayer.id,
      phase: sessionRow.phase,
      status: "awaiting_input",
      deadline_at: turnDeadlineFromNow(TURN_TIMEOUT_SEC),
    })
    .returning();

  if (!newTurn) {
    throw new Error("Failed to create next turn");
  }

  const [updatedSession] = await db
    .update(sessions)
    .set({
      current_turn_index: nextTurnIndex,
      current_player_id: nextPlayer.id,
      current_round: nextRound,
      state_version: version + 1,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), eq(sessions.state_version, version)))
    .returning();

  if (!updatedSession) {
    throw new Error("Session state version conflict");
  }

  if (roundAdvanced) {
    try {
      await broadcastToSession(sessionId, "round-summary", {
        summary_text: `Round ${processingTurn.round_number} complete. The party presses onward into round ${nextRound}.`,
        round_number: processingTurn.round_number,
        turn_id: processingTurn.id,
      });
    } catch (err) {
      console.error("[turn-service] round-summary broadcast failed:", err);
    }
  }

  try {
    const turnExtensionsRemaining = await turnExtensionsRemainingForPlayer(
      nextPlayer.id,
    );
    await broadcastToSession(sessionId, "turn-started", {
      turn_id: newTurn.id,
      player_id: nextPlayer.id,
      round_number: nextRound,
      deadline_at: newTurn.deadline_at?.toISOString() ?? null,
      turn_extensions_remaining: turnExtensionsRemaining,
    });
  } catch (err) {
    console.error(err);
  }

  return { nextPlayerId: nextPlayer.id, roundAdvanced };
}

/**
 * Best-effort timeout tick: if current awaiting turn is expired, auto-resolve it
 * so the table can keep playing even when the active player drops/AFKs.
 */
export async function processExpiredTurnForSession(sessionId: string): Promise<boolean> {
  const [sessionRow] = await db
    .select({ current_player_id: sessions.current_player_id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const currentPlayerId = sessionRow?.current_player_id;
  if (!currentPlayerId) return false;

  const [awaitingTurn] = await db
    .select({
      id: turns.id,
      player_id: turns.player_id,
      deadline_at: turns.deadline_at,
      round_number: turns.round_number,
    })
    .from(turns)
    .where(
      and(
        eq(turns.session_id, sessionId),
        eq(turns.player_id, currentPlayerId),
        eq(turns.status, "awaiting_input"),
      ),
    )
    .orderBy(desc(turns.started_at))
    .limit(1);
  if (!awaitingTurn) return false;

  if (!awaitingTurn.deadline_at) {
    await db
      .update(turns)
      .set({ deadline_at: turnDeadlineFromNow(TURN_TIMEOUT_SEC) })
      .where(eq(turns.id, awaitingTurn.id));
    return false;
  }

  const deadlineMs = awaitingTurn.deadline_at.getTime();
  if (deadlineMs > Date.now()) return false;

  const locked = await acquireTurnLock(sessionId);
  if (!locked) return false;
  try {
    const [processingTurn] = await db
      .update(turns)
      .set({
        status: "processing",
        auto_resolved: true,
        auto_resolve_reason: "timeout",
      })
      .where(and(eq(turns.id, awaitingTurn.id), eq(turns.status, "awaiting_input")))
      .returning({ id: turns.id, player_id: turns.player_id });
    if (!processingTurn) return false;

    await db.insert(actions).values({
      turn_id: processingTurn.id,
      raw_input: AUTO_TIMEOUT_FALLBACK_INPUT,
      resolution_status: "applied",
    });

    const [actor] = await db
      .select({ timeout_streak: players.timeout_streak })
      .from(players)
      .where(eq(players.id, processingTurn.player_id))
      .limit(1);
    const nextStreak = (actor?.timeout_streak ?? 0) + 1;
    await db
      .update(players)
      .set({
        timeout_streak: nextStreak,
        is_away: nextStreak >= TURN_AWAY_STREAK_THRESHOLD,
      })
      .where(eq(players.id, processingTurn.player_id));

    try {
      await broadcastToSession(sessionId, "dm-notice", {
        message: "Turn auto-resolved due to timeout.",
        turn_id: processingTurn.id,
        round_number: awaitingTurn.round_number,
      });
    } catch (err) {
      console.error("[turn-service] timeout notice broadcast failed:", err);
    }

    await advanceTurn(sessionId);
    return true;
  } finally {
    await releaseTurnLock(sessionId);
  }
}

export class ExtendTurnNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtendTurnNotAllowedError";
  }
}

/**
 * Current actor may add {@link TURN_EXTENSION_SEC}s to the open turn deadline,
 * up to {@link MAX_TURN_EXTENSIONS_PER_CHAPTER} times per chapter per player.
 */
export async function extendTurnDeadlineForSession(params: {
  sessionId: string;
  playerId: string;
}): Promise<{ deadlineAt: string; extensionsRemaining: number }> {
  const locked = await acquireTurnLock(params.sessionId);
  if (!locked) {
    throw new ExtendTurnNotAllowedError("Turn lock busy");
  }
  try {
    const [sessionRow] = await db
      .select({
        current_player_id: sessions.current_player_id,
        status: sessions.status,
        game_kind: sessions.game_kind,
      })
      .from(sessions)
      .where(eq(sessions.id, params.sessionId))
      .limit(1);
    if (!sessionRow) throw new SessionNotFoundError();
    if (sessionRow.status !== "active") {
      throw new ExtendTurnNotAllowedError("Session is not active");
    }
    if (sessionRow.game_kind === "party") {
      throw new ExtendTurnNotAllowedError("Party mode has no RPG turn timer");
    }
    if (sessionRow.current_player_id !== params.playerId) {
      throw new ExtendTurnNotAllowedError("Not your turn");
    }

    const [awaiting] = await db
      .select({
        id: turns.id,
        deadline_at: turns.deadline_at,
      })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, params.sessionId),
          eq(turns.player_id, params.playerId),
          eq(turns.status, "awaiting_input"),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    if (!awaiting) {
      throw new ExtendTurnNotAllowedError("No active turn awaiting input");
    }

    const [actor] = await db
      .select({ turn_extensions_used: players.turn_extensions_used })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);
    const used = actor?.turn_extensions_used ?? 0;
    if (used >= MAX_TURN_EXTENSIONS_PER_CHAPTER) {
      throw new ExtendTurnNotAllowedError(
        "No turn extensions remaining this chapter",
      );
    }

    const newDeadline = !awaiting.deadline_at
      ? turnDeadlineFromNow(TURN_TIMEOUT_SEC + TURN_EXTENSION_SEC)
      : new Date(
          Math.max(Date.now(), awaiting.deadline_at.getTime()) +
            TURN_EXTENSION_SEC * 1000,
        );

    await db
      .update(turns)
      .set({ deadline_at: newDeadline })
      .where(eq(turns.id, awaiting.id));

    const nextUsed = used + 1;
    await db
      .update(players)
      .set({ turn_extensions_used: nextUsed })
      .where(eq(players.id, params.playerId));

    const extensionsRemaining = Math.max(
      0,
      MAX_TURN_EXTENSIONS_PER_CHAPTER - nextUsed,
    );

    try {
      await broadcastToSession(params.sessionId, "turn-deadline-updated", {
        turn_id: awaiting.id,
        deadline_at: newDeadline.toISOString(),
        player_id: params.playerId,
        turn_extensions_remaining: extensionsRemaining,
      });
    } catch (err) {
      console.error(
        "[turn-service] turn-deadline-updated broadcast failed:",
        err,
      );
    }

    return {
      deadlineAt: newDeadline.toISOString(),
      extensionsRemaining,
    };
  } finally {
    await releaseTurnLock(params.sessionId);
  }
}

export async function resolveCurrentProcessingTurn(
  sessionId: string,
): Promise<void> {
  const [processingTurn] = await db
    .select()
    .from(turns)
    .where(and(eq(turns.session_id, sessionId), eq(turns.status, "processing")))
    .orderBy(desc(turns.started_at))
    .limit(1);

  if (!processingTurn) {
    throw new Error("No processing turn to resolve");
  }

  const resolved = await db
    .update(turns)
    .set({
      status: "resolved",
      resolved_at: new Date(),
    })
    .where(
      and(eq(turns.id, processingTurn.id), eq(turns.status, "processing")),
    )
    .returning({ id: turns.id });

  if (resolved.length === 0) {
    throw new Error("Failed to resolve turn");
  }
}

export async function resolveAwaitingDmTurn(
  sessionId: string,
): Promise<void> {
  const [awaitingTurn] = await db
    .select()
    .from(turns)
    .where(and(eq(turns.session_id, sessionId), eq(turns.status, "awaiting_dm")))
    .orderBy(desc(turns.started_at))
    .limit(1);

  if (!awaitingTurn) {
    throw new Error("No awaiting_dm turn to resolve");
  }

  const resolved = await db
    .update(turns)
    .set({
      status: "resolved",
      resolved_at: new Date(),
    })
    .where(
      and(eq(turns.id, awaitingTurn.id), eq(turns.status, "awaiting_dm")),
    )
    .returning({ id: turns.id });

  if (resolved.length === 0) {
    throw new Error("Failed to resolve awaiting_dm turn");
  }
}

export async function resolveHumanDmTurn(params: {
  sessionId: string;
  turnId: string;
  narrationText: string;
  visibleChanges: string[];
}): Promise<{
  nextPlayerId: string;
  sceneText: string;
  visibleChanges: string[];
  stateVersion: number;
}> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }

  const [awaitingTurn] = await db
    .select()
    .from(turns)
    .where(
      and(
        eq(turns.id, params.turnId),
        eq(turns.session_id, params.sessionId),
        eq(turns.status, "awaiting_dm"),
      ),
    )
    .limit(1);
  if (!awaitingTurn) {
    throw new Error("No turn awaiting DM");
  }

  const { orderedPlayers, seatOrder } = await buildSeatOrderWithStatus(params.sessionId);

  if (orderedPlayers.length === 0) {
    throw new Error("No players in session");
  }

  const { nextPlayerId, nextTurnIndex, nextRound } =
    computeNextPlayableTurnState({
      orderedBySeat: seatOrder,
      sessionMode: sessionRow.mode,
      currentPlayerId: awaitingTurn.player_id,
      currentRound: sessionRow.current_round,
    });

  const nextPlayer = orderedPlayers.find((p) => p.id === nextPlayerId);
  if (!nextPlayer) {
    throw new Error("Invalid turn order");
  }

  const version = sessionRow.state_version;

  const [insertedNarrative] = await db
    .insert(narrativeEvents)
    .values({
      session_id: params.sessionId,
      turn_id: params.turnId,
      scene_text: params.narrationText,
      visible_changes: params.visibleChanges,
      tone: "dramatic",
      next_actor_id: nextPlayerId,
      image_hint: {},
    })
    .returning({ id: narrativeEvents.id });

  if (!insertedNarrative) {
    throw new Error("Failed to persist narrative");
  }

  const resolved = await db
    .update(turns)
    .set({
      status: "resolved",
      resolved_at: new Date(),
    })
    .where(
      and(eq(turns.id, params.turnId), eq(turns.status, "awaiting_dm")),
    )
    .returning({ id: turns.id });

  if (resolved.length === 0) {
    throw new Error("Failed to resolve turn");
  }

  const [newTurn] = await db
    .insert(turns)
    .values({
      session_id: params.sessionId,
      round_number: nextRound,
      player_id: nextPlayer.id,
      phase: sessionRow.phase,
      status: "awaiting_input",
      deadline_at: turnDeadlineFromNow(TURN_TIMEOUT_SEC),
    })
    .returning();

  if (!newTurn) {
    throw new Error("Failed to create next turn");
  }

  const [updatedSession] = await db
    .update(sessions)
    .set({
      current_turn_index: nextTurnIndex,
      current_player_id: nextPlayer.id,
      current_round: nextRound,
      state_version: version + 1,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, params.sessionId), eq(sessions.state_version, version)))
    .returning();

  if (!updatedSession) {
    throw new Error("Session state version conflict");
  }

  try {
    const turnExtensionsRemaining = await turnExtensionsRemainingForPlayer(
      nextPlayer.id,
    );
    await broadcastToSession(params.sessionId, "turn-started", {
      turn_id: newTurn.id,
      player_id: nextPlayer.id,
      round_number: nextRound,
      deadline_at: newTurn.deadline_at?.toISOString() ?? null,
      turn_extensions_remaining: turnExtensionsRemaining,
    });
  } catch (err) {
    console.error(err);
  }

  return {
    nextPlayerId,
    sceneText: params.narrationText,
    visibleChanges: params.visibleChanges,
    stateVersion: updatedSession.state_version,
  };
}
