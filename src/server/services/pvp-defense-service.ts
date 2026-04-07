import { and, desc, eq } from "drizzle-orm";

import type { ActionIntent, RulesInterpreterOutput } from "@/lib/schemas/ai-io";
import { db } from "@/lib/db";
import { orchestrationTraces, sessions, turns } from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import { broadcastToSession } from "@/lib/socket/server";
import { SessionNotFoundError } from "@/server/services/session-service";

/** Stored pipeline snapshot when we pause for defender input (v1). */
export type PvpDefenseStageV1 = {
  v: 1;
  sessionId: string;
  turnId: string;
  actionId: string;
  attackerPlayerId: string;
  defenderPlayerId: string;
  attackerRawInput: string;
  /** Serialized `ActionIntent` after NPC target hydration + DB write. */
  intent: ActionIntent;
  /** Serialized rules output used for the attacker. */
  rules: RulesInterpreterOutput;
  roundNumber: number;
};

const TRACE_STEP = "pvp_defense_stage_v1";

function redisKey(turnId: string): string {
  return `pvp_defense_stage:${turnId}`;
}

export async function savePvpDefenseStage(
  payload: PvpDefenseStageV1,
): Promise<void> {
  const json = JSON.stringify(payload);
  if (redis) {
    await redis.set(redisKey(payload.turnId), json, { ex: 60 * 60 * 6 });
    return;
  }
  await db.insert(orchestrationTraces).values({
    session_id: payload.sessionId,
    turn_id: payload.turnId,
    step_name: TRACE_STEP,
    input_summary: { turn_id: payload.turnId },
    output_summary: { json },
    model_used: "deterministic",
    tokens_in: 0,
    tokens_out: 0,
    latency_ms: 0,
    success: true,
  });
}

export async function loadPvpDefenseStage(
  turnId: string,
): Promise<PvpDefenseStageV1 | null> {
  if (redis) {
    const raw = await redis.get<string>(redisKey(turnId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PvpDefenseStageV1;
    } catch {
      return null;
    }
  }
  const [row] = await db
    .select({ output_summary: orchestrationTraces.output_summary })
    .from(orchestrationTraces)
    .where(
      and(
        eq(orchestrationTraces.turn_id, turnId),
        eq(orchestrationTraces.step_name, TRACE_STEP),
      ),
    )
    .orderBy(desc(orchestrationTraces.created_at))
    .limit(1);
  const json = row?.output_summary?.json;
  if (typeof json !== "string") return null;
  try {
    return JSON.parse(json) as PvpDefenseStageV1;
  } catch {
    return null;
  }
}

export async function clearPvpDefenseStage(turnId: string): Promise<void> {
  if (redis) {
    await redis.del(redisKey(turnId));
  }
}

export async function handoffToPvpDefense(params: {
  sessionId: string;
  turnId: string;
  defenderPlayerId: string;
}): Promise<void> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!sessionRow) throw new SessionNotFoundError();

  const version = sessionRow.state_version;
  const [updatedSession] = await db
    .update(sessions)
    .set({
      current_player_id: params.defenderPlayerId,
      state_version: version + 1,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, params.sessionId), eq(sessions.state_version, version)))
    .returning({ state_version: sessions.state_version });

  if (!updatedSession) {
    throw new Error("Session state version conflict");
  }
}

export async function setSessionCurrentPlayer(params: {
  sessionId: string;
  playerId: string;
}): Promise<void> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!sessionRow) throw new SessionNotFoundError();

  const version = sessionRow.state_version;
  const [updatedSession] = await db
    .update(sessions)
    .set({
      current_player_id: params.playerId,
      state_version: version + 1,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, params.sessionId), eq(sessions.state_version, version)))
    .returning({ state_version: sessions.state_version });

  if (!updatedSession) {
    throw new Error("Session state version conflict");
  }
}

export async function broadcastPvpDefenseChallenge(params: {
  sessionId: string;
  turnId: string;
  attackerPlayerId: string;
  defenderPlayerId: string;
  roundNumber: number;
}): Promise<void> {
  try {
    await broadcastToSession(params.sessionId, "pvp-defense-challenge", {
      turn_id: params.turnId,
      attacker_player_id: params.attackerPlayerId,
      defender_player_id: params.defenderPlayerId,
      round_number: params.roundNumber,
    });
  } catch (err) {
    console.error("[pvp-defense] broadcast failed:", err);
  }
}
