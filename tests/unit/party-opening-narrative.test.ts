import { describe, expect, it } from "vitest";

import {
  buildPartySubmitSceneText,
  partyToneLineFromTags,
} from "@/lib/party/party-opening-narrative";

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
