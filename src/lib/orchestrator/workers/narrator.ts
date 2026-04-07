import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  NarratorOutputSchema,
  type ActionIntent,
  type NarratorOutput,
} from "@/lib/schemas/ai-io";
import type { DiceRoll } from "@/lib/schemas/domain";

/** Core instructions; prepend `buildFacilitatorRoleLine` via `buildNarratorSystemPrompt`. */
export const NARRATOR_INSTRUCTIONS_CORE = `Generate cinematic narration that continues the story.

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
- If "character_class_identity" is provided, use it as the source-of-truth class/archetype label.
- If "character_identity" is provided, treat it as the canonical identity bundle:
  - "display_class_identity" is the narrative label.
  - "mechanical_class" is the normalized mechanics identity.
  - "source" indicates preset vs custom.
- If "character_visual_tags" are provided, keep those motifs consistent when describing action details.

PARTY & QUEST AWARENESS:
- "party_summary" lists each party member with race, class, HP, and pronouns. Reference party members naturally.
- "quest_progress" shows the campaign objective and how close the party is to completing it. Subtly reflect quest tension — do NOT read numbers aloud.

MEMORY CONTEXT:
- "canonical_state" is the authoritative world state: round, phase, party, NPCs, quest. Use it to stay consistent.
- "rolling_summary" (if present) is a compressed memory of earlier events: key events, active plot hooks, NPC relationships, world changes. Weave relevant details naturally — do NOT dump facts.
- "style_rules" (if present) provides additional narration style guidance specific to this campaign.
- "world_bible_excerpt" (if non-empty) is host-supplied premise or setting write-up—treat as canon for tone and facts unless contradicted by newer narrative.
- "established_situation" (if non-empty) is the last locked-in fiction state from the prior beat: where the party is, travel vs arrival, environment. It OVERRIDES vague impulses to "reset" the scene.

SCENE CONTINUITY (NON-NEGOTIABLE):
- Treat "established_situation" as TRUE until this turn's resolved action and dice clearly change it. Do not contradict it.
- Examples of forbidden jumps: narrating dry land or a mine interior if the anchor still places the party at sea, in open water, or mid-voyage—unless this turn's success clearly completes the crossing or arrival.
- On failure or mixed success, pressure, delay, partial progress, or complication is fine; do not teleport the fiction to a new venue without earned cause.
- "scene_context" is often a static module blurb; when it conflicts with "established_situation" or "recent_narrative", prefer the newer established fiction and recent beats.
- After narrating, set "situation_anchor" to ONE short factual sentence (max ~25 words) stating the truth for the NEXT turn: location, travel state if any, and immediate circumstance. It must match your "scene_text" outcome.

STORY BEAT & PACING (like an author):
- Fill "narrative_beat" every turn — it is how the table’s limited scene art chooses moments that deserve a new “establishing shot.”
- "rhythm": ongoing = same scene stretch (dialogue, small actions); transition = travel, entering a new space, time skip; setpiece = big fight, ritual, storm, reveal; denouement = aftermath, quiet resolution.
- "setting_change": none = same venue; texture = same place but meaningfully different light/weather/damage (usually no new image); new_venue = they are somewhere the camera would re-frame (shore after sea, mine after trail); world_shaking = disaster, realm shift, massive spectacle.
- "warrants_establishing_shot": true only when a director would plausibly cut to a wide new frame — new_venue or world_shaking, or a setpiece that re-places the cast. Keep false for texture-only or ongoing beats so art budget is not wasted.
- Align beat with "situation_anchor": if you claim a new place, setting_change should reflect that.

RULES:
- 60-140 words STRICTLY
- Narrate the outcome of the player's SPECIFIC action (from "player_action") based on dice results
- Weave in atmosphere: sensory detail that fits the scene (sound, light, weather, texture, mood)
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
  - "image_hint": {"subjects": ["key visual subjects in the scene"], "environment": "environment description", "mood": "visual mood", "avoid": ["things to avoid"]} (scene hints for image generation)
  - "situation_anchor": one factual sentence (8-280 chars) — location + immediate truth for the next player, aligned with this beat's outcome
  - "narrative_beat": {"rhythm": "ongoing"|"transition"|"setpiece"|"denouement", "setting_change": "none"|"texture"|"new_venue"|"world_shaking", "warrants_establishing_shot": boolean}
  - "chapter_break_suggested": boolean — almost always false. Set true ONLY when this beat is a credible end-of-chapter moment: a major objective beat just resolved, or the party has fully arrived after a long journey, or an act-scale shift is complete — NOT for routine new_venue, small fights, or mid-arc twists. If unsure, false.`;

export function buildNarratorSystemPrompt(facilitatorRoleLine: string): string {
  return `${facilitatorRoleLine.trim()}\n\n${NARRATOR_INSTRUCTIONS_CORE}`;
}

/** @deprecated Use buildNarratorSystemPrompt(buildFacilitatorRoleLine(...)) for session-aware prompts. */
export const NARRATOR_SYSTEM = buildNarratorSystemPrompt(
  "You are the facilitator for a collaborative tabletop RPG. Genre and tone follow the table's premise.",
);

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
    cast_spell: "unleashes a practiced technique",
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

/** Default when premise does not imply a specific genre. */
const ATMOSPHERE_NEUTRAL = [
  "The moment tightens — every small sound seems louder than it should.",
  "Tension hangs in the air; the table leans in without noticing.",
  "Time does a half-step; outcomes feel sharp and immediate.",
  "A breath is held collectively, then released in uneven pieces.",
  "The fiction settles differently now — something has shifted.",
  "Quiet pressure builds, the kind that precedes a decisive beat.",
  "Stakes sharpen; attention narrows to what happens next.",
  "The scene steadies just enough to make the next choice matter more.",
  "Possibility and risk share the same edge for a heartbeat.",
  "The world of the table feels vivid, immediate, and unforgivingly fair.",
] as const;

const ATMOSPHERE_TECH = [
  "A low hull-hum underscores the moment; panels flicker with standby light.",
  "Sterile LEDs wash the scene in cool white as systems whisper status ticks.",
  "Magnetic locks thunk somewhere distant; recycled air tastes of ozone.",
  "A console chirps — soft, insistent — like the ship is paying attention.",
  "Static hisses through an open channel, then snaps to silence.",
] as const;

const ATMOSPHERE_URBAN = [
  "Distant traffic murmurs through glass; rain tracks slow lines down the pane.",
  "Neon bleed colors the wet pavement in uneven stripes.",
  "An elevator chime punctuates the hush of the corridor.",
  "City grit clings to the moment — sirens far off, never quite arriving.",
  "Fluorescents buzz overhead, honest and unromantic.",
] as const;

const ATMOSPHERE_HORROR = [
  "The air tastes wrong — metallic, too still, like the room is listening.",
  "A sound almost forms in the silence, then thinks better of it.",
  "Shadows pool a little thicker than physics should allow.",
  "Something in the periphery refuses to resolve into a clean shape.",
  "Your skin insists you are watched, even when logic disagrees.",
] as const;

const ATMOSPHERE_FANTASY = [
  "The air thickens with the scent of damp stone and old iron.",
  "Dust motes dance in a shaft of pale light from above.",
  "An ember-glow pulses from somewhere deep ahead, warm and beckoning.",
  "The ground trembles faintly, as if the earth itself draws breath.",
  "Somewhere far off, a bell tolls once and falls silent.",
  "Torches shiver along the passage, greedy for oxygen.",
] as const;

function resolveAtmosphereLines(premiseFingerprint: string): readonly string[] {
  const t = premiseFingerprint.toLowerCase();
  if (
    /\b(sci[-\s]?fi|spaceship|starship|space station|android|cyborg|cyberpunk|neon|orbital|laser|warp|hologram|mech|droid)\b/.test(
      t,
    )
  ) {
    return ATMOSPHERE_TECH;
  }
  if (
    /\b(noir|detective|police|agency|corporate|heist|subway|skyscraper|modern|present[-\s]?day|urban)\b/.test(
      t,
    )
  ) {
    return ATMOSPHERE_URBAN;
  }
  if (
    /\b(horror|eldritch|haunted|cosmic|cult|ghost|undead|dread)\b/.test(t)
  ) {
    return ATMOSPHERE_HORROR;
  }
  if (
    /\b(fantasy|dragon|knight|dungeon|medieval|castle|wizard|arcane|temple|crypt)\b/.test(
      t,
    )
  ) {
    return ATMOSPHERE_FANTASY;
  }
  return ATMOSPHERE_NEUTRAL;
}

function pickAtmosphere(premiseFingerprint: string): string {
  return pick([...resolveAtmosphereLines(premiseFingerprint)]);
}

const NEUTRAL_HANDOFFS = [
  "The circle holds its breath — the table will show who stirs next.",
  "The moment lingers, heavy with possibility.",
  "Quiet settles; someone will break it when they are ready.",
  "The story leans forward, waiting on the next beat.",
];

function buildCritSuccess(atm: string): Array<
  (name: string, action: string) => string
> {
  return [
    (name, action) =>
      `${name} moves with breathtaking precision. The attempt to ${action} succeeds beyond all expectation — the kind of moment that shifts the air in the room. ${atm} For a heartbeat, the table itself seems to lean toward triumph. A moment of triumph, pure and undeniable. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `Something extraordinary unfolds. As ${name} reaches to ${action}, fate answers with a resounding yes. Every element aligns — strength, will, and fortune conspire in perfect harmony. ${atm} The party watches in awe. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `Brilliance. ${name} attempts to ${action} and the result is nothing short of legendary. The world bends to accommodate the deed. ${atm} Tales will be told of this moment. ${pick(NEUTRAL_HANDOFFS)}`,
  ];
}

function buildSuccess(atm: string): Array<(name: string, action: string) => string> {
  return [
    (name, action) =>
      `${name} sets their mind to ${action} — and the effort pays off. The tension eases just a fraction as success settles over the moment. ${atm} The party presses on, emboldened. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `With practiced resolve, ${name} manages to ${action}. The world seems to acknowledge the deed — a subtle shift, a flicker of something that might be hope. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `${name} commits fully, and the attempt to ${action} finds its mark. A small victory, but right now small victories are everything. ${atm} The group steadies. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `The dice fall kindly. ${name} reaches to ${action} and the outcome is favorable. A ripple of quiet relief passes through the party. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
  ];
}

function buildFailure(atm: string): Array<(name: string, action: string) => string> {
  return [
    (name, action) =>
      `${name} reaches to ${action}, but the moment betrays them. The air feels heavier; the cost of failure lands squarely. ${atm} But the journey is far from over. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `The attempt falters. ${name} tries to ${action}, but something goes wrong — timing, angle, perhaps simple bad luck. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `${name}'s effort to ${action} doesn't find its mark. Fortune offers no favors this time — only the quiet reminder that risk is real. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `Not this time. ${name} attempts to ${action}, but the world resists. Consequences press closer, insistent but fair. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
  ];
}

function buildCritFailure(atm: string): Array<
  (name: string, action: string) => string
> {
  return [
    (name, action) =>
      `Everything goes wrong at once. ${name} attempts to ${action}, and the result is spectacularly unfortunate — the kind of failure that draws gasps. ${atm} The situation worsens — but despair is a luxury the party cannot afford. ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `Fate has a cruel sense of humor. As ${name} tries to ${action}, disaster strikes with almost theatrical timing. The ground shifts, the air sours. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
    (name, action) =>
      `A terrible moment. ${name}'s attempt to ${action} goes catastrophically wrong. Something breaks, something shifts, and the party collectively holds its breath. ${atm} ${pick(NEUTRAL_HANDOFFS)}`,
  ];
}

function pickTemplate(
  result: DiceRoll["result"] | undefined,
  name: string,
  action: string,
  premiseFingerprint: string,
): string {
  const atm = pickAtmosphere(premiseFingerprint);
  switch (result) {
    case "critical_success":
      return pick(buildCritSuccess(atm))(name, action);
    case "success":
      return pick(buildSuccess(atm))(name, action);
    case "failure":
      return pick(buildFailure(atm))(name, action);
    case "critical_failure":
      return pick(buildCritFailure(atm))(name, action);
    default:
      return pick(buildSuccess(atm))(name, action);
  }
}

export function buildNarratorFallback(
  playerName: string,
  actionSummary: string,
  rollResult: DiceRoll["result"] | undefined,
  nextActorId: string | null,
  sceneContext: string | undefined,
  /** Tags + premise + world bible (and optionally scene) to flavor atmosphere lines. */
  premiseHint: string | undefined,
  actionType: string,
): NarratorOutput {
  const fingerprint = [premiseHint, sceneContext].filter(Boolean).join(" ").slice(0, 1200);
  const action = describeAction(actionType, actionSummary);
  const text = pickTemplate(rollResult, playerName, action, fingerprint);

  const toneMap: Record<string, string> = {
    critical_success: "triumphant",
    success: "resolute",
    failure: "tense",
    critical_failure: "ominous",
  };

  const sceneText = text.slice(0, 4000);
  const anchorBase = sceneText.replace(/\s+/g, " ").trim().slice(0, 280);
  const situation_anchor =
    anchorBase.length >= 8
      ? anchorBase
      : "The scene continues from the prior moment with no new place established.";

  return NarratorOutputSchema.parse({
    scene_text: sceneText,
    visible_changes: [],
    tone: toneMap[rollResult ?? ""] ?? "neutral",
    next_actor_id: nextActorId,
    image_hint: { subjects: [], avoid: [] },
    situation_anchor,
    narrative_beat: {
      rhythm: "ongoing",
      setting_change: "none",
      warrants_establishing_shot: false,
    },
    chapter_break_suggested: false,
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
  characterClassIdentity?: string;
  characterMechanicalClass?: string;
  characterIdentitySource?: "preset" | "custom";
  characterVisualTags?: string[];
  nextPlayerName?: string;
  recentNarrative: string;
  sceneContext: string;
  partySummary?: string;
  questContext?: string | null;
  npcContext?: string | null;
  canonicalState?: string;
  rollingSummary?: string | null;
  stylePolicy?: string;
  facilitatorSystemPrompt: string;
  /** Long-form premise excerpt for model context (optional). */
  worldBibleExcerpt?: string;
  /** Short bundle for narrator fallback atmosphere (tags + prompt + bible slice). */
  fallbackPremiseHint?: string;
  /** Prior turn's locked situation line; empty when session has no anchor yet. */
  establishedSituation?: string | null;
  /** Campaign betrayal spine for narrator (mode / phase / last outcome_id). */
  betrayalSpine?: string | null;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<NarratorOutput>> {
  const normalizedDisplayClass = (params.characterClassIdentity ?? "").trim();
  const normalizedMechanicalClass = (params.characterMechanicalClass ?? "").trim().toLowerCase();
  const userPrompt = JSON.stringify({
    player_action: params.rawInput,
    intent: params.intent,
    dice_results: params.diceResults,
    character_name: params.characterName,
    character_pronouns: params.characterPronouns ?? "they/them",
    character_traits: params.characterTraits ?? [],
    character_backstory: params.characterBackstory ?? "",
    character_appearance: params.characterAppearance ?? "",
    character_class_identity: normalizedDisplayClass,
    character_identity: {
      display_class_identity: normalizedDisplayClass,
      mechanical_class: normalizedMechanicalClass,
      source: params.characterIdentitySource ?? "preset",
    },
    character_visual_tags: params.characterVisualTags ?? [],
    recent_narrative: params.recentNarrative,
    scene_context: params.sceneContext,
    party_summary: params.partySummary ?? "",
    quest_progress: params.questContext ?? "",
    active_npcs: params.npcContext ?? "",
    canonical_state: params.canonicalState ?? "",
    rolling_summary: params.rollingSummary ?? "",
    style_rules: params.stylePolicy ?? "",
    world_bible_excerpt: params.worldBibleExcerpt ?? "",
    established_situation:
      params.establishedSituation?.trim() ||
      "(none yet — infer only from scene_context, recent_narrative, and canonical_state)",
    betrayal_spine:
      params.betrayalSpine?.trim() ||
      "(none — treat party as loyal unless quest_progress mentions betrayal)",
  });

  const rollResult = params.diceResults[0]?.result as DiceRoll["result"] | undefined;

  return runOrchestrationStep({
    stepName: "narrator",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "heavy",
    systemPrompt: params.facilitatorSystemPrompt,
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
        params.fallbackPremiseHint,
        params.intent.action_type,
      ),
    timeoutMs: 20_000,
  });
}
