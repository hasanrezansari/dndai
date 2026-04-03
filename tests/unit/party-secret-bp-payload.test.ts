import { describe, expect, it } from "vitest";

import { partyConfigForSessionPayload } from "@/lib/schemas/party";

describe("partyConfigForSessionPayload secret BP (ended only)", () => {
  const partyRaw = {
    version: 1,
    template_key: "default",
    party_phase: "ended",
    round_index: 6,
    total_rounds: 6,
    carry_forward: null,
    submissions: {},
    votes_this_round: {},
    vp_totals: {},
    fp_totals: {},
    merged_beat: null,
    scene_image_url: null,
    instigator_enabled: false,
  };

  const secretsRaw = {
    version: 1,
    assignments: {},
    secret_bp_totals: {
      "00000000-0000-4000-8000-0000000000aa": 2,
    },
  };

  it("does not expose secret BP before game end", () => {
    const v = partyConfigForSessionPayload(
      { ...partyRaw, party_phase: "submit", round_index: 1 },
      { partySecretsRaw: secretsRaw },
    );
    expect(v?.secretBpTotals).toBeUndefined();
  });

  it("exposes secret_bp_totals when ended", () => {
    const v = partyConfigForSessionPayload(partyRaw, {
      partySecretsRaw: secretsRaw,
    });
    expect(v?.secretBpTotals?.["00000000-0000-4000-8000-0000000000aa"]).toBe(
      2,
    );
  });
});
