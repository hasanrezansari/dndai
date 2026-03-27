import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { characters, players } from "@/lib/db/schema";
import {
  type Character,
  type CharacterStats,
  type ClassProfile,
} from "@/lib/schemas/domain";
import {
  calculateAC,
  calculateHP,
  calculateMana,
  getStartingAbilities,
  getStartingEquipment,
  rollStats,
} from "@/lib/rules/character";

export class PlayerNotFoundForCharacterError extends Error {
  constructor() {
    super("Player not found for session");
    this.name = "PlayerNotFoundForCharacterError";
  }
}

export class CharacterAlreadyExistsError extends Error {
  constructor() {
    super("Character already exists");
    this.name = "CharacterAlreadyExistsError";
  }
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function mapRoleToPresetClass(role: ClassProfile["combat_role"]): string {
  switch (role) {
    case "frontline":
      return "warrior";
    case "skirmisher":
      return "ranger";
    case "arcane":
      return "mage";
    case "support":
      return "cleric";
    case "guardian":
      return "paladin";
    case "specialist":
      return "rogue";
    default:
      return "warrior";
  }
}

function resolveMechanicalClass(params: {
  characterClass: string;
  classProfile?: ClassProfile;
}): string {
  if (params.classProfile?.source === "custom") {
    return mapRoleToPresetClass(params.classProfile.combat_role);
  }
  return params.characterClass;
}

function profileStartingEquipment(classProfile?: ClassProfile): Character["inventory"] | null {
  if (!classProfile || classProfile.starting_gear.length === 0) return null;
  return classProfile.starting_gear.map((gear) => ({
    name: gear.name,
    type: gear.type,
  }));
}

function profileStartingAbilities(classProfile?: ClassProfile): Character["abilities"] | null {
  if (!classProfile || classProfile.abilities.length === 0) return null;
  return classProfile.abilities.map((ability) => ({
    name: ability.name,
    type: ability.effect_kind,
    ability_type: ability.type,
    resource_cost: ability.resource_cost,
    cooldown: ability.cooldown,
  }));
}

function mapCharacterRow(row: typeof characters.$inferSelect): Character {
  const stats = row.stats as CharacterStats;
  return {
    id: row.id,
    player_id: row.player_id,
    name: row.name,
    class: row.class,
    race: row.race,
    level: row.level,
    stats,
    hp: row.hp,
    max_hp: row.max_hp,
    ac: row.ac,
    mana: row.mana,
    max_mana: row.max_mana,
    inventory: row.inventory as Character["inventory"],
    abilities: row.abilities as Character["abilities"],
    conditions: row.conditions,
    visual_profile: row.visual_profile as Character["visual_profile"],
    created_at: row.created_at.toISOString(),
  };
}

export async function rollNewStats(): Promise<CharacterStats> {
  return rollStats();
}

export async function createCharacter(params: {
  playerId: string;
  sessionId: string;
  name: string;
  characterClass: string;
  race: string;
  stats: CharacterStats;
  pronouns?: string;
  traits?: string[];
  backstory?: string;
  appearance?: string;
  classProfile?: ClassProfile;
}): Promise<{ characterId: string }> {
  const [player] = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.id, params.playerId),
        eq(players.session_id, params.sessionId),
      ),
    )
    .limit(1);
  if (!player) {
    throw new PlayerNotFoundForCharacterError();
  }
  if (player.character_id) {
    throw new CharacterAlreadyExistsError();
  }

  const normalizedClass = params.characterClass.trim().toLowerCase();
  const mechanicalClass = resolveMechanicalClass({
    characterClass: normalizedClass,
    classProfile: params.classProfile,
  });

  const conMod = modifier(params.stats.con);
  const dexMod = modifier(params.stats.dex);
  const spellMod =
    mechanicalClass === "cleric"
      ? modifier(params.stats.wis)
      : modifier(params.stats.int);

  const { hp, maxHp } = calculateHP(mechanicalClass, conMod);
  const ac = calculateAC(mechanicalClass, dexMod);
  const { mana, maxMana } = calculateMana(mechanicalClass, spellMod);
  const inventory =
    profileStartingEquipment(params.classProfile) ??
    getStartingEquipment(mechanicalClass);
  const abilities =
    profileStartingAbilities(params.classProfile) ??
    getStartingAbilities(mechanicalClass);

  const [created] = await db
    .insert(characters)
    .values({
      player_id: params.playerId,
      name: params.name.trim(),
      class: normalizedClass,
      race: params.race.trim().toLowerCase(),
      level: 1,
      stats: params.stats,
      hp,
      max_hp: maxHp,
      ac,
      mana,
      max_mana: maxMana,
      inventory,
      abilities,
      conditions: [],
      visual_profile: {
        pronouns: params.pronouns?.trim() || "they/them",
        traits: (params.traits ?? []).filter(Boolean).slice(0, 5),
        backstory: (params.backstory ?? "").trim().slice(0, 500),
        appearance: (params.appearance ?? "").trim().slice(0, 220),
        class_profile: params.classProfile ?? null,
        mechanical_class: mechanicalClass,
      },
    })
    .returning({ id: characters.id });

  if (!created) {
    throw new Error("Failed to create character");
  }

  await db
    .update(players)
    .set({
      character_id: created.id,
      is_ready: true,
    })
    .where(eq(players.id, params.playerId));

  return { characterId: created.id };
}

export async function getCharacter(characterId: string): Promise<Character | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  if (!row) return null;
  return mapCharacterRow(row);
}
