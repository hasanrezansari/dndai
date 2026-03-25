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
  characters,
  narrativeEvents,
  players,
  sceneSnapshots,
  sessions,
  turns,
} from "@/lib/db/schema";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import type { FeedEntry, GamePlayerView, GameSessionView } from "@/lib/state/game-store";

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
  };
}

function mapPlayerRow(
  p: typeof players.$inferSelect,
  c: typeof characters.$inferSelect | null,
): GamePlayerView {
  const base: GamePlayerView = {
    id: p.id,
    userId: p.user_id,
    characterId: p.character_id,
    seatIndex: p.seat_index,
    isReady: p.is_ready,
    isConnected: p.is_connected,
    isHost: p.is_host,
    isDm: p.is_dm,
  };
  if (c) {
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
      })
      .from(players)
      .leftJoin(characters, eq(characters.player_id, players.id))
      .where(eq(players.session_id, sessionId));

    const mappedPlayers = playerRows
      .map((r) => mapPlayerRow(r.player, r.character))
      .sort((a, b) => a.seatIndex - b.seatIndex);

    const narrativeRows = await db
      .select()
      .from(narrativeEvents)
      .where(eq(narrativeEvents.session_id, sessionId))
      .orderBy(desc(narrativeEvents.created_at))
      .limit(20);

    const chronological = [...narrativeRows].reverse();
    const feed: FeedEntry[] = chronological.map((ev) => ({
      id: ev.id,
      type: "narration" as const,
      text: ev.scene_text,
      detail:
        ev.visible_changes.length > 0
          ? ev.visible_changes.join(" · ")
          : undefined,
      timestamp: ev.created_at.toISOString(),
    }));

    const latestNarrative = narrativeRows[0];
    const narrativeText = latestNarrative?.scene_text ?? null;

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
    const scenePending =
      latestScene?.image_status === "pending" ||
      latestScene?.image_status === "generating";
    const sceneTitle =
      latestScene?.summary.split("\n")[0]?.trim() ??
      sessionRow.campaign_title ??
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

    return NextResponse.json({
      session: mapSession(sessionRow),
      players: mappedPlayers,
      feed,
      sceneImage,
      sceneTitle,
      narrativeText,
      scenePending,
      dmAwaiting,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
