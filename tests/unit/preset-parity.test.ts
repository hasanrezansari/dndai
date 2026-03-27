import { describe, expect, it } from "vitest";

import {
  calculateAC,
  calculateHP,
  calculateMana,
  getStartingAbilities,
  getStartingEquipment,
} from "@/lib/rules/character";

describe("preset class parity regression", () => {
  it("keeps warrior baseline stats and kit stable", () => {
    expect(calculateHP("warrior", 2)).toEqual({ hp: 12, maxHp: 12 });
    expect(calculateAC("warrior", 1)).toBe(16);
    expect(calculateMana("warrior", 0)).toEqual({ mana: 2, maxMana: 2 });

    expect(getStartingEquipment("warrior")).toEqual([
      { name: "Longsword", type: "weapon" },
      { name: "Shield", type: "armor" },
      { name: "Chain mail", type: "armor" },
    ]);
    expect(getStartingAbilities("warrior")).toEqual([
      { name: "Second Wind", type: "feature" },
      { name: "Fighting Style", type: "feature" },
    ]);
  });

  it("keeps mage baseline stats and kit stable", () => {
    expect(calculateHP("mage", -1)).toEqual({ hp: 5, maxHp: 5 });
    expect(calculateAC("mage", 2)).toBe(12);
    expect(calculateMana("mage", 3)).toEqual({ mana: 17, maxMana: 17 });

    expect(getStartingEquipment("mage")).toEqual([
      { name: "Staff", type: "weapon" },
      { name: "Spellbook", type: "focus" },
      { name: "Robes", type: "armor" },
    ]);
    expect(getStartingAbilities("mage")).toEqual([
      { name: "Arcane Recovery", type: "feature" },
      { name: "Spellcasting", type: "feature" },
    ]);
  });

  it("keeps paladin baseline stats and kit stable", () => {
    expect(calculateHP("paladin", 1)).toEqual({ hp: 11, maxHp: 11 });
    expect(calculateAC("paladin", 0)).toBe(16);
    expect(calculateMana("paladin", 2)).toEqual({ mana: 8, maxMana: 8 });

    expect(getStartingEquipment("paladin")).toEqual([
      { name: "Greatsword", type: "weapon" },
      { name: "Chain mail", type: "armor" },
      { name: "Holy symbol", type: "focus" },
    ]);
    expect(getStartingAbilities("paladin")).toEqual([
      { name: "Lay on Hands", type: "feature" },
      { name: "Divine Sense", type: "feature" },
    ]);
  });
});

