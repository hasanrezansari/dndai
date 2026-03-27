import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  getAIProvider: vi.fn(),
}));

import { getAIProvider } from "@/lib/ai";
import { generateCustomClassProfileFromAI } from "@/server/services/custom-class-generation-service";

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
});

