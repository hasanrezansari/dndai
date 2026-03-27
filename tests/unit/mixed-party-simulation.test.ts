import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orchestrator/trace", () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

import type { AIProvider } from "@/lib/ai";
import { MockProvider } from "@/lib/ai/mock-provider";
import { parseIntent } from "@/lib/orchestrator/workers/intent-parser";
import { generateNarration } from "@/lib/orchestrator/workers/narrator";
import { interpretRules } from "@/lib/orchestrator/workers/rules-interpreter";
import { checkVisualDelta } from "@/lib/orchestrator/workers/visual-delta";
import { ActionIntentSchema, RulesInterpreterOutputSchema } from "@/lib/schemas/ai-io";
import type { CharacterStats, ClassProfile } from "@/lib/schemas/domain";
import { logTrace } from "@/lib/orchestrator/trace";
import { buildArbitratedStyleDirectives } from "@/lib/orchestrator/image-worker";

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TURN_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STATS: CharacterStats = {
  str: 14,
  dex: 12,
  con: 13,
  int: 10,
  wis: 11,
  cha: 9,
};

describe("mixed-party simulation", () => {
  beforeEach(() => {
    vi.mocked(logTrace).mockClear();
  });

  it("handles 4-player mixed preset/custom intent->rules->narration chain", async () => {
    const provider = new MockProvider();
    const partyActions = [
      { name: "Aeris", classLabel: "paladin", raw: "I raise my shield and charge the drone sentinel." },
      { name: "Kade", classLabel: "cyborg samurai", raw: "I dash in and cut the security bot with my mono-katana." },
      { name: "Nyx", classLabel: "neon street shaman", raw: "I cast a pulse hex to scramble enemy targeting." },
      { name: "Vex", classLabel: "rogue", raw: "I slip behind cover and line up a precision shot." },
    ];

    for (const entry of partyActions) {
      const intent = await parseIntent({
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        rawInput: entry.raw,
        characterName: entry.name,
        characterClass: entry.classLabel,
        recentEvents: ["Rain hammers the neon-lit alley.", "Security bots fan out."],
      });
      expect(intent.data.action_type).toBeDefined();

      const rules = await interpretRules({
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        intent: intent.data,
        characterStats: STATS,
        characterClass: entry.classLabel,
      });
      expect(rules.data.legal).toBe(true);
      expect(rules.data.rolls.length).toBeGreaterThanOrEqual(1);

      const narration = await generateNarration({
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        rawInput: entry.raw,
        intent: intent.data,
        diceResults: [{ context: "Action check", total: 14, result: "success" }],
        characterName: entry.name,
        characterClassIdentity: entry.classLabel,
        characterVisualTags: ["neon rain", "chrome edges"],
        recentNarrative: "The team is pinned in an alley.",
        sceneContext: "A cyberpunk alley under storm and holographic signs.",
        provider,
      });
      expect(narration.data.scene_text.length).toBeGreaterThan(40);
    }
  });

  it("passes custom class profile context to rules interpreter prompt", async () => {
    const calls: string[] = [];
    const probeProvider: AIProvider = {
      async generateStructured(params) {
        calls.push(params.userPrompt);
        return {
          data: RulesInterpreterOutputSchema.parse({
            legal: true,
            rolls: [{
              dice: "d20",
              modifier: 2,
              advantage_state: "none",
              context: "Attack roll",
              dc: 12,
            }],
            auto_success: false,
          }),
          usage: { inputTokens: 0, outputTokens: 0, model: "probe" },
        };
      },
      async generateText() {
        return { text: "", usage: { inputTokens: 0, outputTokens: 0, model: "probe" } };
      },
    };

    const customProfile: ClassProfile = {
      source: "custom",
      display_name: "Cyborg Samurai",
      concept_prompt: "cybernetic ronin with mono-katana",
      fantasy: "Augmented swordsman with tactical burst windows.",
      combat_role: "frontline",
      resource_model: "energy",
      stat_bias: { str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: 0 },
      abilities: [
        { name: "Mono Slash", type: "active", effect_kind: "damage", resource_cost: 1, cooldown: 1, power_cost: 4 },
        { name: "Deflect Grid", type: "active", effect_kind: "shield", resource_cost: 2, cooldown: 2, power_cost: 3 },
        { name: "Neural Focus", type: "passive", effect_kind: "buff", resource_cost: 0, cooldown: 0, power_cost: 2 },
      ],
      starting_gear: [
        { name: "Mono-Katana", type: "weapon", power_cost: 3 },
        { name: "Reactive Plating", type: "armor", power_cost: 2 },
        { name: "Combat Utility Rig", type: "tool", power_cost: 2 },
      ],
      visual_tags: ["mono-katana", "chrome plating", "neon edge"],
    };

    await interpretRules({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      intent: ActionIntentSchema.parse({
        action_type: "attack",
        targets: [{ kind: "npc", label: "security bot" }],
        skill_or_save: "str",
        requires_roll: true,
        confidence: 0.9,
        suggested_roll_context: "Melee strike",
      }),
      characterStats: STATS,
      characterClass: "cyborg samurai",
      mechanicalClass: "warrior",
      classProfile: customProfile,
      provider: probeProvider,
    });

    const prompt = calls[0] ?? "";
    expect(prompt).toContain("\"mechanical_class\":\"warrior\"");
    expect(prompt).toContain("\"character_identity\"");
    expect(prompt).toContain("\"display_class\":\"cyborg samurai\"");
    expect(prompt).toContain("\"class_profile_summary\"");
    expect(prompt).toContain("\"display_name\":\"Cyborg Samurai\"");
  });

  it("passes normalized identity bundle to narrator prompt", async () => {
    const calls: string[] = [];
    const probeProvider: AIProvider = {
      async generateStructured(params) {
        calls.push(params.userPrompt);
        return {
          data: {
            scene_text: "Kade pivots through neon rain and drives forward with a precise edge cut as sparks flare.",
            visible_changes: [],
            tone: "tense",
            next_actor_id: null,
            image_hint: { subjects: [], avoid: [] },
          },
          usage: { inputTokens: 0, outputTokens: 0, model: "probe" },
        };
      },
      async generateText() {
        return { text: "", usage: { inputTokens: 0, outputTokens: 0, model: "probe" } };
      },
    };

    await generateNarration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      rawInput: "I dash and slice with my mono-katana.",
      intent: ActionIntentSchema.parse({
        action_type: "attack",
        targets: [{ kind: "npc", label: "security bot" }],
        skill_or_save: "str",
        requires_roll: true,
        confidence: 0.9,
      }),
      diceResults: [{ context: "Attack roll", total: 15, result: "success" }],
      characterName: "Kade",
      characterClassIdentity: "Cyborg Samurai (frontline, energy)",
      characterMechanicalClass: "warrior",
      characterIdentitySource: "custom",
      characterVisualTags: ["mono-katana", "chrome plating"],
      recentNarrative: "The alley floods with blue static.",
      sceneContext: "A rain-slick cyberpunk alley.",
      provider: probeProvider,
    });

    const prompt = calls[0] ?? "";
    expect(prompt).toContain("\"character_identity\"");
    expect(prompt).toContain("\"display_class_identity\":\"Cyborg Samurai (frontline, energy)\"");
    expect(prompt).toContain("\"mechanical_class\":\"warrior\"");
    expect(prompt).toContain("\"source\":\"custom\"");
  });

  it("requests new image on clear scene shift language", async () => {
    const visual = await checkVisualDelta({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      narrativeText: "You emerge from the alley and enter the skybridge market under flickering signs.",
      currentSceneDescription: "Rainy back alley with neon puddles and shuttered stalls.",
    });
    expect(visual.data.image_needed).toBe(true);
  });

  it("keeps style arbitration deterministic for mixed-party tags", () => {
    const directives = buildArbitratedStyleDirectives({
      sessionThemeStyle: "cyberpunk concept art, neon edge lighting",
      classVisualTags: ["chrome plating", "neon rain", "chrome plating"],
      classConcepts: ["augmented ronin", "street shaman"],
      turnHint: { environment: "market skybridge", mood: "urgent tension" },
    });

    expect(directives.orderedStyleDirectives).toEqual([
      "Session theme (highest priority): cyberpunk concept art, neon edge lighting",
      "Class visual tags (secondary): chrome plating, neon rain",
      "Class concepts (secondary): augmented ronin, street shaman",
      "Turn hint details (tertiary): market skybridge, urgent tension",
    ]);
  });
});

