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

const ATMOSPHERE = [
  "The air thickens with the scent of damp stone and old iron.",
  "Shadows twist along the walls, alive with whispered secrets.",
  "A cold draft carries the faint echo of something moving in the dark.",
  "Dust motes dance in a shaft of pale light from above.",
  "The silence stretches, broken only by the distant drip of water.",
  "An ember-glow pulses from somewhere deep ahead, warm and beckoning.",
  "The ground trembles faintly, as if the earth itself draws breath.",
  "Cobwebs glisten like silver threads in the half-light.",
];

const CRIT_SUCCESS_TEMPLATES = [
  (name: string, action: string, next: string) =>
    `${name} moves with breathtaking precision — ${action}. The result is nothing short of magnificent. The air itself seems to hum with approval, and for a heartbeat the shadows pull back as if in reverence. ${pick(ATMOSPHERE)} A moment of triumph, pure and undeniable. ${next}, the momentum is yours — seize it.`,
  (name: string, action: string, next: string) =>
    `Something extraordinary happens. As ${name} attempts to ${action}, fate intervenes with perfect timing. Every element aligns — strength, will, and fortune conspire to deliver a result that will be spoken of around campfires for years. ${pick(ATMOSPHERE)} ${next}, you stand in the wake of something remarkable. What will you do?`,
];

const SUCCESS_TEMPLATES = [
  (name: string, action: string, next: string, scene: string) =>
    `${name} ${action} with steady resolve, and the effort pays off. ${scene ? `Within ${scene}, the` : "The"} tension eases just a fraction as success settles over the moment. ${pick(ATMOSPHERE)} The party presses on, emboldened. ${next}, the path ahead awaits your decision.`,
  (name: string, action: string, next: string, scene: string) =>
    `With practiced confidence, ${name} ${action}. ${scene ? `The ${scene} seems` : "The world seems"} to acknowledge the deed — a subtle shift in the air, a flicker of something that might be hope. ${pick(ATMOSPHERE)} ${next}, the table turns to you. What stirs in your mind?`,
  (name: string, action: string, next: string) =>
    `${name} commits to the action — ${action} — and the result is favorable. A small victory, but in these dark places, small victories are everything. ${pick(ATMOSPHERE)} The group steadies. ${next}, it's your turn to shape what comes next.`,
];

const FAILURE_TEMPLATES = [
  (name: string, action: string, next: string, scene: string) =>
    `${name} reaches for ${action}, but the moment betrays them. ${scene ? `In the depths of ${scene}, failure` : "Failure"} has a weight all its own — heavy, lingering. ${pick(ATMOSPHERE)} But the journey is far from over. ${next}, perhaps fortune favors you. Step forward.`,
  (name: string, action: string, next: string) =>
    `The attempt falters. ${name} tries to ${action}, but something goes wrong — timing, angle, perhaps simple bad luck. The shadows seem to lean in, watching with cold patience. ${pick(ATMOSPHERE)} ${next}, the burden shifts to you now. Choose wisely.`,
  (name: string, action: string, next: string, scene: string) =>
    `${name}'s effort to ${action} doesn't find its mark. ${scene ? `The ${scene} offers` : "The darkness offers"} no sympathy, only the quiet reminder that not every swing lands, not every word persuades. ${pick(ATMOSPHERE)} Dust settles. ${next}, your move.`,
];

const CRIT_FAILURE_TEMPLATES = [
  (name: string, action: string, next: string) =>
    `Everything goes wrong at once. ${name} attempts to ${action}, and the result is spectacularly unfortunate — the kind of failure that draws gasps, not laughter. ${pick(ATMOSPHERE)} The shadows close in just a little tighter. But despair is a luxury the party cannot afford. ${next}, rally — the tale is not yet written.`,
  (name: string, action: string, next: string) =>
    `Fate has a cruel sense of humor. As ${name} ${action}, disaster strikes with almost theatrical timing. The ground shifts, the air sours, and for one terrible moment everything hangs by a thread. ${pick(ATMOSPHERE)} ${next}, the party needs you now more than ever. What do you do?`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickTemplate(
  result: DiceRoll["result"] | undefined,
  name: string,
  action: string,
  next: string,
  scene: string,
): string {
  switch (result) {
    case "critical_success":
      return pick(CRIT_SUCCESS_TEMPLATES)(name, action, next);
    case "success":
      return pick(SUCCESS_TEMPLATES)(name, action, next, scene);
    case "failure":
      return pick(FAILURE_TEMPLATES)(name, action, next, scene);
    case "critical_failure":
      return pick(CRIT_FAILURE_TEMPLATES)(name, action, next);
    default:
      return pick(SUCCESS_TEMPLATES)(name, action, next, scene);
  }
}

export function buildNarratorFallback(
  playerName: string,
  actionSummary: string,
  rollResult: DiceRoll["result"] | undefined,
  nextPlayerName: string,
  nextActorId: string | null,
  sceneContext?: string,
): NarratorOutput {
  const scene = sceneContext?.slice(0, 60) || "";
  const text = pickTemplate(rollResult, playerName, actionSummary, nextPlayerName, scene);

  const toneMap: Record<string, string> = {
    critical_success: "triumphant",
    success: "resolute",
    failure: "tense",
    critical_failure: "ominous",
  };

  return NarratorOutputSchema.parse({
    scene_text: text.slice(0, 4000),
    visible_changes: [],
    tone: toneMap[rollResult ?? ""] ?? "neutral",
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

  const rollResult = params.diceResults[0]?.result as DiceRoll["result"] | undefined;

  return runOrchestrationStep({
    stepName: "narrator",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "light",
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
        rollResult,
        params.nextPlayerName,
        null,
        params.sceneContext,
      ),
    timeoutMs: 15_000,
  });
}
