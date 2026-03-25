import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/ai";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { ActionIntentSchema, type ActionIntent } from "@/lib/schemas/ai-io";

const ATTACK_PATTERNS = /\b(attack|hit|strike|slash|stab|punch|kick|shoot|smash|fight|swing|cleave|smite)\b/i;
const SPELL_PATTERNS = /\b(cast|spell|fireball|magic|conjure|summon|enchant|invoke|lightning|thunder|eldritch|cantrip)\b/i;
const HEAL_PATTERNS = /\b(heal|mend|cure|restore|bandage|patch\s?up|lay\s+on\s+hands|prayer)\b/i;
const DEFEND_PATTERNS = /\b(defend|block|parry|shield|brace|guard|protect|dodge|deflect)\b/i;
const MOVE_PATTERNS = /\b(move|go|walk|run|sneak|climb|jump|swim|fly|dash|hide|stealth|flee|retreat|enter|leave|approach)\b/i;
const TALK_PATTERNS = /\b(talk|speak|say|ask|tell|persuade|intimidate|deceive|negotiate|greet|convince|bribe|charm)\b/i;
const INSPECT_PATTERNS = /\b(look|inspect|examine|search|investigate|check|observe|scan|sense|detect|read|study|what'?s?\s+around)\b/i;
const ITEM_PATTERNS = /\b(use|drink|eat|equip|wield|open|pick\s?up|grab|take|light|torch|potion|scroll|key)\b/i;

function classifyActionHeuristic(raw: string): ActionIntent["action_type"] {
  if (ATTACK_PATTERNS.test(raw)) return "attack";
  if (SPELL_PATTERNS.test(raw)) return "cast_spell";
  if (HEAL_PATTERNS.test(raw)) return "heal";
  if (DEFEND_PATTERNS.test(raw)) return "defend";
  if (TALK_PATTERNS.test(raw)) return "talk";
  if (INSPECT_PATTERNS.test(raw)) return "inspect";
  if (ITEM_PATTERNS.test(raw)) return "use_item";
  if (MOVE_PATTERNS.test(raw)) return "move";
  return "other";
}

function guessStat(actionType: ActionIntent["action_type"], raw: string): ActionIntent["skill_or_save"] {
  if (/\b(persuade|charm|deceive|bribe|intimidate)\b/i.test(raw)) return "cha";
  if (/\b(sneak|stealth|dodge|hide|acrobat)\b/i.test(raw)) return "dex";
  if (/\b(investigate|study|recall|read|knowledge)\b/i.test(raw)) return "int";
  if (/\b(perceive|sense|insight|detect|observe|search|look|inspect)\b/i.test(raw)) return "wis";
  if (/\b(lift|push|break|force|grapple|shove)\b/i.test(raw)) return "str";
  switch (actionType) {
    case "attack": return "str";
    case "cast_spell": return "int";
    case "heal": return "wis";
    case "defend": return "con";
    case "talk": return "cha";
    case "inspect": return "wis";
    case "move": return "dex";
    default: return "none";
  }
}

function buildHeuristicFallback(raw: string): ActionIntent {
  const actionType = classifyActionHeuristic(raw);
  const skill = guessStat(actionType, raw);
  const needsRoll = actionType !== "talk";

  return ActionIntentSchema.parse({
    action_type: actionType,
    targets: [],
    skill_or_save: skill,
    requires_roll: needsRoll,
    confidence: 0.6,
    suggested_roll_context: raw.slice(0, 200),
  });
}

const INTENT_SYSTEM = `You are the intent parser for Ashveil, a dark fantasy tabletop RPG. Given a player's raw action text, classify it into a structured intent.

Output JSON with these fields:
- "action_type": one of "attack", "cast_spell", "move", "talk", "inspect", "use_item", "defend", "heal", "other"
- "targets": array of { "kind": "npc"|"player"|"environment", "label": "target name" } (empty if no target)
- "skill_or_save": the ability most relevant: "str", "dex", "con", "int", "wis", "cha", "none"
- "requires_roll": boolean — true unless the action is purely social/narrative with no uncertainty
- "suggested_roll_context": short description of what the roll represents (e.g. "Attack roll against the goblin")
- "confidence": number 0-1 indicating how certain you are of this classification
- "rephrase_reason": only if confidence < 0.5, explain what was unclear

Classification guidelines:
- "attack" = physical weapon strikes, ranged attacks
- "cast_spell" = magical abilities, cantrips, spells
- "heal" = restoring HP, mending wounds, curative magic
- "defend" = bracing, blocking, shielding, parrying
- "move" = locomotion, sneaking, climbing, fleeing
- "talk" = social interaction, persuasion, intimidation
- "inspect" = observation, investigation, perception
- "use_item" = consuming potions, using scrolls, equipment manipulation
- "other" = anything that doesn't fit above`;

const LOW_CONFIDENCE_THRESHOLD = 0.5;

export async function parseIntent(params: {
  sessionId: string;
  turnId: string;
  rawInput: string;
  characterName: string;
  characterClass: string;
  recentEvents: string[];
  provider?: AIProvider;
}): Promise<OrchestrationStepResult<ActionIntent>> {
  const raw = params.rawInput.trim();
  const provider = params.provider ?? getAIProvider();

  const userPrompt = JSON.stringify({
    player_action: raw,
    character_name: params.characterName,
    character_class: params.characterClass,
    recent_context: params.recentEvents.slice(-2).join("\n").slice(0, 1500),
  });

  const result = await runOrchestrationStep({
    stepName: "intent_parser",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider,
    model: "light",
    systemPrompt: INTENT_SYSTEM,
    userPrompt,
    schema: ActionIntentSchema,
    maxTokens: 300,
    temperature: 0.2,
    fallback: () => buildHeuristicFallback(raw),
    timeoutMs: 10_000,
  });

  if (result.data.confidence < LOW_CONFIDENCE_THRESHOLD && !result.data.rephrase_reason) {
    result.data.rephrase_reason = "Low confidence classification — consider rephrasing";
  }

  return result;
}
