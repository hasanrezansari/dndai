import {
  buildPremiseFingerprint,
  inferPresetPackFromPremise,
  type PresetPackId,
} from "@/lib/rules/class-presets";

/** Same shape as `StartingItem` in character rules — `type` drives mechanics. */
export type PremiseGearItem = { name: string; type: string };

function normClass(c: string): string {
  return c.trim().toLowerCase();
}

/** Preset loadouts: fantasy matches legacy `getStartingEquipment`; other packs rename only. */
const GEAR_BY_PACK: Record<PresetPackId, Record<string, PremiseGearItem[]>> = {
  fantasy: {
    warrior: [
      { name: "Longsword", type: "weapon" },
      { name: "Shield", type: "armor" },
      { name: "Chain mail", type: "armor" },
    ],
    ranger: [
      { name: "Longbow", type: "weapon" },
      { name: "Short sword", type: "weapon" },
      { name: "Leather armor", type: "armor" },
    ],
    mage: [
      { name: "Staff", type: "weapon" },
      { name: "Spellbook", type: "focus" },
      { name: "Robes", type: "armor" },
    ],
    rogue: [
      { name: "Daggers (2)", type: "weapon" },
      { name: "Thieves' tools", type: "tool" },
      { name: "Leather armor", type: "armor" },
    ],
    cleric: [
      { name: "Mace", type: "weapon" },
      { name: "Shield", type: "armor" },
      { name: "Scale mail", type: "armor" },
      { name: "Holy symbol", type: "focus" },
    ],
    paladin: [
      { name: "Greatsword", type: "weapon" },
      { name: "Chain mail", type: "armor" },
      { name: "Holy symbol", type: "focus" },
    ],
  },
  sci_fi: {
    warrior: [
      { name: "Monomolecular blade", type: "weapon" },
      { name: "Hardlight buckler", type: "armor" },
      { name: "Assault plating", type: "armor" },
    ],
    ranger: [
      { name: "Mag-rail carbine", type: "weapon" },
      { name: "Sidearm", type: "weapon" },
      { name: "Vac-rated light suit", type: "armor" },
    ],
    mage: [
      { name: "Focus baton", type: "weapon" },
      { name: "Arcane datapad", type: "focus" },
      { name: "Sensor-weave coat", type: "armor" },
    ],
    rogue: [
      { name: "Mono-knives (2)", type: "weapon" },
      { name: "Bypass kit", type: "tool" },
      { name: "Stealth weave", type: "armor" },
    ],
    cleric: [
      { name: "Shock baton", type: "weapon" },
      { name: "Portable barrier", type: "armor" },
      { name: "Ablative vest", type: "armor" },
      { name: "Chaplain sigil", type: "focus" },
    ],
    paladin: [
      { name: "Grav blade", type: "weapon" },
      { name: "Combat chassis", type: "armor" },
      { name: "Oath insignia", type: "focus" },
    ],
  },
  modern: {
    warrior: [
      { name: "Tactical baton", type: "weapon" },
      { name: "Riot shield", type: "armor" },
      { name: "Plate carrier", type: "armor" },
    ],
    ranger: [
      { name: "Scoped rifle", type: "weapon" },
      { name: "Combat knife", type: "weapon" },
      { name: "Tactical jacket", type: "armor" },
    ],
    mage: [
      { name: "Weighted cane", type: "weapon" },
      { name: "Field tablet", type: "focus" },
      { name: "Layered streetwear", type: "armor" },
    ],
    rogue: [
      { name: "Compact blades (2)", type: "weapon" },
      { name: "Lockpick set", type: "tool" },
      { name: "Dark clothes", type: "armor" },
    ],
    cleric: [
      { name: "Heavy flashlight", type: "weapon" },
      { name: "Ballistic shield", type: "armor" },
      { name: "Concealed vest", type: "armor" },
      { name: "ID medallion", type: "focus" },
    ],
    paladin: [
      { name: "Breaching shotgun", type: "weapon" },
      { name: "Trauma plates", type: "armor" },
      { name: "Badge of office", type: "focus" },
    ],
  },
  horror: {
    warrior: [
      { name: "Fire axe", type: "weapon" },
      { name: "Splintered door", type: "armor" },
      { name: "Layered coats", type: "armor" },
    ],
    ranger: [
      { name: "Hunting shotgun", type: "weapon" },
      { name: "Bowie knife", type: "weapon" },
      { name: "Waxed duster", type: "armor" },
    ],
    mage: [
      { name: "Iron-shod staff", type: "weapon" },
      { name: "Ritual journal", type: "focus" },
      { name: "Tattered robes", type: "armor" },
    ],
    rogue: [
      { name: "Razor pair", type: "weapon" },
      { name: "Pry bar & wire", type: "tool" },
      { name: "Stained leathers", type: "armor" },
    ],
    cleric: [
      { name: "Iron rod", type: "weapon" },
      { name: "Broken pew", type: "armor" },
      { name: "Thick wool & mail", type: "armor" },
      { name: "Blessed charm", type: "focus" },
    ],
    paladin: [
      { name: "Rust-cleaver", type: "weapon" },
      { name: "Scrap-mail", type: "armor" },
      { name: "Coal-etched token", type: "focus" },
    ],
  },
  neutral: {
    warrior: [
      { name: "Primary arm", type: "weapon" },
      { name: "Shield", type: "armor" },
      { name: "Heavy armor", type: "armor" },
    ],
    ranger: [
      { name: "Ranged arm", type: "weapon" },
      { name: "Sidearm", type: "weapon" },
      { name: "Light armor", type: "armor" },
    ],
    mage: [
      { name: "Focus implement", type: "weapon" },
      { name: "Reference kit", type: "focus" },
      { name: "Light garments", type: "armor" },
    ],
    rogue: [
      { name: "Paired blades", type: "weapon" },
      { name: "Entry kit", type: "tool" },
      { name: "Light armor", type: "armor" },
    ],
    cleric: [
      { name: "Striking arm", type: "weapon" },
      { name: "Shield", type: "armor" },
      { name: "Medium armor", type: "armor" },
      { name: "Emblem", type: "focus" },
    ],
    paladin: [
      { name: "Heavy arm", type: "weapon" },
      { name: "Reinforced armor", type: "armor" },
      { name: "Sacred token", type: "focus" },
    ],
  },
};

export function getStartingEquipmentForPack(
  characterClass: string,
  pack: PresetPackId,
): PremiseGearItem[] {
  const c = normClass(characterClass);
  const row = GEAR_BY_PACK[pack][c];
  return row ? [...row] : [];
}

export function getStartingEquipmentForPremise(
  characterClass: string,
  params: {
    adventure_prompt?: string | null;
    adventure_tags?: string[] | null;
    world_bible?: string | null;
  },
): PremiseGearItem[] {
  const pack = inferPresetPackFromPremise(buildPremiseFingerprint(params));
  return getStartingEquipmentForPack(characterClass, pack);
}
