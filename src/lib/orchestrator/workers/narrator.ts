import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  NarratorOutputSchema,
  type ActionIntent,
  type NarratorOutput,
} from "@/lib/schemas/ai-io";
import type { DiceRoll } from "@/lib/schemas/domain";

export const NARRATOR_SYSTEM = `You are the Dungeon Master of Ashveil, a dark fantasy tabletop RPG. Generate cinematic narration that continues the story.

CRITICAL — PLAYER ACTION:
The JSON you receive contains a "player_action" field with the EXACT text the player typed.
You MUST incorporate what the player said they want to do into your narration.
Describe the OUTCOME of THEIR SPECIFIC ACTION — do not ignore it or substitute a generic action.
If the player says "I dance with a goblin", narrate them dancing with a goblin.
If the player says "I try to befriend the dragon", narrate them attempting to befriend the dragon.
The dice results determine SUCCESS or FAILURE of their stated action.

RULES:
- 60-140 words STRICTLY
- Narrate the outcome of the player's SPECIFIC action (from "player_action") based on dice results
- Weave in atmosphere: sounds, smells, shadows
- If critical success: make it epic and dramatic
- If critical failure: make it dramatic but not punishing
- Reference the character by name
- End with a brief transition to the next player's turn
- Maintain consistency with the scene and recent events
- DO NOT repeat the player's exact words verbatim — rephrase their action cinematically
- Advance the story forward based on what the player did
- Output JSON with these fields:
  - "scene_text": your narration (60-140 words)
  - "visible_changes": array of brief world changes (can be empty [])
  - "tone": mood of the scene (e.g. "tense", "triumphant", "ominous")
  - "next_actor_id": always set to null
  - "image_hint": {"subjects": [], "avoid": []} (optional scene hints)`;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function cleanAction(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^I\s+/i, "");
  s = s.replace(/^(try|attempt|want) to\s+/i, "");
  s = s.charAt(0).toLowerCase() + s.slice(1);
  if (s.length > 80) s = s.slice(0, 77) + "...";
  return s;
}

function describeAction(actionType: string, rawContext: string): string {
  const cleaned = cleanAction(rawContext);
  const verbMap: Record<string, string> = {
    attack: "strikes out",
    cast_spell: "channels arcane energy",
    move: "pushes forward",
    talk: "speaks",
    inspect: "studies their surroundings",
    use_item: "reaches for an item",
  };
  if (cleaned && cleaned.length > 3) return cleaned;
  return verbMap[actionType] ?? "acts";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
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
  "Somewhere far off, a bell tolls once and falls silent.",
  "The torches flicker as though acknowledging something unseen.",
];

const CRIT_SUCCESS = [
  (name: string, action: string, next: string) =>
    `${name} moves with breathtaking precision. The attempt to ${action} succeeds beyond all expectation — the kind of moment that shifts the air in the room. ${pick(ATMOSPHERE)} For a heartbeat, even the shadows seem impressed. A moment of triumph, pure and undeniable. ${next}, the momentum is yours — seize it.`,
  (name: string, action: string, next: string) =>
    `Something extraordinary unfolds. As ${name} reaches to ${action}, fate answers with a resounding yes. Every element aligns — strength, will, and fortune conspire in perfect harmony. ${pick(ATMOSPHERE)} The party watches in awe. ${next}, you stand in the wake of something remarkable. What will you do?`,
  (name: string, action: string, next: string) =>
    `Brilliance. ${name} attempts to ${action} and the result is nothing short of legendary. The world bends to accommodate the deed. ${pick(ATMOSPHERE)} Tales will be told of this moment. ${next}, fortune rides high — make your move before the tide turns.`,
];

const SUCCESS = [
  (name: string, action: string, next: string) =>
    `${name} sets their mind to ${action} — and the effort pays off. The tension eases just a fraction as success settles over the moment. ${pick(ATMOSPHERE)} The party presses on, emboldened. ${next}, the path ahead awaits your decision.`,
  (name: string, action: string, next: string) =>
    `With practiced resolve, ${name} manages to ${action}. The world seems to acknowledge the deed — a subtle shift, a flicker of something that might be hope. ${pick(ATMOSPHERE)} ${next}, the table turns to you. What stirs in your mind?`,
  (name: string, action: string, next: string) =>
    `${name} commits fully, and the attempt to ${action} finds its mark. A small victory, but in these dark places, small victories are everything. ${pick(ATMOSPHERE)} The group steadies. ${next}, it's your turn to shape what comes next.`,
  (name: string, action: string, next: string) =>
    `The dice fall kindly. ${name} reaches to ${action} and the outcome is favorable. A ripple of quiet relief passes through the party. ${pick(ATMOSPHERE)} ${next}, fortune watches — what will you attempt?`,
];

const FAILURE = [
  (name: string, action: string, next: string) =>
    `${name} reaches to ${action}, but the moment betrays them. The air feels heavier, the darkness just a shade deeper. ${pick(ATMOSPHERE)} But the journey is far from over. ${next}, perhaps fortune favors you. Step forward.`,
  (name: string, action: string, next: string) =>
    `The attempt falters. ${name} tries to ${action}, but something goes wrong — timing, angle, perhaps simple bad luck. ${pick(ATMOSPHERE)} ${next}, the burden shifts to you now. Choose wisely.`,
  (name: string, action: string, next: string) =>
    `${name}'s effort to ${action} doesn't find its mark. The darkness offers no sympathy, only the quiet reminder that fortune is fickle. ${pick(ATMOSPHERE)} ${next}, your move — the party needs a win.`,
  (name: string, action: string, next: string) =>
    `Not this time. ${name} attempts to ${action}, but the world resists. The shadows seem to lean in just a little closer. ${pick(ATMOSPHERE)} ${next}, the party looks to you. What do you do?`,
];

const CRIT_FAILURE = [
  (name: string, action: string, next: string) =>
    `Everything goes wrong at once. ${name} attempts to ${action}, and the result is spectacularly unfortunate — the kind of failure that draws gasps. ${pick(ATMOSPHERE)} The shadows close in tighter. But despair is a luxury the party cannot afford. ${next}, rally — the tale is not yet written.`,
  (name: string, action: string, next: string) =>
    `Fate has a cruel sense of humor. As ${name} tries to ${action}, disaster strikes with almost theatrical timing. The ground shifts, the air sours. ${pick(ATMOSPHERE)} ${next}, the party needs you now more than ever. What do you do?`,
  (name: string, action: string, next: string) =>
    `A terrible moment. ${name}'s attempt to ${action} goes catastrophically wrong. Something breaks, something shifts, and the party collectively holds its breath. ${pick(ATMOSPHERE)} ${next}, there's no time to dwell — act now, before things get worse.`,
];

function pickTemplate(
  result: DiceRoll["result"] | undefined,
  name: string,
  action: string,
  next: string,
): string {
  switch (result) {
    case "critical_success":
      return pick(CRIT_SUCCESS)(name, action, next);
    case "success":
      return pick(SUCCESS)(name, action, next);
    case "failure":
      return pick(FAILURE)(name, action, next);
    case "critical_failure":
      return pick(CRIT_FAILURE)(name, action, next);
    default:
      return pick(SUCCESS)(name, action, next);
  }
}

export function buildNarratorFallback(
  playerName: string,
  actionSummary: string,
  rollResult: DiceRoll["result"] | undefined,
  nextPlayerName: string,
  nextActorId: string | null,
  _sceneContext?: string,
): NarratorOutput {
  const action = describeAction("other", actionSummary);
  const text = pickTemplate(rollResult, playerName, action, nextPlayerName);

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
  rawInput: string;
  intent: ActionIntent;
  diceResults: Array<{ context: string; total: number; result: string }>;
  characterName: string;
  nextPlayerName: string;
  recentNarrative: string;
  sceneContext: string;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<NarratorOutput>> {
  const userPrompt = JSON.stringify({
    player_action: params.rawInput,
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
    timeoutMs: 20_000,
  });
}
