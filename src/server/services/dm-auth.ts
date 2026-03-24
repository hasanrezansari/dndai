import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";

export class DmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DmAuthError";
  }
}

export async function assertHumanSessionDm(
  sessionId: string,
  playerId: string,
  authUserId: string,
): Promise<void> {
  const [sessionRow] = await db
    .select({ mode: sessions.mode })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow || sessionRow.mode !== "human_dm") {
    throw new DmAuthError("Session is not in human DM mode");
  }
  const [playerRow] = await db
    .select({ is_dm: players.is_dm, user_id: players.user_id })
    .from(players)
    .where(
      and(
        eq(players.id, playerId),
        eq(players.session_id, sessionId),
      ),
    )
    .limit(1);
  if (
    !playerRow?.is_dm ||
    playerRow.user_id !== authUserId
  ) {
    throw new DmAuthError("Player is not the DM");
  }
}
