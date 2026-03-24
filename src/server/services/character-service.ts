import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { characters, players } from "@/lib/db/schema";
import type { Character, CharacterStats } from "@/lib/schemas/domain";
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

  const conMod = modifier(params.stats.con);
  const dexMod = modifier(params.stats.dex);
  const spellMod =
    params.characterClass.trim().toLowerCase() === "cleric"
      ? modifier(params.stats.wis)
      : modifier(params.stats.int);

  const { hp, maxHp } = calculateHP(params.characterClass, conMod);
  const ac = calculateAC(params.characterClass, dexMod);
  const { mana, maxMana } = calculateMana(params.characterClass, spellMod);
  const inventory = getStartingEquipment(params.characterClass);
  const abilities = getStartingAbilities(params.characterClass);

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(characters)
      .values({
        player_id: params.playerId,
        name: params.name.trim(),
        class: params.characterClass.trim().toLowerCase(),
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
        visual_profile: {},
      })
      .returning({ id: characters.id });

    if (!created) {
      throw new Error("Failed to create character");
    }

    await tx
      .update(players)
      .set({
        character_id: created.id,
        is_ready: true,
      })
      .where(eq(players.id, params.playerId));

    return created.id;
  });

  return { characterId: result };
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
