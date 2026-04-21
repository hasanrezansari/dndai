import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { processExpiredTurnForSession } from "@/server/services/turn-service";

/**
 * Debounced heartbeat: marks the current user’s seat connected without full `/state` hydrate.
 */
export async function PATCH(
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

    try {
      await processExpiredTurnForSession(sessionId);
    } catch (err) {
      console.error("[presence] timeout tick failed:", err);
    }

    await db
      .update(players)
      .set({
        is_connected: true,
        is_away: false,
        last_seen_at: new Date(),
      })
      .where(
        and(eq(players.session_id, sessionId), eq(players.user_id, user.id)),
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
