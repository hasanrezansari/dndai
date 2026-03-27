import { and, desc, eq } from "drizzle-orm";

import { getAIProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import { actions, narrativeEvents, npcStates, sceneSnapshots, turns } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { buildTurnContext } from "@/lib/orchestrator/context-builder";
import { commitStatePatches } from "@/lib/orchestrator/apply-state";
import { logTrace } from "@/lib/orchestrator/trace";
import { parseIntent } from "@/lib/orchestrator/workers/intent-parser";
import { interpretRules } from "@/lib/orchestrator/workers/rules-interpreter";
import { interpretConsequences, consequenceToPatches } from "@/lib/orchestrator/workers/consequence-interpreter";
import { generateNarration } from "@/lib/orchestrator/workers/narrator";
import { checkVisualDelta } from "@/lib/orchestrator/workers/visual-delta";
import { buildMemoryBundle, shouldSummarize, runSummarizer } from "@/lib/memory";

import type { ActionIntent, ConsequenceEffect, NarratorOutput } from "@/lib/schemas/ai-io";
import type { DiceRoll, NarrativeEvent } from "@/lib/schemas/domain";
import type { StatePatch } from "@/lib/schemas/state-patches";
import { performRoll } from "@/server/services/dice-service";
import { applyTurnQuestProgress } from "@/server/services/quest-service";
import { resolveNextActorForNarration } from "@/server/services/turn-service";

export type SessionImageJobPayload = {
  turnId: string;
  narrativeText: string;
  sceneContext: string;
  characterNames: string[];
  imageHint?: {
    subjects?: string[];
    environment?: string;
    mood?: string;
    avoid?: string[];
  };
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
  const secret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;
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

function resolveNpcTarget(
  intent: ActionIntent,
  npcIds: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  if (!npcIds.length) return null;
  const npcTargets = intent.targets?.filter((t) => t.kind === "npc") ?? [];
  const first = npcTargets[0];
  if (!first?.label) return null;
  const label = first.label.toLowerCase();
  return npcIds.find((n) => n.name.toLowerCase() === label) ??
    npcIds.find((n) => label.includes(n.name.toLowerCase())) ??
    null;
}

function isSelfTarget(intent: ActionIntent): boolean {
  return intent.targets?.some(
    (t) => t.kind === "player" && t.label?.toLowerCase() === "self",
  ) ?? false;
}

function isHealContext(intent: ActionIntent, rawInput: string): boolean {
  const ctx = (intent.suggested_roll_context ?? "").toLowerCase();
  const raw = rawInput.toLowerCase();
  return /\b(heal|potion|restore|cure|mend|bandage|first\s+aid|tend)\b/.test(ctx) ||
    /\b(heal|potion|restore|cure|mend|bandage|first\s+aid|tend)\b/.test(raw);
}

function computeFallbackPatches(
  intent: ActionIntent,
  rolls: DiceRoll[],
  actingPlayerId: string,
  rawInput: string,
  npcIds: Array<{ id: string; name: string }> = [],
): StatePatch[] {
  const patches: StatePatch[] = [];
  const roll = rolls[0];
  if (!roll) return patches;

  const type = intent.action_type;
  const selfTarget = isSelfTarget(intent);
  const npcTarget = resolveNpcTarget(intent, npcIds);

  if (type === "attack" || type === "cast_spell") {
    if (selfTarget) {
      switch (roll.result) {
        case "critical_success":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -6 });
          patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "wounded" });
          break;
        case "success":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -4 });
          break;
        case "failure":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
          break;
        case "critical_failure":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -1 });
          break;
      }
    } else {
      switch (roll.result) {
        case "critical_success":
          if (npcTarget) {
            patches.push({ op: "npc_hp", npcId: npcTarget.id, delta: -8, reason: `${type} critical hit` });
          }
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 1 });
          break;
        case "success":
          if (npcTarget) {
            patches.push({ op: "npc_hp", npcId: npcTarget.id, delta: -4, reason: `${type} hit` });
          }
          break;
        case "failure":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
          break;
        case "critical_failure":
          patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -4 });
          patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "staggered" });
          break;
      }
      if (type === "cast_spell") {
        const manaCost = roll.result === "critical_success" ? -1 : -2;
        patches.push({ op: "player_mana", playerId: actingPlayerId, delta: manaCost });
      }
    }
  } else if (type === "heal") {
    switch (roll.result) {
      case "critical_success":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 6 });
        patches.push({ op: "condition_remove", targetId: actingPlayerId, condition: "wounded" });
        patches.push({ op: "player_mana", playerId: actingPlayerId, delta: -1 });
        break;
      case "success":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 3 });
        patches.push({ op: "player_mana", playerId: actingPlayerId, delta: -2 });
        break;
      case "failure":
        patches.push({ op: "player_mana", playerId: actingPlayerId, delta: -1 });
        break;
      case "critical_failure":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
        patches.push({ op: "player_mana", playerId: actingPlayerId, delta: -2 });
        break;
    }
  } else if (type === "defend") {
    switch (roll.result) {
      case "critical_success":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 2 });
        patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "defended" });
        break;
      case "success":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 1 });
        patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "defended" });
        break;
      case "failure":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
        break;
      case "critical_failure":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -4 });
        patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "staggered" });
        break;
    }
  } else if (type === "use_item") {
    if (isHealContext(intent, rawInput)) {
      if (roll.result === "critical_success") {
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 5 });
        patches.push({ op: "condition_remove", targetId: actingPlayerId, condition: "wounded" });
      } else if (roll.result === "success") {
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 3 });
      } else if (roll.result === "failure") {
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 1 });
      } else if (roll.result === "critical_failure") {
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
      }
    } else {
      if (roll.result === "critical_failure") {
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
      }
    }
  } else if (type === "move") {
    if (roll.result === "failure") {
      patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -1 });
    } else if (roll.result === "critical_failure") {
      patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -3 });
      patches.push({ op: "condition_add", targetId: actingPlayerId, condition: "prone" });
    }
  } else if (type === "inspect") {
    if (roll.result === "critical_failure") {
      patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
    }
  } else if (type === "talk") {
    if (roll.result === "critical_failure") {
      patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -1 });
    }
  } else {
    switch (roll.result) {
      case "critical_success":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: 2 });
        break;
      case "failure":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -2 });
        break;
      case "critical_failure":
        patches.push({ op: "player_hp", playerId: actingPlayerId, delta: -3 });
        break;
    }
  }

  return patches;
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

const NPC_DEATH_WORDS = /\b(dies|killed|slain|dead|perishes|falls\s+lifeless|collapses\s+dead)\b/i;
const NPC_FLEE_WORDS = /\b(flees|escapes|runs\s+away|retreats|vanishes|disappears)\b/i;
const NPC_HOSTILE_WORDS = /\b(attacks|hostile|enraged|furious|turns\s+on|threatens)\b/i;
const NPC_FRIENDLY_WORDS = /\b(grateful|friendly|thanks|allies|helps|trusts|softens)\b/i;

async function updateNpcStatesFromNarrative(
  sessionId: string,
  npcIds: Array<{ id: string; name: string }>,
  visibleChanges: string[],
  sceneText: string,
): Promise<void> {
  const combined = [...visibleChanges, sceneText].join(" ");

  for (const npc of npcIds) {
    const namePattern = new RegExp(`\\b${npc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!namePattern.test(combined)) continue;

    const npcMentions = combined;
    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (NPC_DEATH_WORDS.test(npcMentions)) {
      updates.status = "dead";
    } else if (NPC_FLEE_WORDS.test(npcMentions)) {
      updates.status = "fled";
    }

    if (NPC_HOSTILE_WORDS.test(npcMentions)) {
      updates.attitude = "hostile";
    } else if (NPC_FRIENDLY_WORDS.test(npcMentions)) {
      updates.attitude = "friendly";
    }

    if (Object.keys(updates).length > 1) {
      await db
        .update(npcStates)
        .set(updates)
        .where(eq(npcStates.id, npc.id));
    }
  }
}

async function unlockNpcPortraitsFromLatestScene(params: {
  sessionId: string;
  sceneText: string;
  visibleChanges: string[];
}): Promise<void> {
  const [latestScene] = await db
    .select({ id: sceneSnapshots.id, image_url: sceneSnapshots.image_url })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, params.sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);
  if (!latestScene?.image_url) return;

  const portraitUrl = `/api/sessions/${params.sessionId}/scene-image/${latestScene.id}`;
  const textForMatch = `${params.sceneText}\n${params.visibleChanges.join(" ")}`.toLowerCase();

  const npcRows = await db
    .select({
      id: npcStates.id,
      name: npcStates.name,
      visual_profile: npcStates.visual_profile,
    })
    .from(npcStates)
    .where(eq(npcStates.session_id, params.sessionId));

  for (const npc of npcRows) {
    const name = npc.name.trim();
    if (!name || !textForMatch.includes(name.toLowerCase())) continue;

    const rawVp = npc.visual_profile;
    const vp =
      rawVp && typeof rawVp === "object" && !Array.isArray(rawVp)
        ? (rawVp as Record<string, unknown>)
        : {};
    const hasPortrait =
      typeof vp.portrait_url === "string" && vp.portrait_url.trim().length > 0;
    if (hasPortrait) continue;

    await db
      .update(npcStates)
      .set({
        visual_profile: {
          ...vp,
          portrait_url: portraitUrl,
          portrait_status: "ready",
        },
        updated_at: new Date(),
      })
      .where(eq(npcStates.id, npc.id));
  }
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
      consequenceEffects: ConsequenceEffect[];
      shouldEndSession: boolean;
      imageNeeded: boolean;
      imageJobPayload: SessionImageJobPayload | undefined;
    }
  | {
      kind: "human_dm";
      diceRolls: DiceRoll[];
      statePatches: StatePatch[];
      consequenceEffects: ConsequenceEffect[];
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
    provider,
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
    mechanicalClass: ctx.character.mechanicalClass,
    classProfile: ctx.character.classProfile,
    provider,
  });
  const rules = rulesResult.data;

  const d0 = Date.now();
  const diceRolls: DiceRoll[] = [];
  if (rules.rolls.length > 0) {
    for (const roll of rules.rolls) {
      try {
        await broadcastToSession(sessionId, "dice-rolling", {
          roll_context: roll.context,
          dice_type: roll.dice,
          turn_id: turnId,
          round_number: ctx.session.currentRound,
        });
      } catch (err) {
        console.error("[pipeline] dice-rolling broadcast failed:", err);
      }
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
  const fallbackPatches = computeFallbackPatches(intent, diceRolls, playerId, rawInput, ctx.npcIds);

  const actingMember = ctx.partyMembers.find((p) => p.playerId === playerId) ?? {
    playerId,
    name: ctx.character.name,
    hp: ctx.character.hp,
    maxHp: ctx.character.maxHp,
    mana: ctx.character.mana,
    maxMana: ctx.character.maxMana,
    conditions: ctx.character.conditions,
  };

  const consequenceResult = await interpretConsequences({
    sessionId,
    turnId,
    rawInput,
    intent,
    diceRolls,
    actingPlayer: actingMember,
    partyMembers: ctx.partyMembers,
    npcs: ctx.npcDetails,
    sceneContext:
      ctx.currentSceneDescription?.trim() ||
      ctx.recentEvents.slice(-2).join(" ").slice(0, 500) ||
      "",
    fallbackPatches,
    provider,
  });

  const statePatches = consequenceResult.usage.model === "fallback"
    ? fallbackPatches
    : consequenceToPatches(consequenceResult.data);

  const questUpdate = await applyTurnQuestProgress({
    sessionId,
    turnId,
    round: ctx.session.currentRound,
    objectiveFallback:
      ctx.session.adventurePrompt?.trim() ||
      ctx.session.campaignTitle?.trim() ||
      "Complete the mission and survive.",
    actionType: intent.action_type,
    diceRolls,
    actionText: rawInput,
    recentNarrative: ctx.recentEvents[ctx.recentEvents.length - 1],
    provider,
  });
  await logTrace({
    sessionId,
    turnId,
    stepName: "state_delta",
    input: { intent_summary: intent.action_type, ai_consequences: consequenceResult.usage.model !== "fallback" },
    output: {
      patches: statePatches,
      consequence_effects: consequenceResult.data.effects,
      quest_state: questUpdate.state,
    },
    modelUsed: consequenceResult.usage.model,
    tokensIn: consequenceResult.usage.inputTokens,
    tokensOut: consequenceResult.usage.outputTokens,
    latencyMs: Date.now() - s0,
    success: consequenceResult.success,
    errorMessage: consequenceResult.error,
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

  const resolvedNextActor = await resolveNextActorForNarration(sessionId, playerId);

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
      consequenceEffects: consequenceResult.data.effects,
      shouldEndSession: questUpdate.shouldEndSession,
      expectedNextPlayerId: resolvedNextActor.nextPlayerId,
    };
  }

  const expectedNextPlayerId = resolvedNextActor.nextPlayerId;
  const actorName = ctx.character.name;
  const nextActorName = resolvedNextActor.nextPlayerDisplayName;

  const memoryBundle = await buildMemoryBundle("narrator", sessionId);

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
    characterPronouns: ctx.character.pronouns,
    characterTraits: ctx.character.traits,
    characterBackstory: ctx.character.backstory,
    characterAppearance: ctx.character.appearance,
    characterClassIdentity: ctx.character.classIdentitySummary,
    characterMechanicalClass: ctx.character.mechanicalClass,
    characterIdentitySource: ctx.character.classProfile?.source ?? "preset",
    characterVisualTags: ctx.character.classProfile?.visual_tags ?? [],
    nextPlayerName: nextActorName,
    recentNarrative: memoryBundle.recentEventWindow,
    sceneContext,
    partySummary: ctx.allCharacterSummaries.join("; "),
    questContext: ctx.questContext,
    npcContext: ctx.npcContext,
    canonicalState: memoryBundle.canonicalState,
    rollingSummary: memoryBundle.rollingSummary,
    stylePolicy: memoryBundle.stylePolicy,
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

  if (ctx.npcIds.length > 0 && narration.visible_changes.length > 0) {
    try {
      await updateNpcStatesFromNarrative(sessionId, ctx.npcIds, narration.visible_changes, narration.scene_text);
    } catch (err) {
      console.error("[pipeline] NPC state update failed, continuing:", err);
    }
  }
  if (ctx.npcIds.length > 0) {
    try {
      await unlockNpcPortraitsFromLatestScene({
        sessionId,
        sceneText: narration.scene_text,
        visibleChanges: narration.visible_changes,
      });
    } catch (err) {
      console.error("[pipeline] NPC portrait unlock fallback failed, continuing:", err);
    }
  }

  try {
    if (await shouldSummarize(sessionId, ctx.session.currentRound)) {
      await runSummarizer({ sessionId, currentRound: ctx.session.currentRound, provider });
    }
  } catch (err) {
    console.error("[pipeline] summarizer failed, continuing:", err);
  }

  const visualDeltaResult = await checkVisualDelta({
    sessionId,
    turnId,
    narrativeText: narration.scene_text,
    currentSceneDescription: ctx.currentSceneDescription,
  });
  const imageNeeded = visualDeltaResult.data.image_needed;

  await logTrace({
    sessionId,
    turnId,
    stepName: "visual_delta",
    input: { narrative_len: narration.scene_text.length },
    output: { image_needed: imageNeeded, reasons: visualDeltaResult.data.reasons },
    modelUsed: "deterministic",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: visualDeltaResult.latencyMs,
    success: true,
  });

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
      imageHint: narration.image_hint,
    };
  }

  return {
    kind: "ai",
    narrativeEvent: mapNarrativeRow(inserted),
    diceRolls,
    statePatches,
    consequenceEffects: consequenceResult.data.effects,
    shouldEndSession: questUpdate.shouldEndSession,
    imageNeeded,
    imageJobPayload,
  };
}
