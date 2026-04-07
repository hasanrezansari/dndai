import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/ai";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { ActionIntentSchema, type ActionIntent } from "@/lib/schemas/ai-io";

const ATTACK_PATTERNS = /\b(a{1,2}t{1,2}a?c?k|hit|strike|slash|stab|punch|kick|shoot|smash|fight|swing|cleave|smite|slay|kill|murder|wound|damage|harm|hurt|bite|claw|charge|assault|battle|combat|duel)\b/i;
const SPELL_PATTERNS = /\b(cast|spell|fireball|magic|conjure|summon|enchant|invoke|lightning|thunder|eldritch|cantrip|arcane|hex|curse|blast|bolt|ray|teleport|wards?|dispel|ritual)\b/i;
const HEAL_PATTERNS = /\b(heal|mend|cure|restore|bandage|patch\s?up|lay\s+on\s+hands|prayer|revive|recover|potion|medic|first\s+aid|tend\s+wounds?|rest\s+and\s+heal)\b/i;
const DEFEND_PATTERNS = /\b(defend|block|parry|shield|brace|guard|protect|dodge|deflect|hunker|take\s+cover|fortify|barricade)\b/i;
const MOVE_PATTERNS = /\b(move|go|walk|run|sneak|climb|jump|swim|fly|dash|hide|stealth|flee|retreat|enter|leave|approach|travel|head\s+to|advance|proceed|venture|explore|wander|scout)\b/i;
const TALK_PATTERNS = /\b(talk|speak|say|ask|tell|persuade|intimidate|deceive|negotiate|greet|convince|bribe|charm|yell|shout|plead|beg|threaten|lie|bluff|reason\s+with|converse|discuss|argue)\b/i;
const INSPECT_PATTERNS = /\b(look|inspect|examine|search|investigate|check|observe|scan|sense|detect|read|study|what'?s?\s+around|peer|survey|scrutinize|analyze|notice|perceive|watch)\b/i;
const ITEM_PATTERNS = /\b(use|drink|eat|equip|wield|open|pick\s?up|grab|take|light|torch|potion|scroll|key|consume|apply|activate|throw|deploy|pull\s+out|draw\s+my|unsheathe)\b/i;
const SELF_HARM_PATTERNS = /\b(myself|self|my\s+own|i\s+(take|lose|sacrifice|hurt|harm|damage|wound)\b)/i;

function classifyActionHeuristic(raw: string): ActionIntent["action_type"] {
  const lower = raw.toLowerCase();
  if (ATTACK_PATTERNS.test(lower)) return "attack";
  if (SPELL_PATTERNS.test(lower)) return "cast_spell";
  if (HEAL_PATTERNS.test(lower)) return "heal";
  if (DEFEND_PATTERNS.test(lower)) return "defend";
  if (TALK_PATTERNS.test(lower)) return "talk";
  if (INSPECT_PATTERNS.test(lower)) return "inspect";
  if (ITEM_PATTERNS.test(lower)) return "use_item";
  if (MOVE_PATTERNS.test(lower)) return "move";
  if (SELF_HARM_PATTERNS.test(lower)) return "attack";
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

function detectTargets(raw: string): ActionIntent["targets"] {
  const targets: ActionIntent["targets"] = [];
  const lower = raw.toLowerCase();
  if (SELF_HARM_PATTERNS.test(lower)) {
    targets.push({ kind: "player", label: "self" });
  } else if (/\b(door|chest|lock|wall|trap|lever|gate|altar|shrine|statue|boulder|tree|bush|rope)\b/i.test(lower)) {
    targets.push({ kind: "environment", label: "object" });
  }
  return targets;
}

function shouldRequireRollHeuristic(
  actionType: ActionIntent["action_type"],
  raw: string,
): boolean {
  if (actionType !== "talk") return true;
  const text = raw.trim().toLowerCase();
  // Only skip a roll for very simple, low-stakes social beats.
  const trivialSocial =
    /^(hi|hello|hey|greet|wave|smile|nod|thanks|thank you)[.!?]*$/.test(text);
  return !trivialSocial;
}

function extractTaggedNpcTargets(raw: string): {
  cleaned: string;
  targets: Array<{ kind: "npc"; id: string }>;
} {
  const targets: Array<{ kind: "npc"; id: string }> = [];
  const cleaned = raw.replace(
    /\[target:npc:([0-9a-fA-F-]{36})\]/g,
    (_full, id: string) => {
      targets.push({ kind: "npc", id: id.toLowerCase() });
      return "";
    },
  );
  return { cleaned: cleaned.replace(/\s{2,}/g, " ").trim(), targets };
}

function extractTaggedPlayerTargets(raw: string): {
  cleaned: string;
  targets: Array<{ kind: "player"; id: string }>;
} {
  const targets: Array<{ kind: "player"; id: string }> = [];
  const cleaned = raw.replace(
    /\[target:player:([0-9a-fA-F-]{36})\]/gi,
    (_full, id: string) => {
      targets.push({ kind: "player", id: id.toLowerCase() });
      return "";
    },
  );
  return { cleaned: cleaned.replace(/\s{2,}/g, " ").trim(), targets };
}

function mergeExplicitNpcTargets(
  intent: ActionIntent,
  explicitNpcTargets: Array<{ kind: "npc"; id: string }>,
): ActionIntent {
  if (explicitNpcTargets.length === 0) return intent;
  const existing = Array.isArray(intent.targets) ? [...intent.targets] : [];
  for (const target of explicitNpcTargets) {
    if (existing.some((x) => x.kind === "npc" && x.id === target.id)) continue;
    existing.push(target);
  }
  return ActionIntentSchema.parse({
    ...intent,
    targets: existing,
  });
}

function mergeExplicitPlayerTargets(
  intent: ActionIntent,
  explicitPlayerTargets: Array<{ kind: "player"; id: string }>,
): ActionIntent {
  if (explicitPlayerTargets.length === 0) return intent;
  const existing = Array.isArray(intent.targets) ? [...intent.targets] : [];
  for (const target of explicitPlayerTargets) {
    if (existing.some((x) => x.kind === "player" && x.id === target.id)) continue;
    existing.push({ kind: "player", id: target.id });
  }
  return ActionIntentSchema.parse({
    ...intent,
    targets: existing,
  });
}

function buildHeuristicFallback(raw: string): ActionIntent {
  const npcTagged = extractTaggedNpcTargets(raw);
  const plTagged = extractTaggedPlayerTargets(npcTagged.cleaned);
  const cleanedLine = plTagged.cleaned;
  const actionType = classifyActionHeuristic(cleanedLine);
  const skill = guessStat(actionType, cleanedLine);
  const needsRoll = shouldRequireRollHeuristic(actionType, cleanedLine);
  const targets = [
    ...detectTargets(cleanedLine),
    ...npcTagged.targets,
    ...plTagged.targets.map((t) => ({ kind: "player" as const, id: t.id })),
  ];

  const selfHarmAttack = targets.some(
    (t) =>
      t.kind === "player" &&
      "label" in t &&
      t.label?.toLowerCase() === "self",
  );
  const contextMap: Partial<Record<ActionIntent["action_type"], string>> = {
    attack: `Attack roll${selfHarmAttack ? " (self-harm)" : ""}`,
    cast_spell: "Spell attack",
    heal: "Healing check",
    defend: "Defense check",
    move: "Agility check",
    talk: "Persuasion check",
    inspect: "Perception check to notice something.",
    use_item: "Skill check",
  };

  return ActionIntentSchema.parse({
    action_type: actionType,
    targets,
    skill_or_save: skill,
    requires_roll: needsRoll,
    confidence: 0.6,
    suggested_roll_context: contextMap[actionType] ?? cleanedLine.slice(0, 200),
  });
}

const INTENT_SYSTEM = `You are the intent parser for a collaborative tabletop RPG. Given a player's raw action text, classify it into a structured intent.

Output JSON with these fields:
- "action_type": one of "attack", "cast_spell", "move", "talk", "inspect", "use_item", "defend", "heal", "other"
- "targets": array of { "kind": "npc"|"player"|"environment", "label"?: string, "id"?: string } (empty if no target). Optional tags in text: [target:npc:UUID], [target:player:UUID].
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
  /** Hint: betrayer confrontation open — bias toward player targets when attacking another hero. */
  betrayalConfrontationActive?: boolean;
  provider?: AIProvider;
}): Promise<OrchestrationStepResult<ActionIntent>> {
  const raw = params.rawInput.trim();
  const npcTagged = extractTaggedNpcTargets(raw);
  const plTagged = extractTaggedPlayerTargets(npcTagged.cleaned);
  const cleanedAction = plTagged.cleaned;
  const provider = params.provider ?? getAIProvider();

  const userPrompt = JSON.stringify({
    player_action: cleanedAction,
    character_name: params.characterName,
    character_class: params.characterClass,
    recent_context: params.recentEvents.slice(-2).join("\n").slice(0, 1500),
    ...(params.betrayalConfrontationActive
      ? {
          betrayal_note:
            "Betrayal confrontation is live. If the hero clearly attacks, shoves, grapples, or casts hostile magic at another party member, add a target with kind \"player\" and that character's name as label (or id if known). Do not target self unless the text says so.",
        }
      : {}),
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
    timeoutMs: 20_000,
  });

  if (
    result.data.confidence < LOW_CONFIDENCE_THRESHOLD &&
    result.data.rephrase_reason == null
  ) {
    result.data.rephrase_reason =
      "Low confidence classification — consider rephrasing";
  }

  result.data = mergeExplicitPlayerTargets(
    mergeExplicitNpcTargets(result.data, npcTagged.targets),
    plTagged.targets,
  );
  if (result.data.rephrase_reason === null) {
    result.data = ActionIntentSchema.parse({
      ...result.data,
      rephrase_reason: undefined,
    });
  }

  return result;
}
