import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { ActionIntentSchema, type ActionIntent } from "@/lib/schemas/ai-io";

const INTENT_SYSTEM = `You are a D&D action parser for Ashveil. Parse the player's natural language into a structured action.
Action types: attack, cast_spell, talk, inspect, move, use_item, custom: map custom or unclear utterances to action_type "other" and capture detail in suggested_roll_context.
For attacks: identify target (use "nearest enemy" if unclear).
For spells: identify spell name and target.
For talk: identify NPC target and dialogue intent.
For inspect: identify what is being examined.
Always respond with valid JSON matching the schema.`;

export async function parseIntent(params: {
  sessionId: string;
  turnId: string;
  rawInput: string;
  characterName: string;
  characterClass: string;
  recentEvents: string[];
  provider: AIProvider;
}): Promise<OrchestrationStepResult<ActionIntent>> {
  const lastThree = params.recentEvents.slice(-3);
  const userPrompt = JSON.stringify({
    raw_input: params.rawInput,
    character_name: params.characterName,
    character_class: params.characterClass,
    recent_events: lastThree,
  });

  return runOrchestrationStep({
    stepName: "intent_parser",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "light",
    systemPrompt: INTENT_SYSTEM,
    userPrompt,
    schema: ActionIntentSchema,
    maxTokens: 512,
    temperature: 0.35,
    fallback: () =>
      ActionIntentSchema.parse({
        action_type: "other",
        targets: [],
        skill_or_save: "none",
        requires_roll: true,
        confidence: 0.4,
        suggested_roll_context: params.rawInput.slice(0, 200),
        rephrase_reason: "Parser fallback",
      }),
  });
}
