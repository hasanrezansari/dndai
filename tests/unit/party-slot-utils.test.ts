import { describe, expect, it } from "vitest";

import {
  applyForgeryPointsFromGuesses,
  seededShuffle,
} from "@/lib/party/party-slot-utils";
import type { PartyConfigV1 } from "@/lib/schemas/party";

describe("seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    const a = [1, 2, 3, 4, 5];
    expect(seededShuffle(a, "session-1")).toEqual(
      seededShuffle([...a], "session-1"),
    );
  });
});

describe("applyForgeryPointsFromGuesses", () => {
  it("awards +1 when guess matches instigator slot", () => {
    const cfg = {
      instigator_slot_id: "s-fake",
      forgery_guesses: {
        "00000000-0000-4000-8000-000000000001": "s-fake",
        "00000000-0000-4000-8000-000000000002": "s-other",
      },
      fp_totals: {},
    } as unknown as PartyConfigV1;
    const fp = applyForgeryPointsFromGuesses(cfg);
    expect(
      fp["00000000-0000-4000-8000-000000000001"],
    ).toBe(1);
    expect(
      fp["00000000-0000-4000-8000-000000000002"],
    ).toBeUndefined();
  });
});
