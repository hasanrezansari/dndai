import { describe, expect, it } from "vitest";

import { getStartingEquipment } from "@/lib/rules/character";
import {
  getStartingEquipmentForPack,
  getStartingEquipmentForPremise,
} from "@/lib/rules/gear-presets";
import { getRacesForPremise } from "@/lib/rules/race-presets";

describe("premise-aware starting gear", () => {
  it("keeps fantasy pack identical to legacy getStartingEquipment", () => {
    for (const cls of ["warrior", "ranger", "mage", "rogue", "cleric", "paladin"]) {
      expect(getStartingEquipmentForPack(cls, "fantasy")).toEqual(
        getStartingEquipment(cls),
      );
    }
  });

  it("renames items per pack but preserves item types (warrior)", () => {
    const fantasy = getStartingEquipmentForPack("warrior", "fantasy");
    const sci = getStartingEquipmentForPack("warrior", "sci_fi");
    expect(sci.map((i) => i.type)).toEqual(fantasy.map((i) => i.type));
    expect(sci[0]!.name).not.toBe(fantasy[0]!.name);
  });

  it("infers sci-fi from prompt for premise helper", () => {
    const kit = getStartingEquipmentForPremise("mage", {
      adventure_prompt: "Aboard a derelict starship",
      adventure_tags: [],
      world_bible: null,
    });
    expect(kit.map((i) => i.type)).toEqual(
      getStartingEquipmentForPack("mage", "sci_fi").map((i) => i.type),
    );
    expect(kit[0]!.name).toContain("baton");
  });
});

describe("premise-aware race labels", () => {
  it("keeps stable values, varies labels for sci-fi", () => {
    const base = getRacesForPremise({});
    const sci = getRacesForPremise({
      adventure_prompt: "cyberpunk neon orbital station",
      adventure_tags: [],
      world_bible: null,
    });
    expect(base.map((r) => r.value)).toEqual(sci.map((r) => r.value));
    expect(base.find((r) => r.value === "human")!.label).toBe("Human");
    expect(sci.find((r) => r.value === "human")!.label).toContain("Terran");
  });
});
