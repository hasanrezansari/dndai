import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/orchestrator/trace", () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

import { logTrace } from "@/lib/orchestrator/trace";
import { MockProvider } from "@/lib/ai/mock-provider";
import { parseIntent } from "@/lib/orchestrator/workers/intent-parser";
import { interpretRules } from "@/lib/orchestrator/workers/rules-interpreter";
import { checkVisualDelta } from "@/lib/orchestrator/workers/visual-delta";
import {
  generateNarration,
  wordCount,
} from "@/lib/orchestrator/workers/narrator";
import { ActionIntentSchema } from "@/lib/schemas/ai-io";
import type { CharacterStats } from "@/lib/schemas/domain";

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TURN_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SAMPLE_STATS: CharacterStats = {
  str: 14,
  dex: 12,
  con: 13,
  int: 10,
  wis: 11,
  cha: 9,
};

beforeEach(() => {
  vi.mocked(logTrace).mockClear();
});

describe("orchestration workers", () => {
  it("intent parser returns valid ActionIntent for attack phrasing", async () => {
    const r = await parseIntent({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      rawInput: "I attack the goblin",
      characterName: "Reza",
      characterClass: "Fighter",
      recentEvents: ["The party enters a cave.", "Goblins snarl ahead."],
    });
    expect(r.data.action_type).toBe("attack");
  });

  it("rules interpreter returns at least one roll for an attack intent", async () => {
    const intent = ActionIntentSchema.parse({
      action_type: "attack",
      targets: [{ kind: "npc", label: "goblin" }],
      skill_or_save: "str",
      requires_roll: true,
      confidence: 0.9,
      suggested_roll_context: "Melee attack",
    });
    const r = await interpretRules({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      intent,
      characterStats: SAMPLE_STATS,
      characterClass: "Fighter",
    });
    expect(r.data.rolls.length).toBeGreaterThanOrEqual(1);
  });

  it("visual delta returns image_needed false for minor actions", async () => {
    const r = await checkVisualDelta({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      narrativeText: "You share a quiet word with the innkeeper.",
      currentSceneDescription: "A warm common room with a low fire.",
    });
    expect(r.data.image_needed).toBe(false);
  });

  it("narrator output stays within word bounds via mock fixture", async () => {
    const provider = new MockProvider();
    const intent = ActionIntentSchema.parse({
      action_type: "other",
      targets: [],
      skill_or_save: "none",
      requires_roll: false,
      confidence: 0.7,
    });
    const r = await generateNarration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      rawInput: "I look around the hall cautiously",
      intent,
      diceResults: [{ context: "Check", total: 14, result: "success" }],
      characterName: "Reza",
      nextPlayerName: "Mira",
      recentNarrative: "",
      sceneContext: "A torchlit hall.",
      provider,
    });
    const n = wordCount(r.data.scene_text);
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThanOrEqual(200);
    expect(
      vi.mocked(logTrace).mock.calls.some(
        (c) => c[0]?.stepName === "narrator",
      ),
    ).toBe(true);
  });

  it("each worker invocation produces correct results", async () => {
    const provider = new MockProvider();
    const intentR = await parseIntent({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      rawInput: "look around",
      characterName: "Reza",
      characterClass: "Fighter",
      recentEvents: [],
    });
    expect(intentR.data.action_type).toBe("inspect");

    const rulesR = await interpretRules({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      intent: ActionIntentSchema.parse({
        action_type: "inspect",
        targets: [{ kind: "environment", label: "room" }],
        skill_or_save: "wis",
        requires_roll: true,
        confidence: 0.8,
      }),
      characterStats: SAMPLE_STATS,
      characterClass: "Fighter",
    });
    expect(rulesR.data.legal).toBe(true);
    expect(rulesR.data.rolls.length).toBeGreaterThanOrEqual(1);

    const visR = await checkVisualDelta({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      narrativeText: "You nod politely to the guard.",
      currentSceneDescription: "Gatehouse courtyard.",
    });
    expect(visR.data.image_needed).toBe(false);

    vi.mocked(logTrace).mockClear();
    await generateNarration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      rawInput: "I move forward down the corridor",
      intent: ActionIntentSchema.parse({
        action_type: "move",
        targets: [],
        skill_or_save: "none",
        requires_roll: false,
        confidence: 0.6,
      }),
      diceResults: [],
      characterName: "Reza",
      nextPlayerName: "Mira",
      recentNarrative: "",
      sceneContext: "",
      provider,
    });
    expect(
      vi.mocked(logTrace).mock.calls.some(
        (c) => c[0]?.stepName === "narrator",
      ),
    ).toBe(true);
  });
});
