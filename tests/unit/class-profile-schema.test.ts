import { describe, expect, it } from "vitest";

import { ClassProfileSchema } from "@/lib/schemas/domain";

function validBaseProfile() {
  return {
    source: "custom" as const,
    display_name: "Blade Scholar",
    concept_prompt: "arcane duelist with tactical wards",
    fantasy: "A disciplined duelist weaving steel and wards.",
    combat_role: "skirmisher" as const,
    resource_model: "focus" as const,
    stat_bias: { str: 0, dex: 2, con: 1, int: 2, wis: 0, cha: 0 },
    abilities: [
      { name: "Arc Lash", type: "active" as const, effect_kind: "damage" as const, resource_cost: 1, cooldown: 1, power_cost: 4 },
      { name: "Ward Step", type: "active" as const, effect_kind: "mobility" as const, resource_cost: 1, cooldown: 1, power_cost: 3 },
      { name: "Duelist Focus", type: "passive" as const, effect_kind: "buff" as const, resource_cost: 0, cooldown: 0, power_cost: 2 },
    ],
    starting_gear: [
      { name: "Runed Rapier", type: "weapon" as const, power_cost: 3 },
      { name: "Focus Bracer", type: "focus" as const, power_cost: 2 },
      { name: "Light Mesh", type: "armor" as const, power_cost: 2 },
    ],
    visual_tags: ["runed steel", "arcane sigils"],
  };
}

describe("ClassProfileSchema guardrails", () => {
  it("rejects ability budget overflow", () => {
    const base = validBaseProfile();
    const out = ClassProfileSchema.safeParse({
      ...base,
      abilities: [
        { ...base.abilities[0], power_cost: 4 },
        { ...base.abilities[1], power_cost: 4 },
        { ...base.abilities[2], power_cost: 4 },
      ],
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.message === "Ability budget exceeded")).toBe(true);
    }
  });

  it("rejects gear budget overflow", () => {
    const base = validBaseProfile();
    const out = ClassProfileSchema.safeParse({
      ...base,
      starting_gear: [
        { ...base.starting_gear[0], power_cost: 4 },
        { ...base.starting_gear[1], power_cost: 3 },
        { ...base.starting_gear[2], power_cost: 2 },
      ],
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.message === "Starting gear budget exceeded")).toBe(true);
    }
  });

  it("rejects stat bias overflow", () => {
    const base = validBaseProfile();
    const out = ClassProfileSchema.safeParse({
      ...base,
      stat_bias: { str: 3, dex: 3, con: 1, int: 0, wis: 0, cha: 0 },
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.message === "Stat bias budget exceeded")).toBe(true);
    }
  });

  it("accepts valid budget boundary", () => {
    const out = ClassProfileSchema.safeParse(validBaseProfile());
    expect(out.success).toBe(true);
  });
});

