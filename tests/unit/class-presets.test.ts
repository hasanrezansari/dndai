import { describe, expect, it } from "vitest";

import {
  getPresetClassesForPremise,
  inferPresetPackFromPremise,
} from "@/lib/rules/class-presets";

describe("class-presets", () => {
  it("infers sci-fi from premise text", () => {
    expect(inferPresetPackFromPremise("generation ship and laser arrays")).toBe(
      "sci_fi",
    );
  });

  it("infers modern from noir / urban cues", () => {
    expect(inferPresetPackFromPremise("noir detective in the subway")).toBe(
      "modern",
    );
  });

  it("infers horror from tone words", () => {
    expect(inferPresetPackFromPremise("eldritch cult in a haunted manor")).toBe(
      "horror",
    );
  });

  it("infers fantasy from classic cues", () => {
    expect(inferPresetPackFromPremise("dragon and knight at the castle")).toBe(
      "fantasy",
    );
  });

  it("defaults to neutral when unclear", () => {
    expect(inferPresetPackFromPremise("")).toBe("neutral");
    expect(inferPresetPackFromPremise("a story about choices")).toBe("neutral");
  });

  it("keeps mechanical values stable across packs", () => {
    const sci = getPresetClassesForPremise({
      adventure_prompt: "starship salvage",
    });
    const neu = getPresetClassesForPremise({ adventure_prompt: "" });
    expect(sci.map((c) => c.value).sort()).toEqual(neu.map((c) => c.value).sort());
    expect(sci[0]!.label).not.toBe(neu[0]!.label);
  });
});
