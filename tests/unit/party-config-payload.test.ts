import { describe, expect, it } from "vitest";

import { partyConfigForSessionPayload } from "@/lib/schemas/party";

describe("partyConfigForSessionPayload", () => {
  const raw = {
    version: 1,
    template_key: "default",
    party_phase: "forgery_guess",
    round_index: 1,
    total_rounds: 6,
    carry_forward: null,
    submissions: {},
    votes_this_round: {},
    vp_totals: {},
    fp_totals: {},
    merged_beat: "beat",
    scene_image_url: null,
    instigator_enabled: true,
    instigator_slot_id: "fake-slot",
    slot_attribution: { "fake-slot": "forgery", "real-slot": "player" },
    submission_slots_public: [
      { slot_id: "fake-slot", text: "x" },
      { slot_id: "real-slot", text: "y" },
    ],
    forgery_guesses: {},
    phase_deadline_iso: new Date().toISOString(),
  };

  it("hides slot attribution before reveal", () => {
    const v = partyConfigForSessionPayload(raw);
    expect(v?.submissionSlots?.length).toBe(2);
    expect(v?.slotAttribution).toBeUndefined();
    expect(v?.revealedForgerySlotId).toBeUndefined();
  });

  it("exposes attribution in reveal phase", () => {
    const v = partyConfigForSessionPayload({
      ...raw,
      party_phase: "reveal",
    });
    expect(v?.slotAttribution?.["fake-slot"]).toBe("forgery");
    expect(v?.revealedForgerySlotId).toBe("fake-slot");
  });
});
