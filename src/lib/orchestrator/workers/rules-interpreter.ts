import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/ai";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  RulesInterpreterOutputSchema,
  type ActionIntent,
  type RulesInterpreterOutput,
} from "@/lib/schemas/ai-io";
import type { CharacterStats, ClassProfile } from "@/lib/schemas/domain";

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
    case "heal": return "Healing check";
    case "defend": return "Defense check";
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
    case "heal": return 10;
    case "defend": return 10;
    case "inspect": return 10;
    case "talk": return 11;
    case "move": return 10;
    case "use_item": return 10;
    default: return 12;
  }
}

function normalizeLabel(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildDeterministicFallback(
  intent: ActionIntent,
  characterStats: CharacterStats,
): RulesInterpreterOutput {
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

  return RulesInterpreterOutputSchema.parse({
    legal: true,
    rolls,
    auto_success: autoSuccess,
  });
}

const RULES_SYSTEM = `You are the rules interpreter for Ashveil, a dark fantasy tabletop RPG. Given a parsed action intent and character stats, determine the mechanical resolution.

Output JSON:
- "legal": boolean — whether the action is mechanically possible
- "denial_reason": string (only if legal=false, explain why)
- "rolls": array of required dice rolls, each with:
  - "dice": "d4"|"d6"|"d8"|"d10"|"d12"|"d20"
  - "modifier": integer ability modifier
  - "advantage_state": "none"|"advantage"|"disadvantage"
  - "context": what this roll represents
  - "dc": difficulty class (number)
- "auto_success": boolean — true only if the action succeeds without a roll (e.g. simple speech)

Rules:
- Most actions require a d20 roll + ability modifier
- attack/cast_spell: DC 10-15 depending on described difficulty
- heal: typically DC 10, uses WIS modifier
- defend: typically DC 10, uses CON modifier
- move/sneak: DEX-based, DC varies by terrain described
- talk: CHA-based, can be auto_success for simple greetings; DC 11-14 for persuasion
- inspect: WIS-based, DC 10-13
- Grant advantage if the action description mentions favorable conditions
- Grant disadvantage if conditions are clearly against the player
- Set legal=false if action is physically impossible given context`;

export async function interpretRules(params: {
  sessionId: string;
  turnId: string;
  intent: ActionIntent;
  characterStats: CharacterStats;
  characterClass: string;
  mechanicalClass?: string;
  classProfile?: ClassProfile | null;
  provider?: AIProvider;
}): Promise<OrchestrationStepResult<RulesInterpreterOutput>> {
  const { intent, characterStats } = params;
  const provider = params.provider ?? getAIProvider();
  const displayClass = normalizeLabel(params.characterClass);
  const mechanicalClass = normalizeLabel(params.mechanicalClass ?? params.characterClass);

  const userPrompt = JSON.stringify({
    action_type: intent.action_type,
    targets: intent.targets,
    skill_or_save: intent.skill_or_save,
    requires_roll: intent.requires_roll,
    suggested_roll_context: intent.suggested_roll_context,
    character_class: displayClass,
    mechanical_class: mechanicalClass,
    character_identity: {
      display_class: displayClass,
      mechanical_class: mechanicalClass,
      source: params.classProfile?.source ?? "preset",
      display_name: params.classProfile?.display_name ?? displayClass,
      combat_role: params.classProfile?.combat_role ?? null,
      resource_model: params.classProfile?.resource_model ?? null,
    },
    class_profile_summary: params.classProfile
      ? {
          display_name: params.classProfile.display_name,
          combat_role: params.classProfile.combat_role,
          resource_model: params.classProfile.resource_model,
          abilities: params.classProfile.abilities.map((a) => ({
            name: a.name,
            effect_kind: a.effect_kind,
            resource_cost: a.resource_cost,
            cooldown: a.cooldown,
          })),
          starting_gear: params.classProfile.starting_gear.map((g) => ({
            name: g.name,
            type: g.type,
          })),
        }
      : null,
    stats: characterStats,
  });

  return runOrchestrationStep({
    stepName: "rules_interpreter",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider,
    model: "light",
    systemPrompt: RULES_SYSTEM,
    userPrompt,
    schema: RulesInterpreterOutputSchema,
    maxTokens: 300,
    temperature: 0.1,
    fallback: () => buildDeterministicFallback(intent, characterStats),
    timeoutMs: 10_000,
  });
}
