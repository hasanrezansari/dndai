import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  authUsers,
  friendEdges,
  friendRequests,
  narrativeEvents,
  players,
  sessions,
} from "@/lib/db/schema";

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

export type FriendRequestView = {
  id: string;
  fromUserId: string;
  fromName: string;
  fromImage: string | null;
  toUserId: string;
  toName: string;
  toImage: string | null;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
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

export async function removeFriendEdge(params: { userId: string; friendUserId: string }) {
  await db
    .delete(friendEdges)
    .where(and(eq(friendEdges.user_id, params.userId), eq(friendEdges.friend_user_id, params.friendUserId)));
}

export async function listFriendRequestsForUser(params: {
  userId: string;
}): Promise<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }> {
  const incomingRows = await db
    .select({
      req: friendRequests,
      fromName: authUsers.name,
      fromImage: authUsers.image,
    })
    .from(friendRequests)
    .innerJoin(authUsers, eq(authUsers.id, friendRequests.from_user_id))
    .where(and(eq(friendRequests.to_user_id, params.userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.created_at));

  const outgoingRows = await db
    .select({
      req: friendRequests,
      toName: authUsers.name,
      toImage: authUsers.image,
    })
    .from(friendRequests)
    .innerJoin(authUsers, eq(authUsers.id, friendRequests.to_user_id))
    .where(and(eq(friendRequests.from_user_id, params.userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.created_at));

  return {
    incoming: incomingRows.map((r) => ({
      id: r.req.id,
      fromUserId: r.req.from_user_id,
      fromName: r.fromName ?? "Adventurer",
      fromImage: r.fromImage ?? null,
      toUserId: r.req.to_user_id,
      toName: "You",
      toImage: null,
      status: "pending",
      createdAt: r.req.created_at.toISOString(),
    })),
    outgoing: outgoingRows.map((r) => ({
      id: r.req.id,
      fromUserId: r.req.from_user_id,
      fromName: "You",
      fromImage: null,
      toUserId: r.req.to_user_id,
      toName: r.toName ?? "Adventurer",
      toImage: r.toImage ?? null,
      status: "pending",
      createdAt: r.req.created_at.toISOString(),
    })),
  };
}

/**
 * Send a friend request. If the other user already requested you (pending),
 * auto-accept and create mutual friend edges.
 */
export async function sendFriendRequest(params: { userId: string; toUserId: string }) {
  if (params.userId === params.toUserId) return { status: "noop" as const };

  // Already friends?
  const existingFriend = await db
    .select({ n: count() })
    .from(friendEdges)
    .where(and(eq(friendEdges.user_id, params.userId), eq(friendEdges.friend_user_id, params.toUserId)));
  if (Number(existingFriend[0]?.n ?? 0) > 0) {
    return { status: "already_friends" as const };
  }

  // If they already requested me, accept.
  const [reverse] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.from_user_id, params.toUserId),
        eq(friendRequests.to_user_id, params.userId),
        eq(friendRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (reverse) {
    await db.transaction(async (tx) => {
      await tx
        .update(friendRequests)
        .set({ status: "accepted", responded_at: new Date() })
        .where(eq(friendRequests.id, reverse.id));
      await tx
        .insert(friendEdges)
        .values([
          { user_id: params.userId, friend_user_id: params.toUserId, created_at: new Date() },
          { user_id: params.toUserId, friend_user_id: params.userId, created_at: new Date() },
        ])
        .onConflictDoNothing();
    });
    return { status: "accepted" as const };
  }

  // If I already sent one, no-op.
  const [existingReq] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.from_user_id, params.userId),
        eq(friendRequests.to_user_id, params.toUserId),
        eq(friendRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existingReq) {
    return { status: "already_pending" as const, requestId: existingReq.id };
  }

  const [created] = await db
    .insert(friendRequests)
    .values({
      from_user_id: params.userId,
      to_user_id: params.toUserId,
      status: "pending",
      created_at: new Date(),
    })
    .returning();
  return { status: "pending" as const, requestId: created?.id ?? null };
}

export async function respondToFriendRequest(params: {
  userId: string;
  requestId: string;
  action: "accept" | "decline";
}) {
  const [req] = await db
    .select()
    .from(friendRequests)
    .where(eq(friendRequests.id, params.requestId))
    .limit(1);
  if (!req) return { ok: false as const, reason: "not_found" as const };
  if (req.to_user_id !== params.userId) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (req.status !== "pending") {
    return { ok: true as const, status: req.status as "accepted" | "declined" };
  }

  if (params.action === "decline") {
    await db
      .update(friendRequests)
      .set({ status: "declined", responded_at: new Date() })
      .where(eq(friendRequests.id, req.id));
    return { ok: true as const, status: "declined" as const };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(friendRequests)
      .set({ status: "accepted", responded_at: new Date() })
      .where(eq(friendRequests.id, req.id));
    await tx
      .insert(friendEdges)
      .values([
        { user_id: req.from_user_id, friend_user_id: req.to_user_id, created_at: new Date() },
        { user_id: req.to_user_id, friend_user_id: req.from_user_id, created_at: new Date() },
      ])
      .onConflictDoNothing();
  });

  return { ok: true as const, status: "accepted" as const };
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

