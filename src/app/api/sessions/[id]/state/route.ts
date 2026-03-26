import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
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
import { mapNpcRowToCombatantView } from "@/lib/state/npc-combatant-mapper";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import type {
  FeedEntry,
  GamePlayerView,
  GameSessionView,
  NpcCombatantView,
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
      c.visual_profile && typeof c.visual_profile === "object" && !Array.isArray(c.visual_profile)
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    await db
      .update(players)
      .set({ is_connected: true })
      .where(
        and(eq(players.session_id, sessionId), eq(players.user_id, user.id)),
      );

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!sessionRow) {
      return apiError("Not found", 404);
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

    const chronological = [...narrativeRows].reverse();
    const feed: FeedEntry[] = chronological.map(({ ev, turn_round }) => ({
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
    }));

    const latestNarrative = narrativeRows[0];
    const narrativeText = latestNarrative?.ev.scene_text ?? null;

    const [latestScene] = await db
      .select()
      .from(sceneSnapshots)
      .where(eq(sceneSnapshots.session_id, sessionId))
      .orderBy(desc(sceneSnapshots.created_at))
      .limit(1);

    const rawSceneImage = latestScene?.image_url ?? null;
    const sceneImage =
      rawSceneImage?.startsWith("data:") && latestScene
        ? `/api/sessions/${sessionId}/scene-image/${latestScene.id}`
        : rawSceneImage;
    /** If a URL exists, the scene is visible — don’t keep “painting” UX on reload. */
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

    return NextResponse.json({
      session: mappedSession,
      players: mappedPlayers,
      npcs,
      feed,
      sceneImage,
      sceneTitle,
      narrativeText,
      scenePending,
      dmAwaiting,
      quest,
      rollingMemories,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
