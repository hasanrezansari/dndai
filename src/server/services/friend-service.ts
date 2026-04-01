import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { authUsers, friendEdges, narrativeEvents, players, sessions } from "@/lib/db/schema";

export type FriendView = {
  userId: string;
  name: string;
  image: string | null;
  addedAt: string;
};

export type PlayedWithUser = {
  userId: string;
  name: string;
  image: string | null;
  lastActivityAt: string;
  sharedSessions: number;
};

export async function listFriendsForUser(userId: string): Promise<FriendView[]> {
  const rows = await db
    .select({
      userId: authUsers.id,
      name: authUsers.name,
      image: authUsers.image,
      addedAt: friendEdges.created_at,
    })
    .from(friendEdges)
    .innerJoin(authUsers, eq(authUsers.id, friendEdges.friend_user_id))
    .where(eq(friendEdges.user_id, userId))
    .orderBy(desc(friendEdges.created_at));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? "Adventurer",
    image: r.image ?? null,
    addedAt: r.addedAt.toISOString(),
  }));
}

export async function addFriendEdge(params: { userId: string; friendUserId: string }) {
  if (params.userId === params.friendUserId) return;
  await db
    .insert(friendEdges)
    .values({
      user_id: params.userId,
      friend_user_id: params.friendUserId,
      created_at: new Date(),
    })
    .onConflictDoNothing();
}

export async function removeFriendEdge(params: { userId: string; friendUserId: string }) {
  await db
    .delete(friendEdges)
    .where(and(eq(friendEdges.user_id, params.userId), eq(friendEdges.friend_user_id, params.friendUserId)));
}

/**
 * Suggest co-players: users who shared a session with me.
 */
export async function listPlayedWithUsers(params: {
  userId: string;
  limit?: number;
}): Promise<PlayedWithUser[]> {
  const limit = Math.max(1, Math.min(50, params.limit ?? 20));

  // Sessions I'm in
  const mySessionRows = await db
    .select({ sessionId: players.session_id })
    .from(players)
    .where(eq(players.user_id, params.userId));
  const sessionIds = mySessionRows.map((r) => r.sessionId);
  if (sessionIds.length === 0) return [];

  // Co-players within those sessions
  const rows = await db
    .select({
      userId: authUsers.id,
      name: authUsers.name,
      image: authUsers.image,
      sharedSessions: count(players.session_id),
      lastActivityAt: max(narrativeEvents.created_at),
    })
    .from(players)
    .innerJoin(authUsers, eq(authUsers.id, players.user_id))
    .leftJoin(sessions, eq(sessions.id, players.session_id))
    .leftJoin(narrativeEvents, eq(narrativeEvents.session_id, players.session_id))
    .where(
      and(
        inArray(players.session_id, sessionIds),
        // exclude self
        sql`${players.user_id} <> ${params.userId}`,
      ),
    )
    .groupBy(authUsers.id, authUsers.name, authUsers.image)
    .orderBy(desc(max(narrativeEvents.created_at)), desc(count(players.session_id)))
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? "Adventurer",
    image: r.image ?? null,
    lastActivityAt: (r.lastActivityAt ?? new Date(0)).toISOString(),
    sharedSessions: Number(r.sharedSessions ?? 0),
  }));
}

