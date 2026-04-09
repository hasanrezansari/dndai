import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  getAIProvider: vi.fn(),
}));

import { getAIProvider } from "@/lib/ai";
import {
  ClassProfileNormalizationError,
  generateCustomClassProfileFromAI,
} from "@/server/services/custom-class-generation-service";

describe("custom class generation is AI-first", () => {
  beforeEach(() => {
    vi.mocked(getAIProvider).mockReset();
  });

  it("uses provider output and enforces custom source", async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      data: {
        source: "preset",
        display_name: "Neon Duelist",
        concept_prompt: "",
        fantasy: "A fast duelist with neon edge maneuvers.",
        combat_role: "skirmisher",
        resource_model: "focus",
        stat_bias: { str: 0, dex: 2, con: 1, int: 1, wis: 0, cha: 0 },
        abilities: [
          { name: "Edge Slash", type: "active", effect_kind: "damage", resource_cost: 1, cooldown: 1, power_cost: 4 },
          { name: "Blink Step", type: "active", effect_kind: "mobility", resource_cost: 1, cooldown: 1, power_cost: 3 },
          { name: "Combat Rhythm", type: "passive", effect_kind: "buff", resource_cost: 0, cooldown: 0, power_cost: 2 },
        ],
        starting_gear: [
          { name: "Mono Blade", type: "weapon", power_cost: 3 },
          { name: "Flexweave Coat", type: "armor", power_cost: 2 },
          { name: "Targeting Lens", type: "tool", power_cost: 2 },
        ],
        visual_tags: ["neon edge", "rain sheen"],
      },
      usage: { inputTokens: 1, outputTokens: 1, model: "probe" },
    });

    vi.mocked(getAIProvider).mockReturnValue({
      generateStructured,
      generateText: vi.fn(),
    });

    const profile = await generateCustomClassProfileFromAI({
      concept: "cyber duelist with precision mobility",
      rolePreference: "skirmisher",
    });

    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(profile.display_name).toBe("Neon Duelist");
    expect(profile.source).toBe("custom");
    expect(profile.concept_prompt).toBe("cyber duelist with precision mobility");
  });

  it("surfaces provider outage errors for route-level 503 handling", async () => {
    vi.mocked(getAIProvider).mockReturnValue({
      generateStructured: vi.fn().mockRejectedValue(new Error("timeout while calling provider")),
      generateText: vi.fn(),
    });

    await expect(
      generateCustomClassProfileFromAI({
        concept: "electro monk",
      }),
    ).rejects.toThrow("timeout");
  });

  it("rebalances over-budget abilities, gear, and stat bias before parse", async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      data: {
        display_name: "Overclock Vanguard",
        fantasy: "A relentless combat specialist.",
        combat_role: "frontline",
        resource_model: "stamina",
        stat_bias: { str: 3, dex: 3, con: 3, int: 0, wis: 0, cha: 0 },
        abilities: [
          { name: "A", type: "active", effect_kind: "damage", resource_cost: 1, cooldown: 1, power_cost: 6 },
          { name: "B", type: "active", effect_kind: "damage", resource_cost: 1, cooldown: 1, power_cost: 6 },
          { name: "C", type: "passive", effect_kind: "buff", resource_cost: 0, cooldown: 0, power_cost: 6 },
        ],
        starting_gear: [
          { name: "G1", type: "weapon", power_cost: 4 },
          { name: "G2", type: "armor", power_cost: 4 },
          { name: "G3", type: "tool", power_cost: 4 },
        ],
        visual_tags: ["vanguard", "metal"],
      },
      usage: { inputTokens: 1, outputTokens: 1, model: "probe" },
    });

    vi.mocked(getAIProvider).mockReturnValue({
      generateStructured,
      generateText: vi.fn(),
    });

    const profile = await generateCustomClassProfileFromAI({
      concept: "frontline overclock bruiser",
      rolePreference: "frontline",
    });

    const abilityBudget = profile.abilities.reduce((sum, ability) => sum + ability.power_cost, 0);
    const gearBudget = profile.starting_gear.reduce((sum, gear) => sum + gear.power_cost, 0);
    const statBudget = Object.values(profile.stat_bias).reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    );

    expect(abilityBudget).toBeLessThanOrEqual(10);
    expect(gearBudget).toBeLessThanOrEqual(7);
    expect(statBudget).toBeLessThanOrEqual(5);
  });

  it("wraps post-normalization schema failures with ClassProfileNormalizationError", async () => {
    vi.mocked(getAIProvider).mockReturnValue({
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          display_name: "   ",
          fantasy: "ok",
          combat_role: "support",
          resource_model: "focus",
          stat_bias: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
          abilities: [
            { name: "A", type: "active", effect_kind: "heal", resource_cost: 1, cooldown: 1, power_cost: 4 },
            { name: "B", type: "active", effect_kind: "buff", resource_cost: 1, cooldown: 1, power_cost: 3 },
            { name: "C", type: "passive", effect_kind: "utility", resource_cost: 0, cooldown: 0, power_cost: 2 },
          ],
          starting_gear: [
            { name: "G1", type: "tool", power_cost: 3 },
            { name: "G2", type: "armor", power_cost: 2 },
            { name: "G3", type: "focus", power_cost: 2 },
          ],
          visual_tags: ["support"],
        },
        usage: { inputTokens: 1, outputTokens: 1, model: "probe" },
      }),
      generateText: vi.fn(),
    });

    await expect(
      generateCustomClassProfileFromAI({
        concept: "field medic",
        rolePreference: "support",
      }),
    ).rejects.toBeInstanceOf(ClassProfileNormalizationError);
  });
});

