import type { OrchestrationStepResult } from "@/lib/ai/types";
import {
  RulesInterpreterOutputSchema,
  type ActionIntent,
  type RulesInterpreterOutput,
} from "@/lib/schemas/ai-io";
import type { CharacterStats } from "@/lib/schemas/domain";

type StatBlock = CharacterStats;

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function getModifier(stat: ActionIntent["skill_or_save"], stats: StatBlock): number {
  switch (stat) {
    case "str": return abilityMod(stats.str ?? 10);
    case "dex": return abilityMod(stats.dex ?? 10);
    case "con": return abilityMod(stats.con ?? 10);
    case "int": return abilityMod(stats.int ?? 10);
    case "wis": return abilityMod(stats.wis ?? 10);
    case "cha": return abilityMod(stats.cha ?? 10);
    default: return 0;
  }
}

function contextLabel(intent: ActionIntent): string {
  switch (intent.action_type) {
    case "attack": return "Attack roll";
    case "cast_spell": return "Spell attack";
    case "move": return "Agility check";
    case "talk": return "Persuasion check";
    case "inspect": return "Perception check";
    case "use_item": return "Skill check";
    default: return intent.suggested_roll_context ?? "Ability check";
  }
}

function dcForAction(intent: ActionIntent): number {
  switch (intent.action_type) {
    case "attack": return 12;
    case "cast_spell": return 13;
    case "inspect": return 10;
    case "talk": return 11;
    case "move": return 10;
    case "use_item": return 10;
    default: return 12;
  }
}

export async function interpretRules(params: {
  sessionId: string;
  turnId: string;
  intent: ActionIntent;
  characterStats: CharacterStats;
  characterClass: string;
}): Promise<OrchestrationStepResult<RulesInterpreterOutput>> {
  const t0 = Date.now();
  const { intent, characterStats } = params;

  const modifier = getModifier(intent.skill_or_save, characterStats);
  const dc = dcForAction(intent);
  const autoSuccess = intent.action_type === "talk" && !intent.requires_roll;

  const rolls = autoSuccess
    ? []
    : [
        {
          dice: "d20" as const,
          modifier,
          advantage_state: "none" as const,
          context: contextLabel(intent),
          dc,
        },
      ];

  const data = RulesInterpreterOutputSchema.parse({
    legal: true,
    rolls,
    auto_success: autoSuccess,
  });

  return {
    data,
    usage: { inputTokens: 0, outputTokens: 0, model: "deterministic" },
    latencyMs: Date.now() - t0,
    success: true,
  };
}
