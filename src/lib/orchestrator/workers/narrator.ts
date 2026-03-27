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

CHARACTER IDENTITY:
- Use "character_pronouns" (he/him, she/her, they/them, etc.) consistently when referring to the character.
- Weave "character_traits" naturally into descriptions where fitting (e.g. a cautious character hesitates, a bold one charges in).
- Reference "character_backstory" for flavor when it naturally ties to the action.
- If "character_appearance" is provided, keep physical/clothing details consistent in narration when relevant.

PARTY & QUEST AWARENESS:
- "party_summary" lists each party member with race, class, HP, and pronouns. Reference party members naturally.
- "quest_progress" shows the campaign objective and how close the party is to completing it. Subtly reflect quest tension — do NOT read numbers aloud.

MEMORY CONTEXT:
- "canonical_state" is the authoritative world state: round, phase, party, NPCs, quest. Use it to stay consistent.
- "rolling_summary" (if present) is a compressed memory of earlier events: key events, active plot hooks, NPC relationships, world changes. Weave relevant details naturally — do NOT dump facts.
- "style_rules" (if present) provides additional narration style guidance specific to this campaign.

RULES:
- 60-140 words STRICTLY
- Narrate the outcome of the player's SPECIFIC action (from "player_action") based on dice results
- Weave in atmosphere: sounds, smells, shadows
- If critical success: make it epic and dramatic
- If critical failure: make it dramatic but not punishing
- Reference the character by name
- End with atmosphere or tension; do NOT name or address the “next” player — the app shows whose turn it is
- Maintain consistency with the scene and recent events
- DO NOT repeat the player's exact words verbatim — rephrase their action cinematically
- Advance the story forward based on what the player did
- Output JSON with these fields:
  - "scene_text": your narration (60-140 words)
  - "visible_changes": array of brief world changes (can be empty [])
  - "tone": mood of the scene (e.g. "tense", "triumphant", "ominous")
  - "next_actor_id": always set to null
  - "image_hint": {"subjects": ["key visual subjects in the scene"], "environment": "environment description", "mood": "visual mood", "avoid": ["things to avoid"]} (scene hints for image generation)`;

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

const NEUTRAL_HANDOFFS = [
  "The circle holds its breath — the table will show who stirs next.",
  "The moment lingers, heavy with possibility.",
  "Quiet settles; someone will break it when they are ready.",
  "The story leans forward, waiting on the next beat.",
];

const CRIT_SUCCESS = [
  (name: string, action: string) =>
    `${name} moves with breathtaking precision. The attempt to ${action} succeeds beyond all expectation — the kind of moment that shifts the air in the room. ${pick(ATMOSPHERE)} For a heartbeat, even the shadows seem impressed. A moment of triumph, pure and undeniable. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `Something extraordinary unfolds. As ${name} reaches to ${action}, fate answers with a resounding yes. Every element aligns — strength, will, and fortune conspire in perfect harmony. ${pick(ATMOSPHERE)} The party watches in awe. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `Brilliance. ${name} attempts to ${action} and the result is nothing short of legendary. The world bends to accommodate the deed. ${pick(ATMOSPHERE)} Tales will be told of this moment. ${pick(NEUTRAL_HANDOFFS)}`,
];

const SUCCESS = [
  (name: string, action: string) =>
    `${name} sets their mind to ${action} — and the effort pays off. The tension eases just a fraction as success settles over the moment. ${pick(ATMOSPHERE)} The party presses on, emboldened. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `With practiced resolve, ${name} manages to ${action}. The world seems to acknowledge the deed — a subtle shift, a flicker of something that might be hope. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `${name} commits fully, and the attempt to ${action} finds its mark. A small victory, but in these dark places, small victories are everything. ${pick(ATMOSPHERE)} The group steadies. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `The dice fall kindly. ${name} reaches to ${action} and the outcome is favorable. A ripple of quiet relief passes through the party. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
];

const FAILURE = [
  (name: string, action: string) =>
    `${name} reaches to ${action}, but the moment betrays them. The air feels heavier, the darkness just a shade deeper. ${pick(ATMOSPHERE)} But the journey is far from over. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `The attempt falters. ${name} tries to ${action}, but something goes wrong — timing, angle, perhaps simple bad luck. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `${name}'s effort to ${action} doesn't find its mark. The darkness offers no sympathy, only the quiet reminder that fortune is fickle. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `Not this time. ${name} attempts to ${action}, but the world resists. The shadows seem to lean in just a little closer. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
];

const CRIT_FAILURE = [
  (name: string, action: string) =>
    `Everything goes wrong at once. ${name} attempts to ${action}, and the result is spectacularly unfortunate — the kind of failure that draws gasps. ${pick(ATMOSPHERE)} The shadows close in tighter. But despair is a luxury the party cannot afford. ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `Fate has a cruel sense of humor. As ${name} tries to ${action}, disaster strikes with almost theatrical timing. The ground shifts, the air sours. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
  (name: string, action: string) =>
    `A terrible moment. ${name}'s attempt to ${action} goes catastrophically wrong. Something breaks, something shifts, and the party collectively holds its breath. ${pick(ATMOSPHERE)} ${pick(NEUTRAL_HANDOFFS)}`,
];

function pickTemplate(
  result: DiceRoll["result"] | undefined,
  name: string,
  action: string,
): string {
  switch (result) {
    case "critical_success":
      return pick(CRIT_SUCCESS)(name, action);
    case "success":
      return pick(SUCCESS)(name, action);
    case "failure":
      return pick(FAILURE)(name, action);
    case "critical_failure":
      return pick(CRIT_FAILURE)(name, action);
    default:
      return pick(SUCCESS)(name, action);
  }
}

export function buildNarratorFallback(
  playerName: string,
  actionSummary: string,
  rollResult: DiceRoll["result"] | undefined,
  nextActorId: string | null,
  sceneContext?: string,
): NarratorOutput {
  void sceneContext;
  const action = describeAction("other", actionSummary);
  const text = pickTemplate(rollResult, playerName, action);

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
  characterPronouns?: string;
  characterTraits?: string[];
  characterBackstory?: string;
  characterAppearance?: string;
  nextPlayerName?: string;
  recentNarrative: string;
  sceneContext: string;
  partySummary?: string;
  questContext?: string | null;
  npcContext?: string | null;
  canonicalState?: string;
  rollingSummary?: string | null;
  stylePolicy?: string;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<NarratorOutput>> {
  const userPrompt = JSON.stringify({
    player_action: params.rawInput,
    intent: params.intent,
    dice_results: params.diceResults,
    character_name: params.characterName,
    character_pronouns: params.characterPronouns ?? "they/them",
    character_traits: params.characterTraits ?? [],
    character_backstory: params.characterBackstory ?? "",
    character_appearance: params.characterAppearance ?? "",
    recent_narrative: params.recentNarrative,
    scene_context: params.sceneContext,
    party_summary: params.partySummary ?? "",
    quest_progress: params.questContext ?? "",
    active_npcs: params.npcContext ?? "",
    canonical_state: params.canonicalState ?? "",
    rolling_summary: params.rollingSummary ?? "",
    style_rules: params.stylePolicy ?? "",
  });

  const rollResult = params.diceResults[0]?.result as DiceRoll["result"] | undefined;

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
        params.rawInput ||
          (params.intent.suggested_roll_context ??
          params.intent.action_type.replace(/_/g, " ")),
        rollResult,
        null,
        params.sceneContext,
      ),
    timeoutMs: 20_000,
  });
}
