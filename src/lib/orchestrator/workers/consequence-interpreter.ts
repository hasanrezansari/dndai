import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/ai";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  ConsequenceOutputSchema,
  type ActionIntent,
  type ConsequenceOutput,
} from "@/lib/schemas/ai-io";
import type { DiceRoll } from "@/lib/schemas/domain";
import type { StatePatch } from "@/lib/schemas/state-patches";

interface PartyMember {
  playerId: string;
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  conditions: string[];
}

interface NpcInfo {
  id: string;
  name: string;
  status: string;
  attitude: string;
}

const CONSEQUENCE_SYSTEM = `You are the consequence engine for a collaborative tabletop RPG. Given a player's action, the dice results, and current game state, determine the EXACT mechanical consequences.

You output JSON with:
- "effects": array of stat changes for affected characters
  - "target_type": "player" or "npc"
  - "target_id": the UUID of the affected character
  - "hp_delta": integer HP change (negative = damage, positive = healing). Typical damage: 1-6 for minor, 4-8 for moderate, 6-12 for major hits. Healing: 2-6 for potions/spells.
  - "mana_delta": integer mana change (negative = spent, positive = restored). Spells cost 1-3 mana.
  - "conditions_add": conditions to add (e.g. "wounded", "poisoned", "stunned", "prone", "defended", "inspired")
  - "conditions_remove": conditions to remove
  - "reasoning": one sentence explaining why
- "phase_change": null or new phase ("combat", "exploration", "social", "rest") if the action changes the situation
- "narrative_hint": brief note about the mechanical outcome for the narrator

RULES:
- Critical success (nat 20): always reward the player, big positive effect
- Success: modest positive outcome, minor or no self-damage
- Failure: the action goes wrong — player often takes 1-3 damage from retaliation/mishap
- Critical failure (nat 1): severe negative consequences — 3-6 damage, possible bad condition
- Healing spells/potions on success: restore 2-5 HP
- Attack successes against NPCs: deal 3-6 damage to the NPC
- Self-harm actions: if a player deliberately hurts themselves, deal 2-6 damage based on roll
- Spellcasting costs mana (1-3 per cast, regardless of success)
- If no enemies are present and the action is peaceful, minimal or no damage
- Consider the narrative context — if wolves are attacking, failed actions mean wolf bites (2-4 damage)
- ALWAYS include at least one effect for the acting player (even if hp_delta is 0)`;

function buildFallbackFromPatches(
  patches: StatePatch[],
): ConsequenceOutput {
  return ConsequenceOutputSchema.parse({
    effects: patches
      .filter((p) => p.op === "player_hp" || p.op === "player_mana")
      .map((p) => ({
        target_type: "player",
        target_id: p.op === "player_hp" ? p.playerId : p.op === "player_mana" ? p.playerId : "",
        hp_delta: p.op === "player_hp" ? p.delta : 0,
        mana_delta: p.op === "player_mana" ? p.delta : 0,
        conditions_add: [],
        conditions_remove: [],
        reasoning: "deterministic fallback",
      })),
    phase_change: null,
    narrative_hint: "",
  });
}

export function consequenceToPatches(
  output: ConsequenceOutput,
): StatePatch[] {
  const patches: StatePatch[] = [];

  for (const effect of output.effects) {
    if (effect.target_type === "player") {
      if (effect.hp_delta !== 0) {
        patches.push({
          op: "player_hp",
          playerId: effect.target_id,
          delta: effect.hp_delta,
        });
      }
      if (effect.mana_delta !== 0) {
        patches.push({
          op: "player_mana",
          playerId: effect.target_id,
          delta: effect.mana_delta,
        });
      }
      for (const cond of effect.conditions_add) {
        patches.push({
          op: "condition_add",
          targetId: effect.target_id,
          condition: cond,
        });
      }
      for (const cond of effect.conditions_remove) {
        patches.push({
          op: "condition_remove",
          targetId: effect.target_id,
          condition: cond,
        });
      }
    } else if (effect.target_type === "npc") {
      if (effect.hp_delta !== 0) {
        patches.push({
          op: "npc_hp",
          npcId: effect.target_id,
          delta: effect.hp_delta,
          reason: effect.reasoning,
        });
      }
    }
  }

  if (output.phase_change) {
    patches.push({
      op: "phase_set",
      phase: output.phase_change,
    });
  }

  return patches;
}

export async function interpretConsequences(params: {
  sessionId: string;
  turnId: string;
  rawInput: string;
  intent: ActionIntent;
  diceRolls: DiceRoll[];
  actingPlayer: PartyMember;
  partyMembers: PartyMember[];
  npcs: NpcInfo[];
  sceneContext: string;
  fallbackPatches: StatePatch[];
  provider?: AIProvider;
}): Promise<OrchestrationStepResult<ConsequenceOutput>> {
  const provider = params.provider ?? getAIProvider();

  const userPrompt = JSON.stringify({
    player_action: params.rawInput,
    acting_player: {
      id: params.actingPlayer.playerId,
      name: params.actingPlayer.name,
      hp: params.actingPlayer.hp,
      max_hp: params.actingPlayer.maxHp,
      mana: params.actingPlayer.mana,
      max_mana: params.actingPlayer.maxMana,
      conditions: params.actingPlayer.conditions,
    },
    intent: {
      action_type: params.intent.action_type,
      targets: params.intent.targets,
      skill_or_save: params.intent.skill_or_save,
    },
    dice_results: params.diceRolls.map((r) => ({
      type: r.roll_type,
      roll_value: r.roll_value,
      modifier: r.modifier,
      total: r.total,
      result: r.result,
      context: r.context,
    })),
    party: params.partyMembers.map((p) => ({
      id: p.playerId,
      name: p.name,
      hp: p.hp,
      max_hp: p.maxHp,
    })),
    npcs: params.npcs.map((n) => ({
      id: n.id,
      name: n.name,
      status: n.status,
      attitude: n.attitude,
    })),
    scene_context: params.sceneContext.slice(0, 500),
  });

  return runOrchestrationStep({
    stepName: "consequence_interpreter",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider,
    model: "light",
    systemPrompt: CONSEQUENCE_SYSTEM,
    userPrompt,
    schema: ConsequenceOutputSchema,
    maxTokens: 500,
    temperature: 0.2,
    fallback: () => buildFallbackFromPatches(params.fallbackPatches),
    timeoutMs: 15_000,
  });
}
