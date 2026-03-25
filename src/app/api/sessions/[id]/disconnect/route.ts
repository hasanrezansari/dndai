import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";

const BodySchema = z.object({
  playerId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const [row] = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.id, parsed.data.playerId),
          eq(players.session_id, sessionId),
          eq(players.user_id, user.id),
        ),
      )
      .limit(1);

    if (!row) return apiError("Forbidden", 403);

    await db
      .update(players)
      .set({ is_connected: false })
      .where(eq(players.id, parsed.data.playerId));

    try {
      await broadcastToSession(sessionId, "player-disconnected", {
        player_id: parsed.data.playerId,
      });
    } catch (err) {
      console.error("[disconnect] broadcast failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
