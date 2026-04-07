import { describe, expect, it } from "vitest";

import {
  AwaitingDmEventSchema,
  PvpDefenseChallengeEventSchema,
} from "@/lib/schemas/events";

describe("AwaitingDmEventSchema", () => {
  it("accepts awaiting-dm payload with betrayal briefing", () => {
    const parsed = AwaitingDmEventSchema.safeParse({
      turn_id: "11111111-1111-4111-8111-111111111111",
      acting_player_id: "22222222-2222-4222-8222-222222222222",
      betrayal_briefing: {
        spine: "mode=confrontational; phase=confronting",
        prompts: ["Accusation or ultimatum in the open."],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts awaiting-dm payload without betrayal briefing", () => {
    const parsed = AwaitingDmEventSchema.safeParse({
      turn_id: "11111111-1111-4111-8111-111111111111",
      acting_player_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("PvpDefenseChallengeEventSchema", () => {
  it("parses pvp-defense-challenge payload", () => {
    const parsed = PvpDefenseChallengeEventSchema.safeParse({
      turn_id: "11111111-1111-4111-8111-111111111111",
      attacker_player_id: "22222222-2222-4222-8222-222222222222",
      defender_player_id: "33333333-3333-4333-8333-333333333333",
      round_number: 2,
    });
    expect(parsed.success).toBe(true);
  });
});
