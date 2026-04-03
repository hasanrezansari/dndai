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

/** Non-empty trimmed secrets allowed for internal Bearer routes (either may be set in prod). */
export function getInternalBearerSecrets(): string[] {
  const raw = [process.env.INTERNAL_API_SECRET, process.env.NEXTAUTH_SECRET];
  const trimmed = raw
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));
  return [...new Set(trimmed)];
}

export function internalBearerAuthorized(request: Request): boolean {
  const secrets = getInternalBearerSecrets();
  if (secrets.length === 0) return false;
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const token = h.slice(7).trim();
  return secrets.some((s) => token === s);
}
