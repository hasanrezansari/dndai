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

export function outcomeFromRoll(
  roll: { result: DiceRoll["result"] } | undefined,
): string {
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
  const outcomes = {
    success: [
      `${playerName}'s effort pays off — ${actionSummary}. The air shifts as the moment settles. ${nextPlayerName} steps forward, ready.`,
      `With determination, ${playerName} ${actionSummary}. A brief silence follows the success. ${nextPlayerName}, the table turns to you.`,
    ],
    failure: [
      `${playerName} tries to ${actionSummary}, but the moment slips away. The shadows seem to deepen. ${nextPlayerName}, it falls to you now.`,
      `Despite ${playerName}'s effort, ${actionSummary} doesn't go as planned. A tense pause. ${nextPlayerName}, your move.`,
    ],
  };
  const isSuccess = outcomeSentence.toLowerCase().includes("success");
  const pool = isSuccess ? outcomes.success : outcomes.failure;
  const base = pool[Math.floor(Math.random() * pool.length)]!;
  let scene_text = base;
  if (wordCount(scene_text) < 60) {
    scene_text +=
      " Torchlight flickers against weathered stone. The passage ahead holds its breath, ancient and watchful, as the party gathers resolve for what comes next.";
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
        outcomeFromRoll(
          params.diceResults[0]
            ? { result: params.diceResults[0].result as DiceRoll["result"] }
            : undefined,
        ),
        params.nextPlayerName,
        null,
      ),
    timeoutMs: 60_000,
  });
}
