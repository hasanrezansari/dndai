import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { narrativeEvents, sessions, turns } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { assertHumanSessionDm, DmAuthError } from "@/server/services/dm-auth";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  eventText: z.string().min(1).max(8000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    try {
      await assertHumanSessionDm(
        sessionId,
        parsed.data.playerId,
        user.id,
      );
    } catch (e) {
      if (e instanceof DmAuthError) {
        return apiError(e.message, 403);
      }
      throw e;
    }

    const [sessionRow] = await db
      .select({
        current_player_id: sessions.current_player_id,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const actorId = sessionRow?.current_player_id;
    if (!actorId) {
      return apiError("No current actor on session", 409);
    }

    const text = parsed.data.eventText.trim();

    const [inserted] = await db
      .insert(narrativeEvents)
      .values({
        session_id: sessionId,
        turn_id: null,
        scene_text: text,
        visible_changes: [],
        tone: "neutral",
        next_actor_id: actorId,
        image_hint: {},
      })
      .returning({ id: narrativeEvents.id });

    if (!inserted) {
      return apiError("Failed to record event", 500);
    }

    const [openTurn] = await db
      .select({ id: turns.id, round_number: turns.round_number })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          inArray(turns.status, ["awaiting_input", "processing", "awaiting_dm"]),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);

    try {
      await broadcastToSession(sessionId, "narration-update", {
        scene_text: text,
        visible_changes: [],
        next_actor: { player_id: actorId },
        event_type: "dm_event",
        ...(openTurn
          ? { turn_id: openTurn.id, round_number: openTurn.round_number }
          : {}),
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
