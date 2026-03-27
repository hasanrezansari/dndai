import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { isCustomClassesEnabled } from "@/lib/config/features";
import {
  authUsers,
  characters,
  narrativeEvents,
  npcStates,
  players,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { computeNextPlayableTurnState } from "@/lib/rules/turn-logic";
import {
  CharacterStatsSchema,
  ClassProfileSchema,
  type CharacterStats,
  type ClassProfile,
} from "@/lib/schemas/domain";
import { questProgressForModel } from "@/lib/quest-display";
import { getQuestState } from "@/server/services/quest-service";

export interface PartyMemberInfo {
  playerId: string;
  name: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  conditions: string[];
}

export interface NpcDetail {
  id: string;
  name: string;
  status: string;
  attitude: string;
}

export interface TurnContext {
  session: {
    mode: string;
    phase: string;
    campaignTitle: string | null;
    adventurePrompt: string | null;
    currentRound: number;
  };
  player: { id: string; seatIndex: number; isHost: boolean };
  character: {
    name: string;
    class: string;
    mechanicalClass: string;
    race: string;
    stats: CharacterStats;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    conditions: string[];
    pronouns: string;
    traits: string[];
    backstory: string;
    appearance: string;
    classProfile: ClassProfile | null;
    classIdentitySummary: string;
  };
  recentEvents: string[];
  currentSceneDescription: string | null;
  allPlayerNames: string[];
  allCharacterSummaries: string[];
  partyMembers: PartyMemberInfo[];
  npcDetails: NpcDetail[];
  questContext: string | null;
  npcContext: string | null;
  npcIds: Array<{ id: string; name: string }>;
  nextPlayerName: string;
  nextPlayerId: string;
  roundAdvanced: boolean;
}

function displayNameForPlayerRow(row: {
  player: typeof players.$inferSelect;
  character: typeof characters.$inferSelect | null;
  userName?: string | null;
}): string {
  return row.character?.name ?? row.userName ?? `Seat ${row.player.seat_index + 1}`;
}

function isCharacterIncapacitated(row: typeof characters.$inferSelect | null): boolean {
  if (!row) return false;
  if (row.hp <= 0) return true;
  const conditions = Array.isArray(row.conditions) ? row.conditions : [];
  const lowered = conditions.map((c) => c.toLowerCase());
  return (
    lowered.includes("dead") ||
    lowered.includes("unconscious") ||
    lowered.includes("incapacitated")
  );
}

export async function buildTurnContext({
  sessionId,
  playerId,
  turnId: _turnId,
}: {
  sessionId: string;
  playerId: string;
  turnId: string;
}): Promise<TurnContext> {
  const customClassesEnabled = isCustomClassesEnabled();
  void _turnId;
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new Error("Session not found");
  }

  const orderedPlayers = await db
    .select()
    .from(players)
    .where(eq(players.session_id, sessionId))
    .orderBy(asc(players.seat_index));

  const playerRow = orderedPlayers.find((p) => p.id === playerId);
  if (!playerRow) {
    throw new Error("Player not found");
  }

  const [charRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.player_id, playerId))
    .limit(1);
  if (!charRow) {
    throw new Error("Character not found");
  }

  const stats = CharacterStatsSchema.parse(charRow.stats);

  const narrativeRows = await db
    .select({ scene_text: narrativeEvents.scene_text })
    .from(narrativeEvents)
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(5);

  const recentEvents = narrativeRows.map((r) => r.scene_text).reverse();

  const [snapRow] = await db
    .select({ summary: sceneSnapshots.summary })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  const currentSceneDescription = snapRow?.summary?.trim() || null;

  const playerCharacterPairs = await Promise.all(
    orderedPlayers.map(async (p) => {
      const [c] = await db
        .select()
        .from(characters)
        .where(eq(characters.player_id, p.id))
        .limit(1);
      const [u] = await db
        .select({ name: authUsers.name })
        .from(authUsers)
        .where(eq(authUsers.id, p.user_id))
        .limit(1);
      return { player: p, character: c ?? null, userName: u?.name ?? null };
    }),
  );

  const allPlayerNames = playerCharacterPairs.map((row) =>
    displayNameForPlayerRow(row),
  );

  const seatOrder = playerCharacterPairs.map((pair) => ({
    id: pair.player.id,
    is_dm: pair.player.is_dm,
    seat_index: pair.player.seat_index,
    is_incapacitated: isCharacterIncapacitated(pair.character),
  }));
  const { nextPlayerId, roundAdvanced } = computeNextPlayableTurnState({
    orderedBySeat: seatOrder,
    sessionMode: sessionRow.mode,
    currentPlayerId: playerId,
    currentRound: sessionRow.current_round,
  });
  const nextRow = playerCharacterPairs.find((x) => x.player.id === nextPlayerId);
  const nextPlayerName = nextRow
    ? displayNameForPlayerRow(nextRow)
    : "Adventurer";

  const vp = (charRow.visual_profile ?? {}) as Record<string, unknown>;
  const pronouns = typeof vp.pronouns === "string" ? vp.pronouns : "they/them";
  const traits = Array.isArray(vp.traits) ? vp.traits.map(String) : [];
  const backstory = typeof vp.backstory === "string" ? vp.backstory : "";
  const appearance =
    typeof vp.appearance === "string"
      ? vp.appearance
      : Array.isArray(vp.look)
        ? vp.look.map(String).join(", ")
        : typeof vp.description === "string"
          ? vp.description
          : "";
  const classProfileRaw = vp.class_profile;
  const classProfileParsed = ClassProfileSchema.safeParse(classProfileRaw);
  const classProfile =
    customClassesEnabled && classProfileParsed.success ? classProfileParsed.data : null;
  const mechanicalClass =
    customClassesEnabled &&
    typeof vp.mechanical_class === "string" &&
    vp.mechanical_class.trim()
      ? vp.mechanical_class.trim().toLowerCase()
      : charRow.class;
  const classIdentitySummary = classProfile
    ? `${classProfile.display_name} (${classProfile.combat_role}, ${classProfile.resource_model})`
    : `${charRow.race} ${charRow.class}`;

  const allCharacterSummaries = playerCharacterPairs.map((row) => {
    const c = row.character;
    const label = displayNameForPlayerRow(row);
    if (!c) return `${label} (no character)`;
    const cvp = (c.visual_profile ?? {}) as Record<string, unknown>;
    const cpro = typeof cvp.pronouns === "string" ? cvp.pronouns : "they/them";
    const classProfileParsed = ClassProfileSchema.safeParse(cvp.class_profile);
    const classLabel = customClassesEnabled && classProfileParsed.success
      ? classProfileParsed.data.display_name
      : `${c.race} ${c.class}`;
    return `${c.name} (${classLabel}, HP ${c.hp}/${c.max_hp}, ${cpro})`;
  });

  const quest = await getQuestState(sessionId);
  let questContext: string | null = null;
  if (quest) {
    questContext = questProgressForModel(quest);
  }

  const npcRows = await db
    .select()
    .from(npcStates)
    .where(eq(npcStates.session_id, sessionId));

  const activeNpcs = npcRows.filter((n) => n.status !== "dead");
  let npcContext: string | null = null;
  const npcIds = npcRows.map((n) => ({ id: n.id, name: n.name }));
  const npcDetails: NpcDetail[] = npcRows.map((n) => ({
    id: n.id,
    name: n.name,
    status: n.status,
    attitude: n.attitude,
  }));
  if (activeNpcs.length > 0) {
    npcContext = activeNpcs
      .map((n) => `${n.name} (${n.role}, ${n.attitude}, at ${n.location})${n.notes ? ` — ${n.notes}` : ""}`)
      .join("; ");
  }

  const partyMembers: PartyMemberInfo[] = playerCharacterPairs
    .filter((row) => row.character && !row.player.is_dm)
    .map((row) => ({
      playerId: row.player.id,
      name: row.character!.name,
      hp: row.character!.hp,
      maxHp: row.character!.max_hp,
      mana: row.character!.mana,
      maxMana: row.character!.max_mana,
      conditions: Array.isArray(row.character!.conditions)
        ? row.character!.conditions.map(String)
        : [],
    }));

  return {
    session: {
      mode: sessionRow.mode,
      phase: sessionRow.phase,
      campaignTitle: sessionRow.campaign_title,
      adventurePrompt: sessionRow.adventure_prompt,
      currentRound: sessionRow.current_round,
    },
    player: {
      id: playerRow.id,
      seatIndex: playerRow.seat_index,
      isHost: playerRow.is_host,
    },
    character: {
      name: charRow.name,
      class: charRow.class,
      mechanicalClass,
      race: charRow.race,
      stats,
      hp: charRow.hp,
      maxHp: charRow.max_hp,
      mana: charRow.mana,
      maxMana: charRow.max_mana,
      conditions: Array.isArray(charRow.conditions) ? charRow.conditions.map(String) : [],
      pronouns,
      traits,
      backstory,
      appearance,
      classProfile,
      classIdentitySummary,
    },
    recentEvents,
    currentSceneDescription,
    allPlayerNames,
    allCharacterSummaries,
    partyMembers,
    npcDetails,
    questContext,
    npcContext,
    npcIds,
    nextPlayerName,
    nextPlayerId,
    roundAdvanced,
  };
}
