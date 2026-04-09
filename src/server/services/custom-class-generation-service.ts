import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import { ClassProfileRoleSchema, ClassProfileSchema } from "@/lib/schemas/domain";

const RoleValues = ClassProfileRoleSchema.options;
type Role = z.infer<typeof ClassProfileRoleSchema>;

const LooseClassProfileSchema = z.object({
  source: z.string().optional(),
  display_name: z.string().optional(),
  name: z.string().optional(),
  class_name: z.string().optional(),
  title: z.string().optional(),
  concept_prompt: z.string().optional(),
  fantasy: z.string().optional(),
  description: z.string().optional(),
  combat_role: z.string().optional(),
  role: z.string().optional(),
  archetype: z.string().optional(),
  resource_model: z.string().optional(),
  resource: z.string().optional(),
  stat_bias: z
    .object({
      str: z.coerce.number().optional(),
      dex: z.coerce.number().optional(),
      con: z.coerce.number().optional(),
      int: z.coerce.number().optional(),
      wis: z.coerce.number().optional(),
      cha: z.coerce.number().optional(),
    })
    .partial()
    .optional(),
  abilities: z
    .array(
      z.object({
        name: z.string().optional(),
        type: z.string().optional(),
        effect_kind: z.string().optional(),
        effect: z.string().optional(),
        kind: z.string().optional(),
        resource_cost: z.coerce.number().optional(),
        cooldown: z.coerce.number().optional(),
        power_cost: z.coerce.number().optional(),
      }),
    )
    .optional(),
  powers: z.array(z.record(z.string(), z.unknown())).optional(),
  skills: z.array(z.record(z.string(), z.unknown())).optional(),
  starting_gear: z
    .array(
      z.object({
        name: z.string().optional(),
        type: z.string().optional(),
        power_cost: z.coerce.number().optional(),
      }),
    )
    .optional(),
  gear: z.array(z.record(z.string(), z.unknown())).optional(),
  equipment: z.array(z.record(z.string(), z.unknown())).optional(),
  visual_tags: z.union([z.array(z.string()), z.string()]).optional(),
});

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeRole(value: string | undefined, preferred?: Role): Role {
  const raw = (value ?? "").trim().toLowerCase();
  if (RoleValues.includes(raw as Role)) return raw as Role;
  if (raw.includes("tank")) return "guardian";
  if (raw.includes("front")) return "frontline";
  if (raw.includes("support") || raw.includes("heal")) return "support";
  if (raw.includes("arcane") || raw.includes("mage") || raw.includes("caster")) return "arcane";
  if (raw.includes("skirm") || raw.includes("rogue")) return "skirmisher";
  if (raw.includes("guard")) return "guardian";
  return preferred ?? "specialist";
}

function normalizeResource(value: string | undefined, role: Role): "none" | "mana" | "energy" | "focus" | "stamina" {
  const raw = (value ?? "").trim().toLowerCase();
  if (["none", "mana", "energy", "focus", "stamina"].includes(raw)) {
    return raw as "none" | "mana" | "energy" | "focus" | "stamina";
  }
  if (raw.includes("rage")) return "stamina";
  if (raw.includes("spirit")) return "focus";
  if (role === "arcane") return "mana";
  if (role === "guardian" || role === "frontline") return "stamina";
  if (role === "support") return "focus";
  return "energy";
}

function normalizeAbilityType(value: string | undefined, idx: number): "active" | "passive" {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "active" || raw === "passive") return raw;
  return idx === 2 ? "passive" : "active";
}

function normalizeEffectKind(value: string | undefined): "damage" | "heal" | "shield" | "buff" | "debuff" | "mobility" | "utility" {
  const raw = (value ?? "").trim().toLowerCase();
  if (["damage", "heal", "shield", "buff", "debuff", "mobility", "utility"].includes(raw)) {
    return raw as "damage" | "heal" | "shield" | "buff" | "debuff" | "mobility" | "utility";
  }
  if (raw.includes("move") || raw.includes("dash") || raw.includes("teleport")) return "mobility";
  if (raw.includes("heal") || raw.includes("restore")) return "heal";
  if (raw.includes("shield") || raw.includes("ward") || raw.includes("guard")) return "shield";
  if (raw.includes("buff") || raw.includes("boost")) return "buff";
  if (raw.includes("debuff") || raw.includes("curse")) return "debuff";
  if (raw.includes("utility") || raw.includes("trick")) return "utility";
  return "damage";
}

function normalizeGearType(value: string | undefined): "weapon" | "armor" | "focus" | "tool" | "cyberware" {
  const raw = (value ?? "").trim().toLowerCase();
  if (["weapon", "armor", "focus", "tool", "cyberware"].includes(raw)) {
    return raw as "weapon" | "armor" | "focus" | "tool" | "cyberware";
  }
  if (raw.includes("arm")) return "armor";
  if (raw.includes("focus") || raw.includes("relic")) return "focus";
  if (raw.includes("kit") || raw.includes("tool")) return "tool";
  if (raw.includes("cyber")) return "cyberware";
  return "weapon";
}

function normalizeVisualTags(value: z.infer<typeof LooseClassProfileSchema>["visual_tags"], concept: string, role: Role): string[] {
  const source =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : concept.split(/\s+/);
  return [...new Set(source.map((s) => s.trim().toLowerCase()).filter(Boolean).concat([role]))].slice(0, 10);
}

export type SessionPremiseForClassGen = {
  adventure_prompt?: string;
  adventure_tags?: string[];
  world_bible?: string;
  art_direction?: string;
};

export class ClassProfileNormalizationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ClassProfileNormalizationError";
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function rebalancePowerBudget<T extends { power_cost: number }>(
  items: T[],
  maxBudget: number,
  minPerItem: number,
): T[] {
  const next = items.map((item) => ({ ...item }));
  const total = () => next.reduce((sum, item) => sum + item.power_cost, 0);
  while (total() > maxBudget) {
    let reduceIdx = -1;
    let highest = minPerItem;
    for (let i = 0; i < next.length; i++) {
      if (next[i]!.power_cost > highest) {
        highest = next[i]!.power_cost;
        reduceIdx = i;
      }
    }
    if (reduceIdx === -1) break;
    next[reduceIdx] = {
      ...next[reduceIdx]!,
      power_cost: next[reduceIdx]!.power_cost - 1,
    };
  }
  return next;
}

function rebalancePositiveStatBiasBudget(
  statBias: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  },
  maxPositiveBudget: number,
) {
  const next = { ...statBias };
  const positiveTotal = () =>
    Object.values(next).reduce((sum, value) => sum + Math.max(0, value), 0);
  const keys: Array<keyof typeof next> = ["str", "dex", "con", "int", "wis", "cha"];

  while (positiveTotal() > maxPositiveBudget) {
    let reduceKey: keyof typeof next | null = null;
    let highest = 0;
    for (const key of keys) {
      if (next[key] > highest) {
        highest = next[key];
        reduceKey = key;
      }
    }
    if (!reduceKey || next[reduceKey] <= 0) break;
    next[reduceKey] = next[reduceKey] - 1;
  }
  return next;
}

export async function generateCustomClassProfileFromAI(params: {
  concept: string;
  rolePreference?: z.infer<typeof ClassProfileRoleSchema>;
  sessionPremise?: SessionPremiseForClassGen;
}) {
  const provider = getAIProvider();
  const premise = params.sessionPremise;
  const hasPremise = Boolean(
    premise &&
      (premise.adventure_prompt?.trim() ||
        (premise.adventure_tags && premise.adventure_tags.length > 0) ||
        premise.world_bible?.trim() ||
        premise.art_direction?.trim()),
  );

  const systemPrompt = `You generate balanced custom RPG class profiles for a tabletop RPG session.
Return ONLY JSON that matches the provided schema.

Hard requirements:
- source must be "custom"
- the "fantasy" JSON field is a one-line flavorful class pitch for any genre (sci-fi, horror, modern, Victorian, etc.); it must reflect the player's concept prompt
- keep mechanics balanced and playable at level 1
- no overpowered kits
- prefer clear, flavorful ability and gear names that fit the TABLE SETTING when campaign_context is provided (no laser rifles in pure Victorian drama unless the premise allows tech; no "arcane" naming if the table is grounded realism unless the concept is mystical)
- visual_tags should help image consistency across scenes

Balance requirements:
- exactly 3 abilities (2 active, 1 passive)
- exactly 3 starting_gear items
- stat_bias values should fit archetype but remain bounded
- include tradeoffs (no class is best at everything)`;

  const userPrompt = JSON.stringify({
    concept: params.concept,
    role_preference: params.rolePreference ?? null,
    campaign_context: hasPremise
      ? {
          adventure_prompt: premise?.adventure_prompt?.trim().slice(0, 4000) ?? null,
          adventure_tags: premise?.adventure_tags?.length
            ? premise.adventure_tags.map((t) => t.trim().slice(0, 48)).filter(Boolean)
            : null,
          world_bible_excerpt:
            premise?.world_bible?.trim().slice(0, 3500) ?? null,
          art_direction: premise?.art_direction?.trim().slice(0, 500) ?? null,
        }
      : null,
    output_rules: {
      source: "custom",
      abilities_count: 3,
      starting_gear_count: 3,
    },
  });
  const result = await provider.generateStructured({
    model: "light",
    systemPrompt,
    userPrompt,
    schema: LooseClassProfileSchema,
    maxTokens: 700,
    temperature: 0.35,
  });

  const data = result.data;
  const role = normalizeRole(data.combat_role ?? data.role ?? data.archetype, params.rolePreference);
  const resource = normalizeResource(data.resource_model ?? data.resource, role);
  const rawAbilities = data.abilities ?? data.powers ?? data.skills ?? [];
  const rawGear = data.starting_gear ?? data.gear ?? data.equipment ?? [];

  const abilities = rawAbilities.slice(0, 3).map((ability, idx) => {
    const rec = ability as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : `Ability ${idx + 1}`;
    return {
      name: name.trim().slice(0, 40) || `Ability ${idx + 1}`,
      type: normalizeAbilityType(typeof rec.type === "string" ? rec.type : undefined, idx),
      effect_kind: normalizeEffectKind(
        typeof rec.effect_kind === "string"
          ? rec.effect_kind
          : typeof rec.effect === "string"
            ? rec.effect
            : typeof rec.kind === "string"
              ? rec.kind
              : undefined,
      ),
      resource_cost: clampInt(rec.resource_cost, 0, 6, idx === 2 ? 0 : 2),
      cooldown: clampInt(rec.cooldown, 0, 6, idx === 2 ? 0 : 1),
      power_cost: clampInt(rec.power_cost, 1, 6, idx === 0 ? 4 : idx === 1 ? 3 : 2),
    };
  });
  while (abilities.length < 3) {
    const idx = abilities.length;
    abilities.push({
      name: `Ability ${idx + 1}`,
      type: normalizeAbilityType(undefined, idx),
      effect_kind: idx === 1 ? "shield" : idx === 2 ? "utility" : "damage",
      resource_cost: idx === 2 ? 0 : 2,
      cooldown: idx === 2 ? 0 : 1,
      power_cost: idx === 0 ? 4 : idx === 1 ? 3 : 2,
    });
  }

  const startingGear = rawGear.slice(0, 3).map((item, idx) => {
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : `Gear ${idx + 1}`;
    return {
      name: name.trim().slice(0, 40) || `Gear ${idx + 1}`,
      type: normalizeGearType(typeof rec.type === "string" ? rec.type : undefined),
      power_cost: clampInt(rec.power_cost, 1, 4, idx === 0 ? 3 : 2),
    };
  });
  while (startingGear.length < 3) {
    const idx = startingGear.length;
    startingGear.push({
      name: `Gear ${idx + 1}`,
      type: idx === 1 ? "armor" : idx === 2 ? "tool" : "weapon",
      power_cost: idx === 0 ? 3 : 2,
    });
  }

  const balancedAbilities = rebalancePowerBudget(abilities, 10, 1);
  const balancedStartingGear = rebalancePowerBudget(startingGear, 7, 1);
  const balancedStatBias = rebalancePositiveStatBiasBudget(
    {
      str: clampInt(data.stat_bias?.str, -2, 3, 0),
      dex: clampInt(data.stat_bias?.dex, -2, 3, 0),
      con: clampInt(data.stat_bias?.con, -2, 3, 0),
      int: clampInt(data.stat_bias?.int, -2, 3, 0),
      wis: clampInt(data.stat_bias?.wis, -2, 3, 0),
      cha: clampInt(data.stat_bias?.cha, -2, 3, 0),
    },
    5,
  );

  try {
    return ClassProfileSchema.parse({
      source: "custom",
      concept_prompt: params.concept,
      display_name: (
        data.display_name ??
        data.name ??
        data.class_name ??
        data.title ??
        params.concept
      ).trim().slice(0, 40),
      fantasy: (data.fantasy ?? data.description ?? params.concept).trim().slice(0, 180),
      combat_role: role,
      resource_model: resource,
      stat_bias: balancedStatBias,
      abilities: balancedAbilities,
      starting_gear: balancedStartingGear,
      visual_tags: normalizeVisualTags(data.visual_tags, params.concept, role),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ClassProfileNormalizationError(
        "Generated class failed schema normalization",
        { cause: error },
      );
    }
    throw error;
  }
}

