import { describe, expect, it } from "vitest";

import {
  buildPartySessionNarrativeText,
  buildPartySubmitHintAfterAiOpener,
  buildPartySubmitSceneText,
  partyToneLineFromTags,
} from "@/lib/party/party-opening-narrative";
import type { PartyConfigV1 } from "@/lib/schemas/party";

describe("partyToneLineFromTags", () => {
  it("maps horror tag id to label", () => {
    expect(partyToneLineFromTags(["horror"])).toContain("Horror");
  });
});

describe("buildPartySubmitSceneText", () => {
  it("uses tone when prompt and bible are empty", () => {
    const s = buildPartySubmitSceneText({
      adventurePrompt: null,
      adventureTags: ["horror"],
      worldBible: null,
      roundMilestone: "Establish the situation and tone.",
    });
    expect(s).toContain("Horror");
    expect(s).toContain("Establish the situation");
  });

  it("prefers explicit prompt over tags", () => {
    const s = buildPartySubmitSceneText({
      adventurePrompt: "Haunted lighthouse.",
      adventureTags: ["horror"],
      worldBible: null,
      roundMilestone: "Focus.",
    });
    expect(s).toContain("Haunted lighthouse");
    expect(s).not.toMatch(/^Table tone:/);
  });
});

function basePartyCfg(over: Partial<PartyConfigV1>): PartyConfigV1 {
  return {
    version: 1,
    template_key: "default",
    party_phase: "submit",
    round_index: 1,
    total_rounds: 6,
    shared_role_label: null,
    carry_forward: null,
    phase_deadline_iso: null,
    submissions: {},
    votes_this_round: {},
    vp_totals: {},
    merged_beat: null,
    round_scene_beat: null,
    scene_image_url: null,
    instigator_enabled: false,
    ...over,
  } as PartyConfigV1;
}

describe("buildPartySubmitHintAfterAiOpener", () => {
  it("includes CTA and optional milestone", () => {
    const h = buildPartySubmitHintAfterAiOpener({
      roundMilestone: "Raise the stakes.",
    });
    expect(h).toContain("Raise the stakes");
    expect(h).toContain("Everyone adds one line");
  });
});

describe("buildPartySessionNarrativeText", () => {
  it("submit phase uses AI opener + hint when round_scene_beat set", () => {
    const text = buildPartySessionNarrativeText({
      partyPhase: "submit",
      sessionRow: {
        adventure_prompt: "Space station blackout.",
        adventure_tags: ["horror"],
        world_bible: null,
      },
      partyConfig: basePartyCfg({
        round_scene_beat: "The lights stutter. Something moves in the bulkhead.",
      }),
    });
    expect(text).toContain("lights stutter");
    expect(text).toContain("Everyone adds one line");
    expect(text).not.toContain("Space station blackout");
  });

  it("submit phase falls back to seed block when no opener", () => {
    const text = buildPartySessionNarrativeText({
      partyPhase: "submit",
      sessionRow: {
        adventure_prompt: "Desert outpost.",
        adventure_tags: null,
        world_bible: null,
      },
      partyConfig: basePartyCfg({ round_scene_beat: null }),
    });
    expect(text).toContain("Desert outpost");
  });
});
