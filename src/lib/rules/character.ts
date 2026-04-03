import { getStartingEquipmentForPack } from "@/lib/rules/gear-presets";

export const CLASSES = [
  {
    value: "warrior",
    label: "Warrior",
    icon: "⚔",
    imageUrl: "/art/classes/warrior.png",
    role: "Frontline",
    fantasy: "Steel-clad vanguard who breaks enemy lines.",
  },
  {
    value: "ranger",
    label: "Ranger",
    icon: "🏹",
    imageUrl: "/art/classes/ranger.png",
    role: "Skirmisher",
    fantasy: "Tracker and archer who controls distance.",
  },
  {
    value: "mage",
    label: "Mage",
    icon: "✦",
    imageUrl: "/art/classes/mage.png",
    role: "Arcane",
    fantasy: "Spellcaster shaping the battlefield with magic.",
  },
  {
    value: "rogue",
    label: "Rogue",
    icon: "◆",
    imageUrl: "/art/classes/rogue.png",
    role: "Stealth",
    fantasy: "Shadow operative striking where defenses are weak.",
  },
  {
    value: "cleric",
    label: "Cleric",
    icon: "✚",
    imageUrl: "/art/classes/cleric.png",
    role: "Support",
    fantasy: "Divine guide who protects and restores allies.",
  },
  {
    value: "paladin",
    label: "Paladin",
    icon: "☀",
    imageUrl: "/art/classes/paladin.png",
    role: "Guardian",
    fantasy: "Holy champion blending defense and judgment.",
  },
] as const;

export const RACES = [
  { value: "human", label: "Human" },
  { value: "elf", label: "Elf" },
  { value: "dwarf", label: "Dwarf" },
  { value: "halfling", label: "Halfling" },
  { value: "half_orc", label: "Half-Orc" },
  { value: "tiefling", label: "Tiefling" },
] as const;

export type CharacterClass = (typeof CLASSES)[number]["value"];
export type CharacterRace = (typeof RACES)[number]["value"];

/** Canonical preset keys; custom free-text is stored as-is (trimmed, whitespace collapsed). */
export const PRESET_RACE_SET = new Set<string>(RACES.map((r) => r.value));

/** Max length for custom race text (presets are shorter). */
export const CHARACTER_RACE_MAX_LEN = 48;

export type NormalizeCharacterRaceResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Preset names (any casing) normalize to lowercase snake keys.
 * Any other non-empty string becomes custom display text (casing preserved).
 */
export function normalizeCharacterRace(raw: string): NormalizeCharacterRaceResult {
  const t = raw.trim();
  if (!t) return { ok: false, error: "Race is required" };
  if (t === "__custom__") {
    return { ok: false, error: "Invalid race" };
  }
  const asPreset = t.toLowerCase();
  if (PRESET_RACE_SET.has(asPreset)) {
    return { ok: true, value: asPreset };
  }
  const collapsed = t.replace(/\s+/g, " ");
  if (collapsed.length > CHARACTER_RACE_MAX_LEN) {
    return {
      ok: false,
      error: `Race must be at most ${CHARACTER_RACE_MAX_LEN} characters`,
    };
  }
  return { ok: true, value: collapsed };
}

export type RolledStats = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

export type StartingItem = { name: string; type: string };

export type StartingAbility = { name: string; type: string };

function rollD6(): number {
  const buf = new Uint8Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % 6) + 1;
}

function roll4d6DropLowest(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()];
  rolls.sort((a, b) => b - a);
  return rolls[0]! + rolls[1]! + rolls[2]!;
}

export function rollStats(): RolledStats {
  return {
    str: roll4d6DropLowest(),
    dex: roll4d6DropLowest(),
    con: roll4d6DropLowest(),
    int: roll4d6DropLowest(),
    wis: roll4d6DropLowest(),
    cha: roll4d6DropLowest(),
  };
}

function normClass(c: string): string {
  return c.trim().toLowerCase();
}

export function getStartingEquipment(characterClass: string): StartingItem[] {
  return getStartingEquipmentForPack(characterClass, "fantasy");
}

export function getStartingAbilities(characterClass: string): StartingAbility[] {
  switch (normClass(characterClass)) {
    case "warrior":
      return [
        { name: "Second Wind", type: "feature" },
        { name: "Fighting Style", type: "feature" },
      ];
    case "ranger":
      return [
        { name: "Favored Enemy", type: "feature" },
        { name: "Natural Explorer", type: "feature" },
      ];
    case "mage":
      return [
        { name: "Arcane Recovery", type: "feature" },
        { name: "Spellcasting", type: "feature" },
      ];
    case "rogue":
      return [
        { name: "Sneak Attack", type: "feature" },
        { name: "Cunning Action", type: "feature" },
      ];
    case "cleric":
      return [
        { name: "Channel Divinity", type: "feature" },
        { name: "Spellcasting", type: "feature" },
      ];
    case "paladin":
      return [
        { name: "Lay on Hands", type: "feature" },
        { name: "Divine Sense", type: "feature" },
      ];
    default:
      return [];
  }
}

export function calculateHP(
  characterClass: string,
  conModifier: number,
): { hp: number; maxHp: number } {
  const c = normClass(characterClass);
  let dieMax = 8;
  if (c === "warrior" || c === "ranger" || c === "paladin") dieMax = 10;
  if (c === "mage") dieMax = 6;
  const maxHp = Math.max(1, dieMax + conModifier);
  return { hp: maxHp, maxHp };
}

export function calculateAC(characterClass: string, dexModifier: number): number {
  const c = normClass(characterClass);
  const dex = dexModifier;
  if (c === "warrior" || c === "paladin") return 16;
  if (c === "cleric") return 14 + Math.min(2, dex);
  if (c === "ranger" || c === "rogue") return 11 + dex;
  if (c === "mage") return 10 + dex;
  return 10 + dex;
}

export function calculateMana(
  characterClass: string,
  intModifier: number,
): { mana: number; maxMana: number } {
  const c = normClass(characterClass);
  const m = intModifier;
  let maxMana = 4;
  if (c === "mage") maxMana = 8 + m * 3;
  else if (c === "cleric") maxMana = 6 + m * 2;
  else if (c === "paladin") maxMana = 4 + m * 2;
  else if (c === "ranger") maxMana = 4 + m * 2;
  else if (c === "rogue") maxMana = 3 + m;
  else maxMana = 2 + m;
  maxMana = Math.max(0, maxMana);
  return { mana: maxMana, maxMana };
}
