import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/features", () => ({
  isCustomClassesEnabled: () => true,
}));

import { resolveCharacterDisplayFields } from "@/lib/characters/display-class";

describe("resolveCharacterDisplayFields", () => {
  it("uses class profile display name when custom is enabled", () => {
    const r = resolveCharacterDisplayFields({
      classColumn: "neon duelist",
      visualProfile: {
        mechanical_class: "ranger",
        class_profile: {
          source: "custom",
          concept_prompt: "x",
          display_name: "Neon Duelist",
          fantasy: "Fast.",
          combat_role: "skirmisher",
          resource_model: "focus",
          stat_bias: { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 0 },
          abilities: [],
          starting_gear: [],
          visual_tags: [],
        },
      },
    });
    expect(r.displayClass).toBe("Neon Duelist");
    expect(r.mechanicalClass).toBe("ranger");
  });

  it("uses preset label for warrior", () => {
    const r = resolveCharacterDisplayFields({
      classColumn: "warrior",
      visualProfile: {},
    });
    expect(r.displayClass).toBe("Warrior");
    expect(r.mechanicalClass).toBe("warrior");
  });
});
