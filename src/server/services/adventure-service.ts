import { count, desc, eq, inArray, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { narrativeEvents, players, sessions } from "@/lib/db/schema";

export type AdventureListItem = {
  sessionId: string;
  joinCode: string;
  status: string;
  mode: string;
  phase: string;
  campaignTitle: string | null;
  updatedAt: string;
  lastActivityAt: string;
  playerCount: number;
  isHost: boolean;
};

export async function listAdventuresForUser(
  userId: string,
): Promise<AdventureListItem[]> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      joinCode: sessions.join_code,
      status: sessions.status,
      mode: sessions.mode,
      phase: sessions.phase,
      campaignTitle: sessions.campaign_title,
      updatedAt: sessions.updated_at,
      lastNarrativeAt: max(narrativeEvents.created_at),
      playerCount: count(players.id),
      isHost: players.is_host,
    })
    .from(players)
    .innerJoin(sessions, eq(players.session_id, sessions.id))
    .leftJoin(narrativeEvents, eq(narrativeEvents.session_id, sessions.id))
    .where(eq(players.user_id, userId))
    .groupBy(
      sessions.id,
      sessions.join_code,
      sessions.status,
      sessions.mode,
      sessions.phase,
      sessions.campaign_title,
      sessions.updated_at,
      players.is_host,
    )
    .orderBy(desc(max(narrativeEvents.created_at)), desc(sessions.updated_at));

  // The `count(players.id)` above will only count the current user's player row due
  // to the `from(players) where players.user_id = ...`. So we do a second query
  // to compute playerCount per session efficiently.
  const sessionIds = rows.map((r) => r.sessionId);
  if (sessionIds.length === 0) return [];

  const countRows = await db
    .select({ sessionId: players.session_id, value: count() })
    .from(players)
    .where(inArray(players.session_id, sessionIds))
    .groupBy(players.session_id);

  const countBySession = new Map<string, number>(
    countRows.map((r) => [r.sessionId, Number(r.value ?? 0)]),
  );

  return rows.map((r) => {
    const last = r.lastNarrativeAt ?? r.updatedAt;
    return {
      sessionId: r.sessionId,
      joinCode: r.joinCode,
      status: r.status,
      mode: r.mode,
      phase: r.phase,
      campaignTitle: r.campaignTitle,
      updatedAt: r.updatedAt.toISOString(),
      lastActivityAt: last.toISOString(),
      playerCount: countBySession.get(r.sessionId) ?? 0,
      isHost: Boolean(r.isHost),
    };
  });
}

