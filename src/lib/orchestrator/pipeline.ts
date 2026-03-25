import { and, eq } from "drizzle-orm";

import { getAIProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import { actions, narrativeEvents, turns } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { buildTurnContext } from "@/lib/orchestrator/context-builder";
import { commitStatePatches } from "@/lib/orchestrator/apply-state";
import { logTrace } from "@/lib/orchestrator/trace";
import { parseIntent } from "@/lib/orchestrator/workers/intent-parser";
import { interpretRules } from "@/lib/orchestrator/workers/rules-interpreter";
import { generateNarration } from "@/lib/orchestrator/workers/narrator";

import type { ActionIntent, NarratorOutput } from "@/lib/schemas/ai-io";
import type { DiceRoll, NarrativeEvent } from "@/lib/schemas/domain";
import type { StatePatch } from "@/lib/schemas/state-patches";
import { performRoll } from "@/server/services/dice-service";
import { applyTurnQuestProgress } from "@/server/services/quest-service";

export type SessionImageJobPayload = {
  turnId: string;
  narrativeText: string;
  sceneContext: string;
  characterNames: string[];
};

function resolveAppOrigin(): string | null {
  const internal = process.env.INTERNAL_APP_URL?.replace(/\/$/, "");
  if (internal) return internal;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  const nextAuth = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (nextAuth && !nextAuth.includes("localhost")) return nextAuth;
  return null;
}

export async function scheduleSessionImageGeneration(
  sessionId: string,
  sceneId: string,
  payload: SessionImageJobPayload,
): Promise<void> {
  const origin = resolveAppOrigin();
  if (!origin) {
    console.error("[image] missing app origin — VERCEL_URL:", process.env.VERCEL_URL, "NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
    return;
  }
  const url = `${origin}/api/sessions/${sessionId}/image`;
  console.log("[image] scheduling generation at:", url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, scene_id: sceneId }),
    });
    console.log("[image] scheduled, status:", res.status);
  } catch (err) {
    console.error("[image] schedule fetch failed:", err);
  }
}

function computeStatePatches(intent: ActionIntent, rolls: DiceRoll[]): StatePatch[] {
  if (intent.action_type === "attack" && rolls[0]?.result === "critical_success") {
    return [];
  }
  return [];
}

function mapNarrativeRow(row: typeof narrativeEvents.$inferSelect): NarrativeEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    turn_id: row.turn_id,
    scene_text: row.scene_text,
    visible_changes: row.visible_changes,
    tone: row.tone,
    next_actor_id: row.next_actor_id,
    image_hint: row.image_hint as NarrativeEvent["image_hint"],
    created_at: row.created_at.toISOString(),
  };
}

function rollDc(roll: { dice: string; dc?: number }): number {
  if (roll.dc !== undefined) return roll.dc;
  return roll.dice === "d20" ? 10 : 1;
}

export type TurnPipelineResult =
  | {
      kind: "ai";
      narrativeEvent: NarrativeEvent;
      diceRolls: DiceRoll[];
      statePatches: StatePatch[];
      shouldEndSession: boolean;
      imageNeeded: boolean;
      imageJobPayload: SessionImageJobPayload | undefined;
    }
  | {
      kind: "human_dm";
      diceRolls: DiceRoll[];
      statePatches: StatePatch[];
      shouldEndSession: boolean;
      expectedNextPlayerId: string;
    };

export async function runTurnPipeline(params: {
  sessionId: string;
  turnId: string;
  actionId: string;
  playerId: string;
  rawInput: string;
}): Promise<TurnPipelineResult> {
  const { sessionId, turnId, actionId, playerId, rawInput } = params;

  const g0 = Date.now();
  const ctx = await buildTurnContext({
    sessionId,
    playerId,
    turnId,
  });

  await logTrace({
    sessionId,
    turnId,
    stepName: "gather_context",
    input: { sessionId, turnId, actionId, playerId },
    output: {
      player_count: ctx.allPlayerNames.length,
      round: ctx.session.currentRound,
      round_will_advance: ctx.roundAdvanced,
    },
    modelUsed: "deterministic",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - g0,
    success: true,
  });

  const provider = getAIProvider();

  const intentResult = await parseIntent({
    sessionId,
    turnId,
    rawInput,
    characterName: ctx.character.name,
    characterClass: ctx.character.class,
    recentEvents: ctx.recentEvents,
  });
  const intent = intentResult.data;

  await db
    .update(actions)
    .set({ parsed_intent: intent as unknown as Record<string, unknown> })
    .where(eq(actions.id, actionId));

  const rulesResult = await interpretRules({
    sessionId,
    turnId,
    intent,
    characterStats: ctx.character.stats,
    characterClass: ctx.character.class,
  });
  const rules = rulesResult.data;

  const d0 = Date.now();
  const diceRolls: DiceRoll[] = [];
  if (rules.rolls.length > 0) {
    for (const roll of rules.rolls) {
      const dr = await performRoll({
        actionId,
        diceType: roll.dice,
        context: roll.context,
        modifier: roll.modifier,
        advantageState: roll.advantage_state,
        dc: rollDc(roll),
      });
      diceRolls.push(dr);
    }
  }
  await logTrace({
    sessionId,
    turnId,
    stepName: "dice_rolls",
    input: { actionId, roll_specs: rules.rolls },
    output: {
      rolls: diceRolls.map((r) => ({
        id: r.id,
        total: r.total,
        result: r.result,
      })),
    },
    modelUsed: "deterministic",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - d0,
    success: true,
  });

  const s0 = Date.now();
  const statePatches = computeStatePatches(intent, diceRolls);
  const questUpdate = await applyTurnQuestProgress({
    sessionId,
    round: ctx.session.currentRound,
    objectiveFallback:
      ctx.session.adventurePrompt?.trim() ||
      ctx.session.campaignTitle?.trim() ||
      "Complete the mission and survive.",
    actionType: intent.action_type,
    diceRolls,
  });
  await logTrace({
    sessionId,
    turnId,
    stepName: "state_delta",
    input: { intent_summary: intent.action_type },
    output: { patches: statePatches, quest_state: questUpdate.state },
    modelUsed: "deterministic",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - s0,
    success: true,
  });

  const a0 = Date.now();
  const { stateVersion } = await commitStatePatches(sessionId, statePatches);
  await logTrace({
    sessionId,
    turnId,
    stepName: "apply_state",
    input: { patch_count: statePatches.length },
    output: { state_version: stateVersion },
    modelUsed: "deterministic",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - a0,
    success: true,
  });

  await db
    .update(actions)
    .set({ resolution_status: "applied" })
    .where(eq(actions.id, actionId));

  if (ctx.session.mode === "human_dm") {
    const [marked] = await db
      .update(turns)
      .set({ status: "awaiting_dm" })
      .where(and(eq(turns.id, turnId), eq(turns.status, "processing")))
      .returning({ id: turns.id });
    if (!marked) {
      throw new Error("Failed to mark turn awaiting DM");
    }
    try {
      await broadcastToSession(sessionId, "awaiting-dm", {
        turn_id: turnId,
        acting_player_id: playerId,
      });
    } catch (err) {
      console.error(err);
    }
    return {
      kind: "human_dm",
      diceRolls,
      statePatches,
      shouldEndSession: false,
      expectedNextPlayerId: ctx.nextPlayerId,
    };
  }

  const expectedNextPlayerId = ctx.nextPlayerId;
  const actorName = ctx.character.name;
  const nextActorName = ctx.nextPlayerName;

  const recentNarrative = ctx.recentEvents.join("\n---\n").slice(0, 6000);
  const sceneContext =
    ctx.currentSceneDescription?.trim() ||
    ctx.session.campaignTitle?.trim() ||
    ctx.session.adventurePrompt?.trim() ||
    "";

  const narr0 = await generateNarration({
    sessionId,
    turnId,
    rawInput,
    intent,
    diceResults: diceRolls.map((r) => ({
      context: r.context,
      total: r.total,
      result: r.result,
    })),
    characterName: actorName,
    nextPlayerName: nextActorName,
    recentNarrative,
    sceneContext,
    provider,
  });

  let narration: NarratorOutput = {
    ...narr0.data,
    next_actor_id: expectedNextPlayerId,
  };
  narration = {
    ...narration,
    visible_changes: [...narration.visible_changes, ...questUpdate.visibleChanges],
  };

  const [inserted] = await db
    .insert(narrativeEvents)
    .values({
      session_id: sessionId,
      turn_id: turnId,
      scene_text: narration.scene_text,
      visible_changes: narration.visible_changes,
      tone: narration.tone,
      next_actor_id: narration.next_actor_id,
      image_hint: narration.image_hint as Record<string, unknown>,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to persist narrative");
  }

  const imageNeeded = true;

  let imageJobPayload: SessionImageJobPayload | undefined;
  if (imageNeeded) {
    imageJobPayload = {
      turnId,
      narrativeText: narration.scene_text,
      sceneContext:
        ctx.currentSceneDescription?.trim() ||
        ctx.session.campaignTitle?.trim() ||
        ctx.session.adventurePrompt?.trim() ||
        "",
      characterNames: ctx.allPlayerNames,
    };
  }

  return {
    kind: "ai",
    narrativeEvent: mapNarrativeRow(inserted),
    diceRolls,
    statePatches,
    shouldEndSession: questUpdate.shouldEndSession,
    imageNeeded,
    imageJobPayload,
  };
}
