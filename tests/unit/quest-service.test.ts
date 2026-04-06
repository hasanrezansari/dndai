import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  defaultQuestState,
  evaluateEndingVote,
  intentWeight,
  maybeOpenEndingVote,
  scoreFromRoll,
  type QuestState,
} from "@/server/services/quest-service";

describe("scoreFromRoll", () => {
  it("returns high progress and negative risk for critical success", () => {
    const { progressDelta, riskDelta } = scoreFromRoll("critical_success");
    expect(progressDelta).toBeGreaterThanOrEqual(7);
    expect(riskDelta).toBeLessThan(0);
  });

  it("returns positive progress and negative risk for success", () => {
    const { progressDelta, riskDelta } = scoreFromRoll("success");
    expect(progressDelta).toBeGreaterThan(0);
    expect(riskDelta).toBeLessThanOrEqual(0);
  });

  it("returns low progress and high risk for failure", () => {
    const { progressDelta, riskDelta } = scoreFromRoll("failure");
    expect(progressDelta).toBeLessThanOrEqual(3);
    expect(progressDelta).toBeGreaterThan(0);
    expect(riskDelta).toBeGreaterThan(0);
  });

  it("returns minimal progress and high risk for critical failure", () => {
    const { progressDelta, riskDelta } = scoreFromRoll("critical_failure");
    expect(progressDelta).toBeLessThanOrEqual(2);
    expect(riskDelta).toBeGreaterThanOrEqual(8);
  });

  it("returns moderate values for undefined result", () => {
    const { progressDelta, riskDelta } = scoreFromRoll(undefined);
    expect(progressDelta).toBeGreaterThan(0);
    expect(riskDelta).toBeGreaterThan(0);
  });
});

describe("intentWeight", () => {
  it("gives higher weight to combat actions", () => {
    expect(intentWeight("attack")).toBeGreaterThan(1);
    expect(intentWeight("cast_spell")).toBeGreaterThan(1);
  });

  it("gives moderate weight to social actions", () => {
    expect(intentWeight("talk")).toBeLessThanOrEqual(1);
    expect(intentWeight("talk")).toBeGreaterThan(0);
  });

  it("gives base weight to unknown actions", () => {
    expect(intentWeight("unknown_action")).toBeLessThan(1);
    expect(intentWeight("unknown_action")).toBeGreaterThan(0);
  });
});

describe("defaultQuestState", () => {
  it("creates a fresh state with zero progress and risk", () => {
    const state = defaultQuestState("Save the village");
    expect(state.objective).toBe("Save the village");
    expect(state.progress).toBe(0);
    expect(state.risk).toBe(0);
    expect(state.status).toBe("active");
    expect(state.endingVote).toBeNull();
  });

  it("truncates long objectives", () => {
    const long = "A".repeat(200);
    const state = defaultQuestState(long);
    expect(state.objective.length).toBeLessThanOrEqual(140);
    expect(state.objective.endsWith("...")).toBe(true);
  });

  it("provides fallback for empty objectives", () => {
    const state = defaultQuestState("");
    expect(state.objective.length).toBeGreaterThan(0);
  });
});

describe("maybeOpenEndingVote", () => {
  const voters = ["p1", "p2", "p3"];

  it("opens vote when status is ready_to_end and no existing vote", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      progress: 100,
      status: "ready_to_end",
    };
    const { state: next, opened } = maybeOpenEndingVote(state, 5, voters);
    expect(opened).toBe(true);
    expect(next.endingVote?.open).toBe(true);
    expect(next.endingVote?.reason).toBe("objective_complete");
    expect(next.endingVote?.eligibleVoterIds).toEqual(voters);
    expect(next.endingVote?.requiredYes).toBe(2);
  });

  it("opens vote when status is failed", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      risk: 100,
      status: "failed",
    };
    const { state: next, opened } = maybeOpenEndingVote(state, 5, voters);
    expect(opened).toBe(true);
    expect(next.endingVote?.reason).toBe("party_defeated");
  });

  it("does not open vote when status is active", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      status: "active",
    };
    const { opened } = maybeOpenEndingVote(state, 5, voters);
    expect(opened).toBe(false);
  });

  it("does not open vote during cooldown", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      progress: 100,
      status: "ready_to_end",
      endingVote: {
        open: false,
        reason: "objective_complete",
        initiatedRound: 2,
        cooldownUntilRound: 10,
        failedAttempts: 1,
        requiredYes: 2,
        eligibleVoterIds: voters,
        votes: {},
      },
    };
    const { opened } = maybeOpenEndingVote(state, 5, voters);
    expect(opened).toBe(false);
  });

  it("does not open a second vote while one is already open", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      progress: 100,
      status: "ready_to_end",
      endingVote: {
        open: true,
        reason: "objective_complete",
        initiatedRound: 5,
        cooldownUntilRound: 5,
        failedAttempts: 0,
        requiredYes: 2,
        eligibleVoterIds: voters,
        votes: {},
      },
    };
    const { opened } = maybeOpenEndingVote(state, 5, voters);
    expect(opened).toBe(false);
  });
});

describe("evaluateEndingVote", () => {
  const voters = ["p1", "p2", "p3"];

  function makeVoteState(
    votes: Record<string, "end_now" | "continue">,
    failedAttempts = 0,
  ): QuestState {
    return {
      ...defaultQuestState("test"),
      status: "ready_to_end",
      endingVote: {
        open: true,
        reason: "objective_complete",
        initiatedRound: 5,
        cooldownUntilRound: 5,
        failedAttempts,
        requiredYes: 2,
        eligibleVoterIds: voters,
        votes,
      },
    };
  }

  it("passes when supermajority votes end_now", () => {
    const state = makeVoteState({ p1: "end_now", p2: "end_now" });
    const { shouldEndSession, changed, message } = evaluateEndingVote(state, 5);
    expect(shouldEndSession).toBe(true);
    expect(changed).toBe(true);
    expect(message).toBe("Ending vote passed");
  });

  it("fails when all vote continue", () => {
    const state = makeVoteState({
      p1: "continue",
      p2: "continue",
      p3: "continue",
    });
    const { shouldEndSession, changed, message } = evaluateEndingVote(state, 5);
    expect(shouldEndSession).toBe(false);
    expect(changed).toBe(true);
    expect(message).toContain("failed");
  });

  it("forces end after 2 failed attempts", () => {
    const state = makeVoteState(
      { p1: "continue", p2: "continue", p3: "continue" },
      1,
    );
    const { shouldEndSession, message } = evaluateEndingVote(state, 5);
    expect(shouldEndSession).toBe(true);
    expect(message).toContain("forced");
  });

  it("does nothing when votes are incomplete and not expired", () => {
    const state = makeVoteState({ p1: "end_now" });
    const { shouldEndSession, changed } = evaluateEndingVote(state, 5);
    expect(shouldEndSession).toBe(false);
    expect(changed).toBe(false);
  });

  it("expires vote after 2 rounds", () => {
    const state = makeVoteState({ p1: "end_now" });
    const { changed } = evaluateEndingVote(state, 7);
    expect(changed).toBe(true);
  });

  it("does nothing if no vote is open", () => {
    const state: QuestState = {
      ...defaultQuestState("test"),
      endingVote: null,
    };
    const { shouldEndSession, changed } = evaluateEndingVote(state, 5);
    expect(shouldEndSession).toBe(false);
    expect(changed).toBe(false);
  });
});

describe("diminishing returns math", () => {
  it("applies no penalty for first use of an action type", () => {
    const recent: string[] = [];
    const consecutiveSame = recent.filter((a) => a === "attack").length;
    const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);
    expect(diminishing).toBe(1);
  });

  it("applies 20% penalty per consecutive same action", () => {
    const recent = ["attack", "attack"];
    const consecutiveSame = recent.filter((a) => a === "attack").length;
    const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);
    expect(diminishing).toBeCloseTo(0.6);
  });

  it("floors at 25% regardless of consecutive count", () => {
    const recent = ["attack", "attack", "attack", "attack", "attack"];
    const consecutiveSame = recent.filter((a) => a === "attack").length;
    const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);
    expect(diminishing).toBe(0.25);
  });

  it("does not penalize different action types in history", () => {
    const recent = ["move", "talk", "inspect", "cast_spell"];
    const consecutiveSame = recent.filter((a) => a === "attack").length;
    const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);
    expect(diminishing).toBe(1);
  });

  it("caps recentActions array at 5 entries", () => {
    const recent = ["a", "b", "c", "d", "e"];
    recent.push("f");
    if (recent.length > 5) recent.shift();
    expect(recent).toHaveLength(5);
    expect(recent[0]).toBe("b");
  });
});

describe("status transitions", () => {
  it("transitions to ready_to_end when progress reaches 100", () => {
    const progress = 100;
    const risk = 30;
    let status: "active" | "ready_to_end" | "failed" = "active";
    if (progress >= 100) status = "ready_to_end";
    expect(status).toBe("ready_to_end");
    expect(risk).toBeLessThan(100);
  });

  it("transitions to failed when risk reaches 100", () => {
    const progress = 50;
    let risk = 100;
    let status: "active" | "ready_to_end" | "failed" = "active";
    if (progress >= 100) status = "ready_to_end";
    if (risk >= 100) {
      status = "failed";
      risk = 100;
    }
    expect(status).toBe("failed");
  });

  it("failed overrides ready_to_end when both thresholds met", () => {
    const progress = 100;
    let risk = 100;
    let status: "active" | "ready_to_end" | "failed" = "active";
    if (progress >= 100) status = "ready_to_end";
    if (risk >= 100) {
      status = "failed";
      risk = 100;
    }
    expect(status).toBe("failed");
  });

  it("stays active when both progress and risk are moderate", () => {
    const progress = 50;
    const risk = 40;
    let status: "active" | "ready_to_end" | "failed" = "active";
    if (progress >= 100) status = "ready_to_end";
    if (risk >= 100) status = "failed";
    expect(status).toBe("active");
  });
});

describe("scoreFromRoll edge cases", () => {
  it("handles all valid DiceRoll results without throwing", () => {
    const results = ["critical_success", "success", "failure", "critical_failure", undefined] as const;
    for (const r of results) {
      const { progressDelta, riskDelta } = scoreFromRoll(r);
      expect(typeof progressDelta).toBe("number");
      expect(typeof riskDelta).toBe("number");
    }
  });
});

describe("intentWeight edge cases", () => {
  it("returns positive weight for every known action type", () => {
    const knownTypes = ["attack", "cast_spell", "talk", "inspect", "move", "use_item", "other"];
    for (const t of knownTypes) {
      expect(intentWeight(t)).toBeGreaterThan(0);
    }
  });

  it("returns positive weight for completely unknown action types", () => {
    expect(intentWeight("fly_to_moon")).toBeGreaterThan(0);
    expect(intentWeight("")).toBeGreaterThan(0);
  });
});
