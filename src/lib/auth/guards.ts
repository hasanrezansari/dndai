import { and, eq } from "drizzle-orm";

import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";

import { getCurrentUser } from "./session";

export function unauthorizedResponse() {
  return apiError("Unauthorized", 401);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user;
}

export async function isSessionMember(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(eq(players.session_id, sessionId), eq(players.user_id, userId)),
    )
    .limit(1);
  return Boolean(row);
}

export async function isPlayerForUser(
  playerId: string,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.id, playerId),
        eq(players.session_id, sessionId),
        eq(players.user_id, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export function internalBearerAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  const h = request.headers.get("authorization");
  return h === `Bearer ${secret}`;
}
