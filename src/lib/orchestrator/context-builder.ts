import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  characters,
  narrativeEvents,
  players,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { computeNextPlayableTurnState } from "@/lib/rules/turn-logic";
import { CharacterStatsSchema, type CharacterStats } from "@/lib/schemas/domain";
import { getQuestState } from "@/server/services/quest-service";

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
    race: string;
    stats: CharacterStats;
    hp: number;
    mana: number;
    pronouns: string;
    traits: string[];
    backstory: string;
  };
  recentEvents: string[];
  currentSceneDescription: string | null;
  allPlayerNames: string[];
  allCharacterSummaries: string[];
  questContext: string | null;
  nextPlayerName: string;
  nextPlayerId: string;
  roundAdvanced: boolean;
}

function displayNameForPlayerRow(row: {
  player: typeof players.$inferSelect;
  character: typeof characters.$inferSelect | null;
}): string {
  return row.character?.name ?? `Seat ${row.player.seat_index + 1}`;
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
      return { player: p, character: c ?? null };
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

  const allCharacterSummaries = playerCharacterPairs.map((row) => {
    const c = row.character;
    if (!c) return `${displayNameForPlayerRow(row)} (no character)`;
    const cvp = (c.visual_profile ?? {}) as Record<string, unknown>;
    const cpro = typeof cvp.pronouns === "string" ? cvp.pronouns : "they/them";
    return `${c.name} (${c.race} ${c.class}, HP ${c.hp}/${c.max_hp}, ${cpro})`;
  });

  const quest = await getQuestState(sessionId);
  let questContext: string | null = null;
  if (quest) {
    questContext = `Objective: ${quest.objective} | Progress: ${quest.progress}% | Danger: ${quest.risk}% | Status: ${quest.status}`;
  }

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
      race: charRow.race,
      stats,
      hp: charRow.hp,
      mana: charRow.mana,
      pronouns,
      traits,
      backstory,
    },
    recentEvents,
    currentSceneDescription,
    allPlayerNames,
    allCharacterSummaries,
    questContext,
    nextPlayerName,
    nextPlayerId,
    roundAdvanced,
  };
}
