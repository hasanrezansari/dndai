import type { OrchestrationStepResult } from "@/lib/ai/types";
import { ActionIntentSchema, type ActionIntent } from "@/lib/schemas/ai-io";

const ATTACK_PATTERNS = /\b(attack|hit|strike|slash|stab|punch|kick|shoot|smash|fight|swing|cleave|smite)\b/i;
const SPELL_PATTERNS = /\b(cast|spell|fireball|heal|magic|conjure|summon|enchant|invoke|lightning|thunder|eldritch|cantrip)\b/i;
const MOVE_PATTERNS = /\b(move|go|walk|run|sneak|climb|jump|swim|fly|dash|hide|stealth|flee|retreat|enter|leave|approach)\b/i;
const TALK_PATTERNS = /\b(talk|speak|say|ask|tell|persuade|intimidate|deceive|negotiate|greet|convince|bribe|charm)\b/i;
const INSPECT_PATTERNS = /\b(look|inspect|examine|search|investigate|check|observe|scan|sense|detect|read|study|what'?s?\s+around)\b/i;
const ITEM_PATTERNS = /\b(use|drink|eat|equip|wield|open|pick\s?up|grab|take|light|torch|potion|scroll|key)\b/i;

function classifyAction(raw: string): ActionIntent["action_type"] {
  if (ATTACK_PATTERNS.test(raw)) return "attack";
  if (SPELL_PATTERNS.test(raw)) return "cast_spell";
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
    case "talk": return "cha";
    case "inspect": return "wis";
    case "move": return "dex";
    default: return "none";
  }
}

export async function parseIntent(params: {
  sessionId: string;
  turnId: string;
  rawInput: string;
  characterName: string;
  characterClass: string;
  recentEvents: string[];
}): Promise<OrchestrationStepResult<ActionIntent>> {
  const t0 = Date.now();
  const raw = params.rawInput.trim();
  const actionType = classifyAction(raw);
  const skill = guessStat(actionType, raw);
  const needsRoll = actionType !== "talk";

  const data = ActionIntentSchema.parse({
    action_type: actionType,
    targets: [],
    skill_or_save: skill,
    requires_roll: needsRoll,
    confidence: 0.9,
    suggested_roll_context: raw.slice(0, 200),
  });

  return {
    data,
    usage: { inputTokens: 0, outputTokens: 0, model: "deterministic" },
    latencyMs: Date.now() - t0,
    success: true,
  };
}
