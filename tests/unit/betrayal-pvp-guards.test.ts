import { describe, expect, it } from "vitest";

import {
  BETRAYAL_PAIR_COOLDOWN_ROUNDS,
  defaultBetrayalPvpMeta,
  evaluateBetrayalPvpGate,
  MAX_BETRAYAL_CLASHES_PER_ARC,
  MAX_BETRAYAL_INITIATIONS_PER_PLAYER,
  recordBetrayalPvpClash,
  resetBetrayalPvpForNewArc,
  normalizeBetrayalPvpMeta,
} from "@/server/services/betrayal-pvp-guards";
import { defaultQuestState, type QuestState } from "@/server/services/quest-service";

function baseQuest(): QuestState {
  return {
    ...defaultQuestState("Rescue the scholar"),
    betrayal: { phase: "confronting" },
    betrayal_pvp: defaultBetrayalPvpMeta(),
  };
}

describe("evaluateBetrayalPvpGate", () => {
  it("allows when betrayal mode is not confrontational", () => {
    const q = baseQuest();
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "off",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "a",
      victimPlayerId: "b",
      currentRound: 5,
    });
    expect(r.ok).toBe(true);
  });

  it("blocks when confrontational but not in confronting phase", () => {
    const q = {
      ...baseQuest(),
      betrayal: { phase: "rogue_intent" as const },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "rogue_intent",
      quest: q,
      attackerPlayerId: "a",
      victimPlayerId: "b",
      currentRound: 5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/confrontation/i);
  });

  it("allows when confronting and under limits", () => {
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: baseQuest(),
      attackerPlayerId: "p1",
      victimPlayerId: "p2",
      currentRound: 10,
    });
    expect(r.ok).toBe(true);
  });

  it("blocks after max clashes this arc", () => {
    const q = {
      ...baseQuest(),
      betrayal_pvp: {
        ...defaultBetrayalPvpMeta(),
        clashes_this_arc: MAX_BETRAYAL_CLASHES_PER_ARC,
      },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "p1",
      victimPlayerId: "p2",
      currentRound: 10,
    });
    expect(r.ok).toBe(false);
  });

  it("blocks when attacker hit initiation cap", () => {
    const q = {
      ...baseQuest(),
      betrayal_pvp: {
        ...defaultBetrayalPvpMeta(),
        initiations_by_player: { p1: MAX_BETRAYAL_INITIATIONS_PER_PLAYER },
      },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "p1",
      victimPlayerId: "p2",
      currentRound: 10,
    });
    expect(r.ok).toBe(false);
  });

  it("blocks during pair cooldown", () => {
    const q = {
      ...baseQuest(),
      betrayal_pvp: {
        ...defaultBetrayalPvpMeta(),
        last_pair_round: { "p1:p2": 5 },
      },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "p1",
      victimPlayerId: "p2",
      currentRound: 5 + BETRAYAL_PAIR_COOLDOWN_ROUNDS - 1,
    });
    expect(r.ok).toBe(false);
  });

  it("allows same pair after cooldown rounds", () => {
    const q = {
      ...baseQuest(),
      betrayal_pvp: {
        ...defaultBetrayalPvpMeta(),
        last_pair_round: { "p1:p2": 5 },
      },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "p1",
      victimPlayerId: "p2",
      currentRound: 5 + BETRAYAL_PAIR_COOLDOWN_ROUNDS,
    });
    expect(r.ok).toBe(true);
  });

  it("treats pair key as unordered", () => {
    const q = {
      ...baseQuest(),
      betrayal_pvp: {
        ...defaultBetrayalPvpMeta(),
        last_pair_round: { "p1:p2": 3 },
      },
    };
    const r = evaluateBetrayalPvpGate({
      betrayalMode: "confrontational",
      betrayalPhase: "confronting",
      quest: q,
      attackerPlayerId: "p2",
      victimPlayerId: "p1",
      currentRound: 4,
    });
    expect(r.ok).toBe(false);
  });
});

describe("recordBetrayalPvpClash", () => {
  it("increments clash count, initiations, and last pair round", () => {
    const q = baseQuest();
    const next = recordBetrayalPvpClash(q, "p1", "p2", 7);
    expect(next.clashes_this_arc).toBe(1);
    expect(next.initiations_by_player.p1).toBe(1);
    expect(next.last_pair_round["p1:p2"]).toBe(7);
  });
});

describe("resetBetrayalPvpForNewArc", () => {
  it("clears arc counters and pair rounds", () => {
    const meta = {
      ...defaultBetrayalPvpMeta(),
      clashes_this_arc: 2,
      initiations_by_player: { a: 3 },
      last_pair_round: { "a:b": 1 },
    };
    const next = resetBetrayalPvpForNewArc(meta);
    expect(next.clashes_this_arc).toBe(0);
    expect(next.last_pair_round).toEqual({});
    expect(next.initiations_by_player.a).toBe(3);
  });
});

describe("normalizeBetrayalPvpMeta", () => {
  it("returns undefined for invalid input", () => {
    expect(normalizeBetrayalPvpMeta(null)).toBeUndefined();
    expect(normalizeBetrayalPvpMeta("x")).toBeUndefined();
  });
});
