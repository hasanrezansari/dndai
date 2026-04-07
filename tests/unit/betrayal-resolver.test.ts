import { describe, expect, it } from "vitest";

import { applyBetrayalOutcomeToQuest } from "@/server/services/betrayal-resolver";
import type { QuestState } from "@/server/services/quest-service";

const baseQuest = (): QuestState => ({
  objective: "Recover the golden idol.",
  progress: 40,
  risk: 20,
  status: "active",
  endingVote: null,
  updatedAt: new Date().toISOString(),
});

describe("applyBetrayalOutcomeToQuest", () => {
  it("traitor_escapes marks holder and extends objective", () => {
    const q = baseQuest();
    const traitorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { quest, memoryFactLine } = applyBetrayalOutcomeToQuest(
      q,
      "betrayal_traitor_escapes",
      { traitor_player_id: traitorId, round: 3 },
    );
    expect(quest.betrayal?.outcome_id).toBe("betrayal_traitor_escapes");
    expect(quest.betrayal?.macguffin_holder_player_id).toBe(traitorId);
    expect(quest.objective).toContain("Priority: recover");
    expect(memoryFactLine).toContain("betrayal_traitor_escapes");
  });

  it("unknown outcome uses fallback id in slice", () => {
    const { quest } = applyBetrayalOutcomeToQuest(baseQuest(), "custom_mod_outcome", {
      round: 1,
    });
    expect(quest.betrayal?.outcome_id).toBe("betrayal_outcome_unknown");
  });

  it("defaults traitor from quest instigator when ctx omits traitor", () => {
    const instigator = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const q = baseQuest();
    q.betrayal = {
      phase: "confronting",
      instigator_player_id: instigator,
      last_updated_round: 2,
    };
    const { quest } = applyBetrayalOutcomeToQuest(q, "betrayal_traitor_caught", {
      round: 4,
    });
    expect(quest.betrayal?.traitor_player_id).toBe(instigator);
  });
});
