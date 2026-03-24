import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  RulesInterpreterOutputSchema,
  type ActionIntent,
  type RulesInterpreterOutput,
} from "@/lib/schemas/ai-io";
import type { CharacterStats } from "@/lib/schemas/domain";

const RULES_SYSTEM = `You are a D&D 5e rules interpreter for Ashveil. Given a player action intent and their stats, determine:
1. Is this action legal? (almost always yes — only block truly impossible actions)
2. What dice rolls are needed? (e.g., attack roll d20, damage roll based on weapon)
3. What's the appropriate difficulty class (DC)?
4. What stat modifier applies?

Roll types (encode meaning in each roll's context field): attack_roll, skill_check, saving_throw, damage, ability_check.
Each roll must use dice one of: d4, d6, d8, d10, d12, d20, plus numeric modifier, advantage_state none|advantage|disadvantage, context string, and optional dc when a DC applies (use dc 1 for pure damage totals if needed).
Always include at least one roll for non-trivial actions.
Respond with valid JSON matching the schema: legal, optional denial_reason, rolls array, optional auto_success.`;

export async function interpretRules(params: {
  sessionId: string;
  turnId: string;
  intent: ActionIntent;
  characterStats: CharacterStats;
  characterClass: string;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<RulesInterpreterOutput>> {
  const userPrompt = JSON.stringify({
    intent: params.intent,
    character_stats: params.characterStats,
    character_class: params.characterClass,
  });

  return runOrchestrationStep({
    stepName: "rules_interpreter",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "light",
    systemPrompt: RULES_SYSTEM,
    userPrompt,
    schema: RulesInterpreterOutputSchema,
    maxTokens: 768,
    temperature: 0.25,
    fallback: () =>
      RulesInterpreterOutputSchema.parse({
        legal: true,
        rolls: [
          {
            dice: "d20",
            modifier: 0,
            advantage_state: "none",
            context: "General skill check",
            dc: 12,
          },
        ],
      }),
  });
}
