import {
  and,
  count,
  desc,
  eq,
  exists,
  inArray,
  max,
  notExists,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  narrativeEvents,
  players,
  sessions,
  userHiddenSessions,
} from "@/lib/db/schema";

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

const hiddenPredicate = (userId: string) =>
  exists(
    db
      .select()
      .from(userHiddenSessions)
      .where(
        and(
          eq(userHiddenSessions.user_id, userId),
          eq(userHiddenSessions.session_id, sessions.id),
        ),
      ),
  );

const notHiddenPredicate = (userId: string) =>
  notExists(
    db
      .select()
      .from(userHiddenSessions)
      .where(
        and(
          eq(userHiddenSessions.user_id, userId),
          eq(userHiddenSessions.session_id, sessions.id),
        ),
      ),
  );

async function adventureRowsForUser(
  userId: string,
  hidden: "visible" | "hidden",
) {
  const visibility =
    hidden === "hidden"
      ? hiddenPredicate(userId)
      : notHiddenPredicate(userId);

  return db
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
    .where(and(eq(players.user_id, userId), visibility))
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
}

async function mapRowsToAdventures(
  rows: Awaited<ReturnType<typeof adventureRowsForUser>>,
): Promise<AdventureListItem[]> {
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

export async function listAdventuresForUser(
  userId: string,
): Promise<AdventureListItem[]> {
  const rows = await adventureRowsForUser(userId, "visible");
  return mapRowsToAdventures(rows);
}

/** Sessions the user hid from My Adventures (same item shape as the main list). */
export async function listHiddenAdventuresForUser(
  userId: string,
): Promise<AdventureListItem[]> {
  const rows = await adventureRowsForUser(userId, "hidden");
  return mapRowsToAdventures(rows);
}

export async function hideAdventureForUser(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .insert(userHiddenSessions)
    .values({ user_id: userId, session_id: sessionId })
    .onConflictDoNothing();
}

export async function unhideAdventureForUser(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .delete(userHiddenSessions)
    .where(
      and(
        eq(userHiddenSessions.user_id, userId),
        eq(userHiddenSessions.session_id, sessionId),
      ),
    );
}
