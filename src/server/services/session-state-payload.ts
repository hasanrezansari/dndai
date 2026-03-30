import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  authUsers,
  characters,
  memorySummaries,
  narrativeEvents,
  npcStates,
  players,
  sceneSnapshots,
  sessions,
  turns,
} from "@/lib/db/schema";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import { mapNpcRowToCombatantView } from "@/lib/state/npc-combatant-mapper";
import type {
  FeedEntry,
  GamePlayerView,
  GameSessionView,
  NpcCombatantView,
  SessionStatePayload,
} from "@/lib/state/game-store";
import { getQuestState } from "@/server/services/quest-service";

const DEFAULT_STATS = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
} as const;

function mapSession(row: typeof sessions.$inferSelect): GameSessionView {
  return {
    status: row.status,
    mode: row.mode,
    phase: row.phase,
    currentRound: row.current_round,
    currentTurnIndex: row.current_turn_index,
    currentPlayerId: row.current_player_id,
    campaignTitle: row.campaign_title,
    stateVersion: row.state_version,
    finalChapterPublished: false,
  };
}

function mapPlayerRow(
  p: typeof players.$inferSelect,
  c: typeof characters.$inferSelect | null,
  displayName: string | null,
): GamePlayerView {
  const base: GamePlayerView = {
    id: p.id,
    userId: p.user_id,
    displayName: displayName?.trim() || undefined,
    characterId: p.character_id,
    seatIndex: p.seat_index,
    isReady: p.is_ready,
    isConnected: p.is_connected,
    isHost: p.is_host,
    isDm: p.is_dm,
  };
  if (c) {
    const visualProfile =
      c.visual_profile &&
      typeof c.visual_profile === "object" &&
      !Array.isArray(c.visual_profile)
        ? (c.visual_profile as Record<string, unknown>)
        : {};
    const portraitRaw = visualProfile.portrait_url;
    const portraitUrl =
      typeof portraitRaw === "string" && portraitRaw.trim().length > 0
        ? portraitRaw
        : undefined;
    const statsParsed = CharacterStatsSchema.safeParse(c.stats);
    const stats = statsParsed.success ? statsParsed.data : { ...DEFAULT_STATS };
    const inventory = Array.isArray(c.inventory)
      ? (c.inventory as Array<Record<string, unknown>>)
      : [];
    const abilities = Array.isArray(c.abilities)
      ? (c.abilities as Array<Record<string, unknown>>)
      : [];
    const conditions = Array.isArray(c.conditions) ? c.conditions : [];
    base.character = {
      name: c.name,
      class: c.class,
      race: c.race,
      level: c.level,
      hp: c.hp,
      maxHp: c.max_hp,
      mana: c.mana,
      maxMana: c.max_mana,
      ac: c.ac,
      stats,
      inventory,
      abilities,
      conditions,
      portraitUrl,
    };
  }
  return base;
}

/**
 * Read-only snapshot for gameplay hydrate and room display (no presence writes).
 */
export async function loadSessionStatePayload(
  sessionId: string,
): Promise<SessionStatePayload | null> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    return null;
  }

  const playerRows = await db
    .select({
      player: players,
      character: characters,
      userName: authUsers.name,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .leftJoin(authUsers, eq(authUsers.id, players.user_id))
    .where(eq(players.session_id, sessionId));

  const mappedPlayers = playerRows
    .map((r) => mapPlayerRow(r.player, r.character, r.userName))
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const narrativeRows = await db
    .select({
      ev: narrativeEvents,
      turn_round: turns.round_number,
    })
    .from(narrativeEvents)
    .leftJoin(turns, eq(turns.id, narrativeEvents.turn_id))
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(20);

  const snapshotRows = await db
    .select()
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(asc(sceneSnapshots.created_at));

  const latestScene =
    snapshotRows.length > 0
      ? snapshotRows[snapshotRows.length - 1]!
      : undefined;

  function sceneImageServingUrl(
    snap: typeof sceneSnapshots.$inferSelect,
  ): string | undefined {
    const raw = snap.image_url;
    if (!raw?.trim()) return undefined;
    return raw.startsWith("data:")
      ? `/api/sessions/${sessionId}/scene-image/${snap.id}`
      : raw;
  }

  const chronological = [...narrativeRows].reverse();
  const feed: FeedEntry[] = chronological.map(({ ev, turn_round }) => {
    const snap = snapshotRows.find(
      (s) =>
        s.created_at >= ev.created_at &&
        typeof s.image_url === "string" &&
        s.image_url.trim().length > 0,
    );
    const imageUrl = snap ? sceneImageServingUrl(snap) : undefined;
    return {
      id: ev.id,
      type: "narration" as const,
      text: ev.scene_text,
      detail:
        ev.visible_changes.length > 0
          ? ev.visible_changes.join(" · ")
          : undefined,
      timestamp: ev.created_at.toISOString(),
      turnId: ev.turn_id ?? undefined,
      roundNumber: turn_round ?? undefined,
      ...(imageUrl ? { imageUrl } : {}),
    };
  });

  const latestNarrative = narrativeRows[0];
  const narrativeText = latestNarrative?.ev.scene_text ?? null;

  const rawSceneImage = latestScene?.image_url ?? null;
  const sceneImage =
    rawSceneImage?.startsWith("data:") && latestScene
      ? `/api/sessions/${sessionId}/scene-image/${latestScene.id}`
      : rawSceneImage;
  const sceneStatusPending =
    latestScene?.image_status === "pending" ||
    latestScene?.image_status === "generating";
  const scenePending = Boolean(rawSceneImage) ? false : sceneStatusPending;
  const sceneTitle =
    sessionRow.campaign_title?.trim() ||
    latestScene?.summary.split("\n")[0]?.trim() ||
    null;

  const [dmAwaitingRow] = await db
    .select({
      id: turns.id,
      player_id: turns.player_id,
    })
    .from(turns)
    .where(
      and(eq(turns.session_id, sessionId), eq(turns.status, "awaiting_dm")),
    )
    .orderBy(desc(turns.started_at))
    .limit(1);

  const dmAwaiting = dmAwaitingRow
    ? {
        turnId: dmAwaitingRow.id,
        actingPlayerId: dmAwaitingRow.player_id,
      }
    : null;

  let activeTurnId: string | null = null;
  if (sessionRow.current_player_id) {
    const [awaitingTurnRow] = await db
      .select({ id: turns.id })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          eq(turns.status, "awaiting_input"),
          eq(turns.player_id, sessionRow.current_player_id),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    activeTurnId = awaitingTurnRow?.id ?? null;
  }
  if (!activeTurnId) {
    const [processingTurnRow] = await db
      .select({ id: turns.id })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          eq(turns.status, "processing"),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    activeTurnId = processingTurnRow?.id ?? null;
  }
  if (!activeTurnId && dmAwaitingRow) {
    activeTurnId = dmAwaitingRow.id;
  }

  const [finalChapterRow] = await db
    .select({ id: narrativeEvents.id })
    .from(narrativeEvents)
    .where(
      and(
        eq(narrativeEvents.session_id, sessionId),
        eq(narrativeEvents.tone, "epilogue"),
      ),
    )
    .orderBy(desc(narrativeEvents.created_at))
    .limit(1);

  const quest = await getQuestState(sessionId);
  const mappedSession = mapSession(sessionRow);
  mappedSession.finalChapterPublished = Boolean(finalChapterRow);

  const summaryRows = await db
    .select({
      id: memorySummaries.id,
      summary_type: memorySummaries.summary_type,
      content: memorySummaries.content,
      turn_range_start: memorySummaries.turn_range_start,
      turn_range_end: memorySummaries.turn_range_end,
      created_at: memorySummaries.created_at,
    })
    .from(memorySummaries)
    .where(eq(memorySummaries.session_id, sessionId))
    .orderBy(desc(memorySummaries.created_at))
    .limit(10);

  const rollingMemories = summaryRows
    .filter((r) => r.summary_type === "rolling")
    .map((r) => ({
      id: r.id,
      turnRangeStart: r.turn_range_start,
      turnRangeEnd: r.turn_range_end,
      content: r.content as {
        key_events?: string[];
        active_hooks?: string[];
        npc_relationships?: string[];
        world_changes?: string[];
      },
      createdAt: r.created_at.toISOString(),
    }));

  const npcRows = await db
    .select()
    .from(npcStates)
    .where(eq(npcStates.session_id, sessionId));
  const npcs: NpcCombatantView[] = npcRows.map(mapNpcRowToCombatantView);

  return {
    session: mappedSession,
    players: mappedPlayers,
    npcs,
    feed,
    sceneImage,
    sceneTitle,
    narrativeText,
    scenePending,
    dmAwaiting,
    activeTurnId,
    quest,
    rollingMemories,
  };
}
