import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  NarratorOutputSchema,
  type ActionIntent,
  type NarratorOutput,
} from "@/lib/schemas/ai-io";
import type { DiceRoll } from "@/lib/schemas/domain";

export const NARRATOR_SYSTEM = `You are the Dungeon Master of Ashveil, a dark fantasy tabletop RPG. Generate cinematic narration.

RULES:
- 60-140 words STRICTLY
- Describe the outcome of the player's action based on dice results
- Weave in atmosphere: sounds, smells, shadows
- If critical success: make it epic and dramatic
- If critical failure: make it dramatic but not punishing
- Reference the character by name
- End with a brief transition to the next player's turn
- Maintain consistency with the scene and recent events
- Output JSON matching the provided schema`;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function outcomeFromRoll(roll: DiceRoll | undefined): string {
  if (!roll) return "The outcome hangs in the balance.";
  if (roll.result === "critical_success")
    return "Fortune delivers a shining success.";
  if (roll.result === "success") return "The attempt succeeds.";
  if (roll.result === "failure") return "The attempt falls short.";
  if (roll.result === "critical_failure")
    return "Fortune turns sharply against the actor.";
  return "The table reads the moment in silence.";
}

export function buildNarratorFallback(
  playerName: string,
  actionSummary: string,
  outcomeSentence: string,
  nextPlayerName: string,
  nextActorId: string | null,
): NarratorOutput {
  const opener = `${playerName} attempts ${actionSummary}. ${outcomeSentence} ${nextPlayerName}, your turn.`;
  const atmosphere =
    "Cold air threads the stone; distant water ticks against silence. Torchlight shivers along mail and knuckles, painting slow shadows that seem to listen. The weight of the moment settles, peaty and metallic, until the table's focus slides toward what must happen next.";
  let scene_text = `${opener} ${atmosphere}`;
  if (wordCount(scene_text) < 60) {
    scene_text = `${scene_text} A draft hums through the passageway, carrying ash and old rain; boots scrape softly as everyone waits on the turning of the tale.`;
  }
  if (wordCount(scene_text) > 140) {
    scene_text = scene_text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 140)
      .join(" ");
  }
  return NarratorOutputSchema.parse({
    scene_text: scene_text.slice(0, 4000),
    visible_changes: [],
    tone: "neutral",
    next_actor_id: nextActorId,
    image_hint: { subjects: [], avoid: [] },
  });
}

export async function generateNarration(params: {
  sessionId: string;
  turnId: string;
  intent: ActionIntent;
  diceResults: Array<{ context: string; total: number; result: string }>;
  characterName: string;
  nextPlayerName: string;
  recentNarrative: string;
  sceneContext: string;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<NarratorOutput>> {
  const userPrompt = JSON.stringify({
    intent: params.intent,
    dice_results: params.diceResults,
    character_name: params.characterName,
    next_player_name: params.nextPlayerName,
    recent_narrative: params.recentNarrative,
    scene_context: params.sceneContext,
  });

  return runOrchestrationStep({
    stepName: "narrator",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "heavy",
    systemPrompt: NARRATOR_SYSTEM,
    userPrompt,
    schema: NarratorOutputSchema,
    maxTokens: 900,
    temperature: 0.75,
    fallback: () =>
      buildNarratorFallback(
        params.characterName,
        params.intent.suggested_roll_context ??
          params.intent.action_type.replace(/_/g, " "),
        outcomeFromRoll(undefined),
        params.nextPlayerName,
        null,
      ),
  });
}
